/**
 * Danh mục sản phẩm/công việc theo vị trí việc làm (docs/05 "Danh mục theo vị trí việc làm"):
 * mỗi người chỉ xem mục của VTVL mình; xem toàn bộ, phân danh mục cần quyền; phiếu chấm theo VTVL đối tượng.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../../src/lib/prisma.js';
import { appliesByDefault } from '../../prisma/seed/job-position-work-items.js';
import {
  TEST_DATABASE_URL,
  createFixture,
  createTestDb,
  login,
  type Fixture,
  type Session,
} from '../helpers/fixture.js';
import { buildDbTestApp } from '../helpers/test-app.js';

type Name = 'officer' | 'ptbA' | 'headA' | 'staffA1' | 'headB';

describe('Phân danh mục mặc định theo nhóm (hàm thuần)', () => {
  it('A → lãnh đạo; B → dùng chung; C → chuyên môn; D → tất cả trừ D.002, D.004', () => {
    const a = { code: 'A.001', groupCode: 'A' };
    expect(appliesByDefault(a, 'LEADERSHIP')).toBe(true);
    expect(appliesByDefault(a, 'PROFESSIONAL')).toBe(false);
    expect(appliesByDefault({ code: 'B.001', groupCode: 'B' }, 'SHARED_SUPPORT')).toBe(true);
    expect(appliesByDefault({ code: 'C.001', groupCode: 'C' }, 'LEADERSHIP')).toBe(false);
    expect(appliesByDefault({ code: 'C.001', groupCode: 'C' }, 'PROFESSIONAL')).toBe(true);
    expect(appliesByDefault({ code: 'D.001', groupCode: 'D' }, 'LEADERSHIP')).toBe(true);
    expect(appliesByDefault({ code: 'D.002', groupCode: 'D' }, 'LEADERSHIP')).toBe(false);
    expect(appliesByDefault({ code: 'D.004', groupCode: 'D' }, 'SHARED_SUPPORT')).toBe(true);
  });
});

describe.skipIf(!TEST_DATABASE_URL)('Danh mục theo vị trí việc làm', () => {
  let db: Db;
  let fx: Fixture;
  let s: Record<Name, Session>;
  let versionId: string;
  let codes: { lead: string; staff: string; other: string };

  beforeAll(async () => {
    db = createTestDb();
    fx = await createFixture(db);
    const app = buildDbTestApp(db);
    const names: Name[] = ['officer', 'ptbA', 'headA', 'staffA1', 'headB'];
    const sessions = await Promise.all(names.map((n) => login(app, fx.users[n])));
    s = Object.fromEntries(names.map((n, i) => [n, sessions[i]!])) as typeof s;
    codes = { lead: `A-${fx.sfx}`, staff: `C-${fx.sfx}`, other: `D-${fx.sfx}` };
    const catalog = await db.workCatalog.create({
      data: { code: `DMV-${fx.sfx}`, name: 'Danh mục thử theo VTVL' },
    });
    const v = await db.workCatalogVersion.create({
      data: {
        catalogId: catalog.id,
        versionNo: 1,
        status: 'SUBMITTED',
        standardPoints: 90,
        items: {
          create: [
            { code: codes.lead, groupCode: 'A', name: 'Lãnh đạo thẩm định văn bản' },
            { code: codes.staff, groupCode: 'C', name: 'Soạn thảo công văn' },
            { code: codes.other, groupCode: 'D', name: 'Ghi nhật ký công việc' },
          ].map((i) => ({ ...i, complexityLevel: 1, points: 90, coefficient: 1 })),
        },
      },
    });
    // Trigger chỉ cho thêm mục khi chưa duyệt → thêm xong mới chuyển sang ĐÃ DUYỆT
    await db.workCatalogVersion.update({ where: { id: v.id }, data: { status: 'APPROVED' } });
    versionId = v.id;
  });
  afterAll(async () => db?.$disconnect());

  const itemCodes = async (who: Session, query = '') => {
    const res = await who.get(`/api/v1/work-catalogs/versions/${versionId}/items${query}`);
    return {
      status: res.status,
      codes: ((res.body.data ?? []) as { code: string }[]).map((i) => i.code).sort(),
    };
  };

  it('VTVL chưa được phân → cán bộ không thấy mục nào; không xem được toàn bộ', async () => {
    expect((await itemCodes(s.staffA1)).codes).toEqual([]);
    expect((await itemCodes(s.staffA1, '?scope=all')).status).toBe(403);
    expect((await s.staffA1.get('/api/v1/work-catalogs/job-positions')).status).toBe(403);
  });

  it('Cán bộ tổng hợp (catalog.assign) xem toàn bộ và phân mục cho VTVL', async () => {
    expect((await itemCodes(s.officer, '?scope=all')).codes).toEqual(
      [codes.lead, codes.staff, codes.other].sort(),
    );
    const bad = await s.officer.put(
      `/api/v1/work-catalogs/job-positions/${fx.jobPositionId}/items`,
      {
        itemCodes: [codes.staff, 'KHONG-CO-MA-NAY'],
      },
    );
    expect(bad.status).toBe(400);
    const res = await s.officer.put(
      `/api/v1/work-catalogs/job-positions/${fx.jobPositionId}/items`,
      {
        itemCodes: [codes.staff, codes.other],
      },
    );
    expect(res.status).toBe(200);
    expect(res.body.data.itemCodes).toEqual([codes.staff, codes.other].sort());
    const audit = await db.auditLog.findFirst({
      where: { action: 'work_catalog.assign_job_position', entityId: fx.jobPositionId },
      orderBy: { id: 'desc' },
    });
    expect((audit?.changes as { added: string[] }).added.sort()).toEqual(
      [codes.staff, codes.other].sort(),
    );
    const list = await s.officer.get('/api/v1/work-catalogs/job-positions');
    const mine = (list.body.data as { jobPosition: { id: string }; employeeCount: number }[]).find(
      (j) => j.jobPosition.id === fx.jobPositionId,
    );
    expect(mine?.employeeCount).toBeGreaterThanOrEqual(6);
  });

  it('mỗi người chỉ thấy mục của VTVL mình (kể cả lãnh đạo)', async () => {
    expect((await itemCodes(s.staffA1)).codes).toEqual([codes.staff, codes.other].sort());
    // Lãnh đạo Ban: VTVL lãnh đạo riêng, chỉ được phân mục lãnh đạo + việc chung
    const lead = await db.jobPosition.create({
      data: { code: `VTLD-${fx.sfx}`, name: `Lãnh đạo Ban ${fx.sfx}`, group: 'LEADERSHIP' },
    });
    await db.employeeAssignment.updateMany({
      where: { employeeId: fx.employees.ptbA, isPrimary: true, endDate: null },
      data: { jobPositionId: lead.id },
    });
    expect((await itemCodes(s.ptbA)).codes).toEqual([]);
    const put = await s.officer.put(`/api/v1/work-catalogs/job-positions/${lead.id}/items`, {
      itemCodes: [codes.lead, codes.other],
    });
    expect(put.status).toBe(200);
    expect((await itemCodes(s.ptbA)).codes).toEqual([codes.lead, codes.other].sort());
    const my = await s.staffA1.get('/api/v1/work-catalogs/my-job-position');
    expect(my.body.data.jobPosition.id).toBe(fx.jobPositionId);
  });

  it('phiếu chấm: danh mục theo VTVL của cán bộ được đánh giá, chỉ trong phạm vi', async () => {
    expect((await itemCodes(s.headA, `?employeeId=${fx.employees.staffA1}`)).codes).toEqual(
      [codes.staff, codes.other].sort(),
    );
    expect((await itemCodes(s.headB, `?employeeId=${fx.employees.staffA1}`)).status).toBe(404);
  });

  it('người phê duyệt danh mục chỉ xem toàn bộ khi phiên bản đang chờ phê duyệt', async () => {
    expect((await itemCodes(s.ptbA, '?scope=all')).status).toBe(403);
    await db.workCatalogVersion.create({
      data: {
        catalogId: (await db.workCatalogVersion.findUniqueOrThrow({ where: { id: versionId } }))
          .catalogId,
        versionNo: 2,
        status: 'SUBMITTED',
        standardPoints: 90,
      },
    });
    const v2 = await db.workCatalogVersion.findFirstOrThrow({
      where: { catalog: { code: `DMV-${fx.sfx}` }, versionNo: 2 },
    });
    const res = await s.ptbA.get(`/api/v1/work-catalogs/versions/${v2.id}/items?scope=all`);
    expect(res.status).toBe(200);
  });
});
