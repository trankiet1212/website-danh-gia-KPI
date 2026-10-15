/**
 * Sổ giao việc hằng ngày (docs/06 §5.7): cấp trên giao việc theo ngày bất kỳ, cán bộ báo cáo,
 * cấp trên đánh giá; phạm vi xem; khóa sửa/xóa sau khi báo cáo; ràng buộc CHECK trong DB.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DailyTaskDto } from '@kpi/shared';
import type { Db } from '../../src/lib/prisma.js';
import {
  TEST_DATABASE_URL,
  createFixture,
  createTestDb,
  login,
  type Fixture,
  type Session,
} from '../helpers/fixture.js';
import { buildDbTestApp } from '../helpers/test-app.js';

type Name = 'ptbA' | 'headA' | 'deputyA' | 'staffA1' | 'headB' | 'officer';

describe.skipIf(!TEST_DATABASE_URL)('Giao việc hằng ngày', () => {
  let db: Db;
  let fx: Fixture;
  let s: Record<Name, Session>;
  let peerHeadA: string;
  // Năm ngẫu nhiên xa để không lẫn với dữ liệu lần chạy khác
  const year = 3000 + Math.floor(Math.random() * 6000);
  const day = (d: number) => `${year}-03-${String(d).padStart(2, '0')}`;
  const range = `from=${day(1)}&to=${day(31)}`;
  const t: Record<string, DailyTaskDto> = {};

  beforeAll(async () => {
    db = createTestDb();
    fx = await createFixture(db);
    const app = buildDbTestApp(db);
    const names: Name[] = ['ptbA', 'headA', 'deputyA', 'staffA1', 'headB', 'officer'];
    const sessions = await Promise.all(names.map((n) => login(app, fx.users[n])));
    s = Object.fromEntries(names.map((n, i) => [n, sessions[i]!])) as typeof s;
    const peer = await db.employee.create({
      data: { employeeCode: `E-PEERD-${fx.sfx}`, fullName: `Trưởng phòng 2 ${fx.sfx}` },
    });
    await db.employeeAssignment.create({
      data: {
        employeeId: peer.id,
        unitId: fx.units.A,
        positionId: fx.positions.head,
        startDate: new Date('2026-01-01T00:00:00Z'),
      },
    });
    peerHeadA = peer.id;
  });
  afterAll(async () => db?.$disconnect());

  const assign = (who: Session, employeeIds: string[], workDate: string, title = 'Việc kiểm thử') =>
    who.post('/api/v1/daily-tasks', { employeeIds, workDate, title });
  const list = async (who: Session, extra = '') =>
    (await who.get(`/api/v1/daily-tasks?${range}${extra}`)).body.data as DailyTaskDto[];

  it('danh sách cán bộ được giao việc: chỉ cấp dưới trong phạm vi', async () => {
    const ids = async (who: Session) =>
      ((await who.get('/api/v1/daily-tasks/assignees')).body.data as { id: string }[])
        .map((e) => e.id)
        .sort();
    const e = fx.employees;
    expect(await ids(s.deputyA)).toEqual([e.staffA1]);
    expect(await ids(s.headA)).toEqual([e.deputyA, e.staffA1, e.staffA2].sort());
    expect(await ids(s.ptbA)).toEqual([e.headA, e.deputyA, e.staffA1, e.staffA2, peerHeadA].sort());
    expect((await s.staffA1.get('/api/v1/daily-tasks/assignees')).status).toBe(403);
  });

  it('cấp trên giao việc vào ngày bất kỳ (kể cả Chủ nhật), cho một hoặc nhiều cán bộ', async () => {
    const a = await assign(s.deputyA, [fx.employees.staffA1], day(12), 'Thẩm định hồ sơ');
    expect(a.status).toBe(201);
    t['a'] = a.body.data[0];
    expect(t['a']!.workDate).toBe(day(12));
    expect(t['a']!.reportStatus).toBe('PENDING');
    const b = await assign(s.headA, [fx.employees.deputyA, fx.employees.staffA2], day(15));
    expect(b.status).toBe(201);
    expect(b.body.data).toHaveLength(2);
    t['b'] = b.body.data.find((x: DailyTaskDto) => x.employee.id === fx.employees.staffA2);
  });

  it('không giao việc cho cấp trên, người cùng cấp, đơn vị khác hoặc chính mình', async () => {
    expect((await assign(s.deputyA, [fx.employees.headA], day(12))).status).toBe(403);
    expect((await assign(s.headA, [peerHeadA], day(12))).status).toBe(403);
    expect((await assign(s.headA, [fx.employees.headA], day(12))).status).toBe(403);
    expect((await assign(s.headB, [fx.employees.staffA1], day(12))).status).toBe(403);
    expect((await assign(s.staffA1, [fx.employees.staffA1], day(12))).status).toBe(403);
    // Dữ liệu không hợp lệ
    expect((await assign(s.headA, [fx.employees.staffA2], `${year}-02-30`)).status).toBe(400);
    expect((await assign(s.headA, [fx.employees.staffA2], day(1), '   ')).status).toBe(400);
  });

  it('phạm vi xem: cán bộ thấy việc của mình; lãnh đạo thấy cấp dưới; phòng khác không thấy', async () => {
    const mine = await list(s.staffA1);
    expect(mine.map((x) => x.id)).toEqual([t['a']!.id]);
    expect(mine[0]!.can).toEqual({ edit: false, delete: false, report: true, evaluate: false });
    const deputy = (await list(s.deputyA)).find((x) => x.id === t['a']!.id)!;
    expect(deputy.can).toEqual({ edit: true, delete: true, report: false, evaluate: true });
    expect((await list(s.headA)).length).toBe(3);
    expect(await list(s.headB)).toHaveLength(0);
    expect(await list(s.headA, `&employeeId=${fx.employees.staffA2}`)).toHaveLength(1);
    // Khoảng ngày quá dài
    expect(
      (await s.headA.get(`/api/v1/daily-tasks?from=${year}-01-01&to=${year}-03-31`)).status,
    ).toBe(400);
  });

  it('sửa việc khi cán bộ chưa báo cáo; cán bộ không sửa được việc được giao', async () => {
    const res = await s.deputyA.patch(`/api/v1/daily-tasks/${t['a']!.id}`, {
      workDate: day(13),
      title: 'Thẩm định 3 hồ sơ nâng lương',
      version: t['a']!.version,
    });
    expect(res.status).toBe(200);
    t['a'] = res.body.data;
    expect(t['a']!.workDate).toBe(day(13));
    expect(
      (
        await s.staffA1.patch(`/api/v1/daily-tasks/${t['a']!.id}`, {
          workDate: day(13),
          title: 'x',
          version: t['a']!.version,
        })
      ).status,
    ).toBe(403);
  });

  it('cán bộ báo cáo; sau đó cấp trên không sửa/xóa được nữa', async () => {
    expect(
      (
        await s.headA.put(`/api/v1/daily-tasks/${t['a']!.id}/report`, {
          status: 'DONE',
          version: t['a']!.version,
        })
      ).status,
    ).toBe(403);
    const r = await s.staffA1.put(`/api/v1/daily-tasks/${t['a']!.id}/report`, {
      status: 'DONE',
      note: 'Đã xong 3/3 hồ sơ',
      version: t['a']!.version,
    });
    expect(r.status).toBe(200);
    t['a'] = r.body.data;
    expect(t['a']!.reportStatus).toBe('DONE');
    expect(t['a']!.reportedAt).not.toBeNull();
    const edit = await s.deputyA.patch(`/api/v1/daily-tasks/${t['a']!.id}`, {
      workDate: day(13),
      title: 'Đổi',
      version: t['a']!.version,
    });
    expect(edit.status).toBe(409);
    expect(
      (await s.deputyA.del(`/api/v1/daily-tasks/${t['a']!.id}?version=${t['a']!.version}`)).status,
    ).toBe(409);
  });

  it('cấp trên đánh giá: hoàn thành bắt buộc chất lượng + tiến độ; cán bộ không tự đánh giá', async () => {
    const url = `/api/v1/daily-tasks/${t['a']!.id}/evaluation`;
    expect(
      (await s.deputyA.put(url, { result: 'COMPLETED', version: t['a']!.version })).status,
    ).toBe(400);
    expect(
      (
        await s.staffA1.put(url, {
          result: 'COMPLETED',
          quality: 'MEETS',
          timeliness: 'ON_TIME',
          version: t['a']!.version,
        })
      ).status,
    ).toBe(403);
    const ev = await s.deputyA.put(url, {
      result: 'COMPLETED',
      quality: 'REWORK',
      timeliness: 'ON_TIME',
      comment: 'Một hồ sơ phải bổ sung',
      version: t['a']!.version,
    });
    expect(ev.status).toBe(200);
    t['a'] = ev.body.data;
    expect([t['a']!.result, t['a']!.quality, t['a']!.timeliness]).toEqual([
      'COMPLETED',
      'REWORK',
      'ON_TIME',
    ]);
    expect(t['a']!.evaluatedBy).toBeTruthy();
    // Sau khi đánh giá, cán bộ không sửa báo cáo được
    expect(
      (
        await s.staffA1.put(`/api/v1/daily-tasks/${t['a']!.id}/report`, {
          status: 'NOT_DONE',
          version: t['a']!.version,
        })
      ).status,
    ).toBe(409);
    // Cấp trên cao hơn đánh giá lại: chưa hoàn thành → bỏ chất lượng/tiến độ
    const again = await s.headA.put(url, {
      result: 'NOT_COMPLETED',
      quality: 'MEETS',
      version: t['a']!.version,
    });
    expect(again.status).toBe(200);
    expect([again.body.data.quality, again.body.data.timeliness]).toEqual([null, null]);
    // Phiên bản cũ → 409
    expect(
      (await s.headA.put(url, { result: 'NOT_COMPLETED', version: t['a']!.version })).status,
    ).toBe(409);
  });

  it('xóa việc giao nhầm (chưa phát sinh dữ liệu); có ghi nhật ký', async () => {
    const id = t['b']!.id;
    expect((await s.headA.del(`/api/v1/daily-tasks/${id}?version=99`)).status).toBe(409);
    expect((await s.deputyA.del(`/api/v1/daily-tasks/${id}?version=1`)).status).toBe(404);
    expect((await s.headA.del(`/api/v1/daily-tasks/${id}?version=${t['b']!.version}`)).status).toBe(
      204,
    );
    expect(await db.dailyTask.count({ where: { id } })).toBe(0);
    expect(await db.auditLog.count({ where: { entityId: id, action: 'daily_task.delete' } })).toBe(
      1,
    );
  });

  it('DB chặn dữ liệu đánh giá không nhất quán (CHECK)', async () => {
    await expect(
      db.dailyTask.update({
        where: { id: t['a']!.id },
        data: { result: 'COMPLETED', quality: null, timeliness: null, evaluatedAt: new Date() },
      }),
    ).rejects.toThrow();
  });
});
