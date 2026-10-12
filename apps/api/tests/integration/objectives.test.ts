/**
 * GĐ5 — Mục tiêu/Kết quả then chốt (OKR): phạm vi, tiến độ chỉ để theo dõi, lịch sử cập nhật chỉ ghi thêm.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../../src/lib/prisma.js';
import {
  TEST_DATABASE_URL,
  createFixture,
  createTestDb,
  login,
  type Fixture,
  type Session,
} from '../helpers/fixture.js';
import { createQuarter } from '../helpers/kpi-fixture.js';
import { buildDbTestApp } from '../helpers/test-app.js';

describe.skipIf(!TEST_DATABASE_URL)('GĐ5 — OKR', () => {
  let db: Db;
  let fx: Fixture;
  let headA: Session;
  let staffA1: Session;
  let headB: Session;
  let periodId: string;
  let objectiveId: string;

  beforeAll(async () => {
    db = createTestDb();
    fx = await createFixture(db);
    const app = buildDbTestApp(db);
    [headA, staffA1, headB] = await Promise.all([
      login(app, fx.users.headA),
      login(app, fx.users.staffA1),
      login(app, fx.users.headB),
    ]);
    periodId = (await createQuarter(db, fx, { tag: 'O' })).id;
  });
  afterAll(async () => db?.$disconnect());

  it('cán bộ tạo mục tiêu của mình; không tạo cho người khác hoặc đơn vị', async () => {
    const own = await staffA1.post('/api/v1/objectives', {
      periodId,
      ownerKind: 'EMPLOYEE',
      ownerEmployeeId: fx.employees.staffA1,
      code: 'O1',
      title: 'Nâng cao chất lượng thẩm định hồ sơ',
    });
    expect(own.status).toBe(201);
    expect(own.body.data.canEdit).toBe(true);
    objectiveId = own.body.data.id;

    const other = await staffA1.post('/api/v1/objectives', {
      periodId,
      ownerKind: 'EMPLOYEE',
      ownerEmployeeId: fx.employees.staffA2,
      code: 'O2',
      title: 'X',
    });
    expect(other.status).toBe(403);
    const unit = await staffA1.post('/api/v1/objectives', {
      periodId,
      ownerKind: 'UNIT',
      ownerUnitId: fx.units.A,
      code: 'O3',
      title: 'X',
    });
    expect(unit.status).toBe(403);
    const dup = await staffA1.post('/api/v1/objectives', {
      periodId,
      ownerKind: 'EMPLOYEE',
      ownerEmployeeId: fx.employees.staffA1,
      code: 'O1',
      title: 'Trùng',
    });
    expect(dup.status).toBe(409);
  });

  it('trưởng phòng tạo mục tiêu đơn vị; cán bộ trong đơn vị xem được nhưng không sửa', async () => {
    const res = await headA.post('/api/v1/objectives', {
      periodId,
      ownerKind: 'UNIT',
      ownerUnitId: fx.units.A,
      code: 'OU1',
      title: 'Mục tiêu phòng',
    });
    expect(res.status).toBe(201);
    const view = await staffA1.get(`/api/v1/objectives/${res.body.data.id}`);
    expect(view.status).toBe(200);
    expect(view.body.data.canEdit).toBe(false);
    const edit = await staffA1.patch(`/api/v1/objectives/${res.body.data.id}`, {
      title: 'Sửa',
      status: 'ACTIVE',
      version: 1,
    });
    expect(edit.status).toBe(403);
    // Đơn vị khác: không thấy
    expect((await headB.get(`/api/v1/objectives/${res.body.data.id}`)).status).toBe(404);
  });

  it('KR tăng/giảm/đạt-không đạt: tiến độ chỉ để theo dõi; chỉ tiêu giảm cần giá trị ban đầu', async () => {
    const missingBaseline = await staffA1.post(`/api/v1/objectives/${objectiveId}/key-results`, {
      code: 'KR0',
      title: 'Giảm số hồ sơ trả lại',
      measureType: 'NUMBER',
      direction: 'DECREASE',
      target: 2,
    });
    expect(missingBaseline.status).toBe(400);

    await staffA1.post(`/api/v1/objectives/${objectiveId}/key-results`, {
      code: 'KR1',
      title: '100% hồ sơ thẩm định đúng hạn',
      measureType: 'PERCENT',
      target: 100,
      baseline: 0,
      weight: 60,
    });
    const res = await staffA1.post(`/api/v1/objectives/${objectiveId}/key-results`, {
      code: 'KR2',
      title: 'Giảm số hồ sơ phải trả lại từ 10 xuống 2',
      measureType: 'NUMBER',
      direction: 'DECREASE',
      baseline: 10,
      target: 2,
      weight: 40,
    });
    expect(res.status).toBe(201);
    const krs = res.body.data.keyResults as {
      id: string;
      code: string;
      progress: { ratio: number | null };
    }[];
    expect(krs.every((k) => k.progress.ratio === null)).toBe(true);

    const kr1 = krs.find((k) => k.code === 'KR1')!;
    const kr2 = krs.find((k) => k.code === 'KR2')!;
    await staffA1.post(`/api/v1/key-results/${kr1.id}/checkins`, { value: 80, note: 'Tháng 1' });
    const after = await staffA1.post(`/api/v1/key-results/${kr2.id}/checkins`, { value: 6 });
    expect(after.status).toBe(201);
    const o = after.body.data;
    const p1 = o.keyResults.find((k: { code: string }) => k.code === 'KR1').progress.ratio;
    const p2 = o.keyResults.find((k: { code: string }) => k.code === 'KR2').progress.ratio;
    expect(p1).toBeCloseTo(0.8, 6); // 80/100
    expect(p2).toBeCloseTo(0.5, 6); // (10 − 6)/(10 − 2)
    expect(o.progress).toBeCloseTo(0.8 * 0.6 + 0.5 * 0.4, 6); // bình quân theo trọng số KR
  });

  it('lịch sử cập nhật KR chỉ ghi thêm (trigger DB)', async () => {
    const c = await db.keyResultCheckin.findFirstOrThrow({ where: { keyResult: { objectiveId } } });
    await expect(
      db.keyResultCheckin.update({ where: { id: c.id }, data: { value: 1 } }),
    ).rejects.toThrow();
    await expect(db.keyResultCheckin.delete({ where: { id: c.id } })).rejects.toThrow();
  });

  it('lãnh đạo đơn vị khác không cập nhật được KR (404)', async () => {
    const kr = await db.keyResult.findFirstOrThrow({ where: { objectiveId } });
    expect((await headB.post(`/api/v1/key-results/${kr.id}/checkins`, { value: 1 })).status).toBe(
      404,
    );
  });
});
