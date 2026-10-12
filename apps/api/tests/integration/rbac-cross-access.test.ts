/**
 * Phân quyền theo vai trò + phạm vi dữ liệu và truy cập chéo giữa các phòng ban (docs/05-phan-quyen.md).
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
import { buildDbTestApp } from '../helpers/test-app.js';

describe.skipIf(!TEST_DATABASE_URL)('Phân quyền và phạm vi dữ liệu', () => {
  let db: Db;
  let fx: Fixture;
  let app: ReturnType<typeof buildDbTestApp>;
  const s = {} as Record<keyof Fixture['users'], Session>;

  beforeAll(async () => {
    db = createTestDb();
    fx = await createFixture(db);
    app = buildDbTestApp(db);
    for (const key of Object.keys(fx.users) as (keyof Fixture['users'])[]) {
      s[key] = await login(app, fx.users[key]);
    }
  });
  afterAll(async () => db?.$disconnect());

  /** Lấy id các cán bộ của fixture hiển thị trong danh sách (lọc theo hậu tố để bỏ dữ liệu của lần chạy khác). */
  async function visibleIds(session: Session): Promise<string[]> {
    const res = await session.get(`/api/v1/employees?q=${fx.sfx}&pageSize=100`);
    expect(res.status).toBe(200);
    return res.body.data.map((e: { id: string }) => e.id).sort();
  }
  const ids = (...keys: (keyof Fixture['employees'])[]) => keys.map((k) => fx.employees[k]).sort();

  describe('Danh sách cán bộ chỉ chứa dữ liệu trong phạm vi', () => {
    it('Cán bộ tổng hợp (ALL) thấy cả hai phòng', async () => {
      expect(await visibleIds(s.officer)).toEqual(
        ids('headA', 'deputyA', 'staffA1', 'staffA2', 'headB', 'staffB1'),
      );
    });
    it('Trưởng phòng A (OWN_UNIT) chỉ thấy phòng A', async () => {
      expect(await visibleIds(s.headA)).toEqual(ids('headA', 'deputyA', 'staffA1', 'staffA2'));
    });
    it('Trưởng phòng B (OWN_UNIT) chỉ thấy phòng B', async () => {
      expect(await visibleIds(s.headB)).toEqual(ids('headB', 'staffB1'));
    });
    it('Phó phòng A (MANAGED) chỉ thấy bản thân và cấp dưới trực tiếp', async () => {
      expect(await visibleIds(s.deputyA)).toEqual(ids('deputyA', 'staffA1'));
    });
    it('Chuyên viên (SELF) chỉ thấy hồ sơ của mình', async () => {
      expect(await visibleIds(s.staffA1)).toEqual(ids('staffA1'));
    });
    it('Lãnh đạo Ban phụ trách phòng A (UNITS) chỉ thấy phòng A', async () => {
      expect(await visibleIds(s.ptbA)).toEqual(ids('headA', 'deputyA', 'staffA1', 'staffA2'));
    });
    it('Lọc theo đơn vị ngoài phạm vi trả danh sách rỗng, không lộ dữ liệu', async () => {
      const res = await s.headA.get(`/api/v1/employees?unitId=${fx.units.B}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.meta.total).toBe(0);
    });
  });

  describe('Truy cập chéo hồ sơ chi tiết → 404 (không tiết lộ sự tồn tại)', () => {
    it('Trưởng phòng A xem hồ sơ phòng B', async () => {
      const res = await s.headA.get(`/api/v1/employees/${fx.employees.staffB1}`);
      expect(res.status).toBe(404);
    });
    it('Trưởng phòng B xem hồ sơ phòng A', async () => {
      expect((await s.headB.get(`/api/v1/employees/${fx.employees.headA}`)).status).toBe(404);
    });
    it('Phó phòng A xem cán bộ cùng phòng nhưng không do mình quản lý', async () => {
      expect((await s.deputyA.get(`/api/v1/employees/${fx.employees.staffA2}`)).status).toBe(404);
    });
    it('Chuyên viên xem hồ sơ đồng nghiệp', async () => {
      expect((await s.staffA1.get(`/api/v1/employees/${fx.employees.staffA2}`)).status).toBe(404);
    });
    it('Hồ sơ trong phạm vi xem được, kèm cờ quyền thao tác', async () => {
      const res = await s.headA.get(`/api/v1/employees/${fx.employees.staffA2}`);
      expect(res.status).toBe(200);
      expect(res.body.data.can).toEqual({ edit: false, transfer: false, archive: false });
      const own = await s.staffA1.get(`/api/v1/employees/${fx.employees.staffA1}`);
      expect(own.status).toBe(200);
    });
  });

  describe('Ghi dữ liệu theo quyền', () => {
    it('Lãnh đạo phòng (không có employee.write) không sửa được hồ sơ trong phòng mình → 403', async () => {
      const detail = await s.headA.get(`/api/v1/employees/${fx.employees.staffA2}`);
      const res = await s.headA.patch(`/api/v1/employees/${fx.employees.staffA2}`, {
        fullName: 'Sửa trái phép',
        version: detail.body.data.version,
      });
      expect(res.status).toBe(403);
    });
    it('Chuyên viên không tự sửa hồ sơ của mình → 403', async () => {
      const res = await s.staffA1.patch(`/api/v1/employees/${fx.employees.staffA1}`, {
        fullName: 'X',
        version: 1,
      });
      expect(res.status).toBe(403);
    });
    it('Cán bộ tổng hợp sửa được hồ sơ', async () => {
      const detail = await s.officer.get(`/api/v1/employees/${fx.employees.staffB1}`);
      expect(detail.body.data.can.edit).toBe(true);
      const res = await s.officer.patch(`/api/v1/employees/${fx.employees.staffB1}`, {
        fullName: `Cán bộ STB1 ${fx.sfx} (đã sửa)`,
        version: detail.body.data.version,
      });
      expect(res.status).toBe(200);
    });
  });

  describe('Tách bạch nhiệm vụ: Quản trị hệ thống', () => {
    it('không đọc được hồ sơ cán bộ', async () => {
      expect((await s.admin.get('/api/v1/employees')).status).toBe(403);
      expect((await s.admin.get(`/api/v1/employees/${fx.employees.headA}`)).status).toBe(403);
    });
    it('quản lý được tài khoản, vai trò, danh mục tổ chức', async () => {
      expect((await s.admin.get('/api/v1/users')).status).toBe(200);
      expect((await s.admin.get('/api/v1/roles')).status).toBe(200);
      expect((await s.admin.get('/api/v1/org-units')).status).toBe(200);
    });
  });

  describe('Chức năng quản trị bị chặn với người dùng nghiệp vụ', () => {
    it.each(['officer', 'headA', 'staffA1', 'ptbA'] as const)(
      '%s không vào được /users, /roles',
      async (who) => {
        expect((await s[who].get('/api/v1/users')).status).toBe(403);
        expect((await s[who].get('/api/v1/roles')).status).toBe(403);
        expect(
          (await s[who].post('/api/v1/org-units', { code: 'X', name: 'X', type: 'DEPARTMENT' }))
            .status,
        ).toBe(403);
      },
    );
    it('tài khoản không có vai trò nào chỉ dùng được thông tin bản thân', async () => {
      expect((await s.noRole.get('/api/v1/auth/me')).status).toBe(200);
      expect((await s.noRole.get('/api/v1/employees')).status).toBe(403);
      expect((await s.noRole.get('/api/v1/org-units')).status).toBe(403);
    });
  });

  it('ghi nhật ký các lần bị từ chối quyền', async () => {
    const user = await db.user.findUniqueOrThrow({ where: { username: fx.users.staffA1 } });
    const denied = await db.auditLog.count({ where: { actorUserId: user.id, result: 'DENIED' } });
    expect(denied).toBeGreaterThan(0);
  });
});
