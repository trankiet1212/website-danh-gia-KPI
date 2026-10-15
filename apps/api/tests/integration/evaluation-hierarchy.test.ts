/**
 * Đánh giá theo cấp quản lý (docs/05 "Đánh giá theo cấp quản lý", docs/06 §5.6):
 * cấp trên (chức vụ cao hơn, trong phạm vi) tạo hồ sơ, giao nhiệm vụ, thẩm định cấp dưới;
 * người cùng cấp hoặc cấp dưới không được; cán bộ không sửa được phần kế hoạch của nhiệm vụ được giao.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CompositeRow } from '@kpi/shared';
import type { Db } from '../../src/lib/prisma.js';
import {
  TEST_DATABASE_URL,
  createFixture,
  createTestDb,
  login,
  type Fixture,
  type Session,
} from '../helpers/fixture.js';
import {
  createQuarter,
  createRuleSetVersion,
  row,
  sampleCriteriaItems,
} from '../helpers/kpi-fixture.js';
import { buildDbTestApp } from '../helpers/test-app.js';

type Name = 'officer' | 'ptbA' | 'headA' | 'deputyA' | 'staffA1';

describe.skipIf(!TEST_DATABASE_URL)('Đánh giá theo cấp quản lý', () => {
  let db: Db;
  let fx: Fixture;
  let s: Record<Name, Session>;
  let periodId: string;
  let axisId: string;
  let generalIds: string[];
  /** Trưởng phòng thứ hai của đơn vị A — cùng cấp với headA. */
  let peerHeadA: string;
  const rec: Record<string, string> = {};

  async function approvedCriteria(profile: 'STAFF' | 'LEADER', ruleVersionId: string) {
    const set = await s.officer.post('/api/v1/criteria-sets', {
      code: `CSH-${profile}-${fx.sfx}`,
      name: `Bộ tiêu chí ${profile} (kiểm thử cấp quản lý)`,
      kpiProfile: profile,
      // Gắn VTVL riêng của bộ dữ liệu để hồ sơ tạo tự động chọn đúng bộ tiêu chí này
      jobPositionId: fx.jobPositionId,
    });
    const v = await s.officer.post(`/api/v1/criteria-sets/${set.body.data.id}/versions`, {});
    const id = v.body.data.id as string;
    const saved = await s.officer.put(`/api/v1/criteria-versions/${id}/items`, {
      generalMax: 30,
      resultMax: 70,
      periodTypes: ['QUARTER'],
      ruleSetVersionId: ruleVersionId,
      items: sampleCriteriaItems(),
      version: 1,
    });
    expect(saved.status).toBe(200);
    await s.officer.post(`/api/v1/criteria-versions/${id}/submit`, { note: 'Trình', version: 2 });
    const approved = await s.ptbA.post(`/api/v1/criteria-versions/${id}/approve`, {
      note: 'Duyệt',
      version: 3,
    });
    expect(approved.status).toBe(200);
    return approved.body.data.items as { code: string; id: string }[];
  }

  beforeAll(async () => {
    db = createTestDb();
    fx = await createFixture(db);
    const app = buildDbTestApp(db);
    const names: Name[] = ['officer', 'ptbA', 'headA', 'deputyA', 'staffA1'];
    const sessions = await Promise.all(names.map((n) => login(app, fx.users[n])));
    s = Object.fromEntries(names.map((n, i) => [n, sessions[i]!])) as typeof s;

    const peer = await db.employee.create({
      data: { employeeCode: `E-PEER-${fx.sfx}`, fullName: `Trưởng phòng 2 ${fx.sfx}` },
    });
    await db.employeeAssignment.create({
      data: {
        employeeId: peer.id,
        unitId: fx.units.A,
        positionId: fx.positions.head,
        jobPositionId: fx.jobPositionId,
        startDate: new Date('2026-01-01T00:00:00Z'),
      },
    });
    peerHeadA = peer.id;

    periodId = (await createQuarter(db, fx)).id;
    const rule = (await createRuleSetVersion(db, fx)).id;
    const items = await approvedCriteria('STAFF', rule);
    await approvedCriteria('LEADER', rule);
    axisId = items.find((i) => i.code === 'T1')!.id;
    generalIds = ['1.1', '2.1', '2.2'].map((c) => items.find((i) => i.code === c)!.id);
  });
  afterAll(async () => db?.$disconnect());

  const create = (who: Session, employeeId: string) =>
    who.post('/api/v1/evaluations', { periodId, employeeId });
  const view = async (who: Session, id: string) =>
    (await who.get(`/api/v1/evaluations/${id}`)).body.data;
  const selfRows = async (id: string): Promise<CompositeRow[]> => {
    const d = await view(s.staffA1, id);
    return d.items.find((i: { criteriaItemId: string }) => i.criteriaItemId === axisId).selfInput
      .rows;
  };

  it('cấp trên tạo hồ sơ cho cấp dưới: PP → chuyên viên, TP → PP, PTB → TP', async () => {
    const a = await create(s.deputyA, fx.employees.staffA1);
    expect(a.status).toBe(201);
    rec['staffA1'] = a.body.data.id;
    const b = await create(s.headA, fx.employees.deputyA);
    expect(b.status).toBe(201);
    rec['deputyA'] = b.body.data.id;
    const c = await create(s.ptbA, fx.employees.headA);
    expect(c.status).toBe(201);
    rec['headA'] = c.body.data.id;
  });

  it('không tạo hồ sơ cho cấp trên hoặc người cùng cấp; cán bộ thường không tạo được', async () => {
    expect((await create(s.deputyA, fx.employees.headA)).status).toBe(404);
    expect((await create(s.headA, peerHeadA)).status).toBe(404);
    expect((await create(s.headA, fx.employees.ptbA)).status).toBe(404);
    // PTB phụ trách đơn vị A không tạo được cho đơn vị B
    expect((await create(s.ptbA, fx.employees.headB)).status).toBe(404);
    expect((await create(s.staffA1, fx.employees.staffA1)).status).toBe(403);
  });

  it('lãnh đạo tạo hàng loạt: chỉ cấp dưới trong phạm vi và chính mình', async () => {
    const res = await s.headA.post('/api/v1/evaluations/generate', { periodId });
    expect(res.status).toBe(200);
    const subjects = await db.evaluationRecord.findMany({
      where: { periodId },
      select: { subjectEmployeeId: true },
    });
    const ids = subjects.map((x) => x.subjectEmployeeId);
    expect(ids).toContain(fx.employees.staffA2);
    expect(ids).not.toContain(peerHeadA);
    expect(ids).not.toContain(fx.employees.staffB1);
  });

  it('Cán bộ tổng hợp (quản lý kỳ, không thẩm định) vẫn tạo hồ sơ cho mọi cán bộ trong phạm vi', async () => {
    const res = await create(s.officer, peerHeadA);
    expect(res.status).toBe(201);
    rec['peer'] = res.body.data.id;
  });

  it('người cùng cấp không thẩm định/giao nhiệm vụ cho nhau; cấp trên thì được', async () => {
    const peerView = await view(s.headA, rec['peer']!);
    expect(peerView.can.assignTasks).toBe(false);
    expect(peerView.can.editReview).toBe(false);
    const denied = await s.headA.put(`/api/v1/evaluations/${rec['peer']}/review`, {
      items: [],
      version: peerView.version,
    });
    expect(denied.status).toBe(403);
    expect(denied.body.error.message).toContain('chỉ cấp trên');
    expect((await view(s.ptbA, rec['peer']!)).can.assignTasks).toBe(true);
    // Phó phòng không giao nhiệm vụ cho Trưởng phòng (cấp trên) — ngoài phạm vi xem → 404
    const up = await s.deputyA.put(`/api/v1/evaluations/${rec['headA']}/tasks`, {
      items: [{ criteriaItemId: axisId, rows: [] }],
      version: 1,
    });
    expect(up.status).toBe(404);
  });

  it('giao nhiệm vụ: cấp trên lập danh sách, cán bộ thấy dòng được giao', async () => {
    const before = await view(s.deputyA, rec['staffA1']!);
    expect(before.can.assignTasks).toBe(true);
    expect((await view(s.staffA1, rec['staffA1']!)).can.assignTasks).toBe(false);
    const res = await s.deputyA.put(`/api/v1/evaluations/${rec['staffA1']}/tasks`, {
      items: [
        {
          criteriaItemId: axisId,
          rows: [
            { label: 'Thẩm định hồ sơ', coefficient: 1.5, plannedQty: 4 },
            { label: 'Báo cáo chuyên đề', coefficient: 2, plannedQty: 1 },
          ],
        },
      ],
      version: before.version,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('DRAFT');
    expect(res.body.data.history.at(-1).action).toBe('assignTasks');
    const rows = await selfRows(rec['staffA1']!);
    expect(rows.map((r) => [r.label, r.plannedQty, r.assigned, r.completedQty])).toEqual([
      ['Thẩm định hồ sơ', 4, true, 0],
      ['Báo cáo chuyên đề', 1, true, 0],
    ]);
    // Cán bộ không có quyền giao nhiệm vụ
    expect(
      (
        await s.staffA1.put(`/api/v1/evaluations/${rec['staffA1']}/tasks`, {
          items: [{ criteriaItemId: axisId, rows: [] }],
          version: res.body.data.version,
        })
      ).status,
    ).toBe(403);
    // Chỉ giao cho mục KPI tổng hợp
    const wrong = await s.deputyA.put(`/api/v1/evaluations/${rec['staffA1']}/tasks`, {
      items: [{ criteriaItemId: generalIds[0], rows: [] }],
      version: res.body.data.version,
    });
    expect(wrong.status).toBe(400);
  });

  it('cán bộ không sửa/xóa được phần kế hoạch của dòng được giao; dòng tự thêm được giữ', async () => {
    const d = await view(s.staffA1, rec['staffA1']!);
    const res = await s.staffA1.put(`/api/v1/evaluations/${rec['staffA1']}/self`, {
      items: [
        ...generalIds.map((id) => ({ criteriaItemId: id, input: { passed: true } })),
        {
          criteriaItemId: axisId,
          input: {
            rows: [
              // Cố sửa SL kế hoạch và tên dòng được giao; xóa dòng thứ hai; tự thêm một dòng (cố gắn cờ giao)
              row({ label: 'Đã đổi tên', plannedQty: 1, completedQty: 4, assigned: true }),
              row({ label: 'Việc phát sinh', plannedQty: 2, completedQty: 2, assigned: false }),
            ],
          },
        },
      ],
      version: d.version,
    });
    expect(res.status).toBe(200);
    const rows = await selfRows(rec['staffA1']!);
    expect(rows.map((r) => [r.label, r.plannedQty, r.completedQty, !!r.assigned])).toEqual([
      ['Thẩm định hồ sơ', 4, 4, true],
      ['Báo cáo chuyên đề', 1, 0, true],
      ['Việc phát sinh', 2, 2, false],
    ]);
  });

  it('giao lại: dòng giữ nguyên số liệu đã nhập, dòng bỏ bị xóa, dòng tự thêm giữ nguyên', async () => {
    const d = await view(s.headA, rec['staffA1']!);
    // Trưởng phòng (cấp trên của Phó phòng) cũng giao được
    const res = await s.headA.put(`/api/v1/evaluations/${rec['staffA1']}/tasks`, {
      items: [
        {
          criteriaItemId: axisId,
          rows: [
            { label: 'Thẩm định hồ sơ', coefficient: 1.5, plannedQty: 5 },
            { label: 'Tổng hợp số liệu', coefficient: 1, plannedQty: 3 },
          ],
        },
      ],
      version: d.version,
    });
    expect(res.status).toBe(200);
    const rows = await selfRows(rec['staffA1']!);
    expect(rows.map((r) => [r.label, r.plannedQty, r.completedQty, !!r.assigned])).toEqual([
      ['Thẩm định hồ sơ', 5, 4, true],
      ['Tổng hợp số liệu', 3, 0, true],
      ['Việc phát sinh', 2, 2, false],
    ]);
  });

  it('sau khi nộp không giao nhiệm vụ được nữa (409)', async () => {
    const d = await view(s.staffA1, rec['staffA1']!);
    const rows = (await selfRows(rec['staffA1']!)).map((r) => ({
      ...r,
      completedQty: r.plannedQty,
    }));
    const saved = await s.staffA1.put(`/api/v1/evaluations/${rec['staffA1']}/self`, {
      items: [{ criteriaItemId: axisId, input: { rows } }],
      version: d.version,
    });
    expect(saved.status).toBe(200);
    const sub = await s.staffA1.post(`/api/v1/evaluations/${rec['staffA1']}/submit`, {
      version: saved.body.data.version,
    });
    expect(sub.status).toBe(200);
    const late = await s.deputyA.put(`/api/v1/evaluations/${rec['staffA1']}/tasks`, {
      items: [{ criteriaItemId: axisId, rows: [] }],
      version: sub.body.data.version,
    });
    expect(late.status).toBe(409);
  });
});
