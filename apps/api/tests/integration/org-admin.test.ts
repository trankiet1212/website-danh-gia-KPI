/**
 * Danh mục tổ chức (đơn vị, chức vụ, VTVL) và quản trị tài khoản/vai trò.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../../src/lib/prisma.js';
import {
  TEST_DATABASE_URL,
  TEST_PASSWORD,
  createFixture,
  createTestDb,
  login,
  type Fixture,
  type Session,
} from '../helpers/fixture.js';
import { buildDbTestApp } from '../helpers/test-app.js';

describe.skipIf(!TEST_DATABASE_URL)('Danh mục tổ chức và quản trị', () => {
  let db: Db;
  let fx: Fixture;
  let admin: Session;
  let app: ReturnType<typeof buildDbTestApp>;

  beforeAll(async () => {
    db = createTestDb();
    fx = await createFixture(db);
    app = buildDbTestApp(db);
    admin = await login(app, fx.users.admin);
  });
  afterAll(async () => db?.$disconnect());

  describe('Đơn vị', () => {
    it('tạo, sửa, trùng mã, chống vòng lặp cây', async () => {
      const parent = await admin.post('/api/v1/org-units', {
        code: `p-${fx.sfx}`,
        name: 'Khối thử nghiệm',
        type: 'AGENCY',
      });
      expect(parent.status).toBe(201);
      const child = await admin.post('/api/v1/org-units', {
        code: `c-${fx.sfx}`,
        name: 'Tổ thử nghiệm',
        type: 'DEPARTMENT',
        parentId: parent.body.data.id,
      });
      expect(child.status).toBe(201);

      const dup = await admin.post('/api/v1/org-units', {
        code: `P-${fx.sfx}`,
        name: 'Trùng',
        type: 'AGENCY',
      });
      expect(dup.status).toBe(409);

      const cycle = await admin.patch(`/api/v1/org-units/${parent.body.data.id}`, {
        name: 'Khối thử nghiệm',
        type: 'AGENCY',
        parentId: child.body.data.id,
        version: parent.body.data.version,
      });
      expect(cycle.status).toBe(422);

      const renamed = await admin.patch(`/api/v1/org-units/${child.body.data.id}`, {
        name: 'Tổ thử nghiệm (đổi tên)',
        type: 'DEPARTMENT',
        parentId: parent.body.data.id,
        version: child.body.data.version,
      });
      expect(renamed.status).toBe(200);
      expect(renamed.body.data.version).toBe(child.body.data.version + 1);

      // Còn đơn vị con → không lưu trữ được đơn vị cha
      expect((await admin.post(`/api/v1/org-units/${parent.body.data.id}/archive`)).status).toBe(
        422,
      );
      expect((await admin.post(`/api/v1/org-units/${child.body.data.id}/archive`)).status).toBe(
        200,
      );
      expect((await admin.post(`/api/v1/org-units/${parent.body.data.id}/archive`)).status).toBe(
        200,
      );
      const list = await admin.get('/api/v1/org-units');
      expect(list.body.data.map((u: { id: string }) => u.id)).not.toContain(parent.body.data.id);
      const all = await admin.get('/api/v1/org-units?includeArchived=true');
      expect(all.body.data.map((u: { id: string }) => u.id)).toContain(parent.body.data.id);
    });

    it('không lưu trữ được đơn vị còn cán bộ đang công tác', async () => {
      const res = await admin.post(`/api/v1/org-units/${fx.units.B}/archive`);
      expect(res.status).toBe(422);
      expect(res.body.error.message).toMatch(/cán bộ/);
    });

    it('loại đơn vị sai → 400', async () => {
      const res = await admin.post('/api/v1/org-units', {
        code: `X-${fx.sfx}`,
        name: 'X',
        type: 'KHONG_CO',
      });
      expect(res.status).toBe(400);
    });
  });

  describe('Chức vụ và vị trí việc làm', () => {
    it('cấp chức vụ ngoài 1–5 → 400; trùng mã → 409', async () => {
      const bad = await admin.post('/api/v1/positions', {
        code: `L9-${fx.sfx}`,
        name: 'Sai cấp',
        level: 9,
        isLeadership: false,
        kpiProfile: 'STAFF',
      });
      expect(bad.status).toBe(400);
      const dup = await admin.post('/api/v1/positions', {
        code: `CV-${fx.sfx}`,
        name: 'Trùng',
        level: 5,
        isLeadership: false,
        kpiProfile: 'STAFF',
      });
      expect(dup.status).toBe(409);
    });

    it('chức vụ/VTVL đang có cán bộ đảm nhiệm không lưu trữ được', async () => {
      expect((await admin.post(`/api/v1/positions/${fx.positions.staff}/archive`)).status).toBe(
        422,
      );
      expect((await admin.post(`/api/v1/job-positions/${fx.jobPositionId}/archive`)).status).toBe(
        422,
      );
    });

    it('tạo, sửa, lưu trữ, khôi phục VTVL', async () => {
      const created = await admin.post('/api/v1/job-positions', {
        code: `vt2-${fx.sfx}`,
        name: 'VTVL mới',
        group: 'SHARED_SUPPORT',
      });
      expect(created.status).toBe(201);
      const id = created.body.data.id;
      const updated = await admin.patch(`/api/v1/job-positions/${id}`, {
        name: 'VTVL mới (sửa)',
        group: 'SHARED_SUPPORT',
        description: 'Mô tả',
        version: created.body.data.version,
      });
      expect(updated.status).toBe(200);
      expect((await admin.post(`/api/v1/job-positions/${id}/archive`)).body.data.status).toBe(
        'ARCHIVED',
      );
      expect((await admin.post(`/api/v1/job-positions/${id}/restore`)).body.data.status).toBe(
        'ACTIVE',
      );
    });
  });

  describe('Tài khoản và vai trò', () => {
    it('tạo tài khoản → sinh mật khẩu tạm, bắt đổi mật khẩu; trùng tên đăng nhập → 409', async () => {
      const res = await admin.post('/api/v1/users', {
        username: `New.User-${fx.sfx}`,
        displayName: 'Người dùng mới',
      });
      expect(res.status).toBe(201);
      expect(res.body.data.user.username).toBe(`new.user-${fx.sfx}`.toLowerCase());
      expect(res.body.data.user.mustChangePassword).toBe(true);
      expect(res.body.data.temporaryPassword).toHaveLength(16);
      const dup = await admin.post('/api/v1/users', {
        username: `new.user-${fx.sfx}`,
        displayName: 'Trùng',
      });
      expect(dup.status).toBe(409);
    });

    it('mật khẩu ban đầu yếu → 400', async () => {
      const res = await admin.post('/api/v1/users', {
        username: `weak-${fx.sfx}`,
        displayName: 'Yếu',
        initialPassword: '123456',
      });
      expect(res.status).toBe(400);
    });

    it('một hồ sơ cán bộ chỉ gắn với một tài khoản', async () => {
      const res = await admin.post('/api/v1/users', {
        username: `dup-emp-${fx.sfx}`,
        employeeId: fx.employees.headA,
      });
      expect(res.status).toBe(409);
    });

    it('cấp vai trò phạm vi đơn vị và thu hồi; phạm vi theo cán bộ yêu cầu gắn hồ sơ', async () => {
      const created = await admin.post('/api/v1/users', {
        username: `grant-${fx.sfx}`,
        employeeId: fx.employees.staffA2,
      });
      const userId = created.body.data.user.id;
      const roles = (await admin.get('/api/v1/roles')).body.data as { id: string; code: string }[];
      const leader = roles.find((r) => r.code === 'AGENCY_LEADER')!;
      const unitLeader = roles.find((r) => r.code === 'UNIT_LEADER')!;

      const noUnits = await admin.post(`/api/v1/users/${userId}/roles`, {
        roleId: leader.id,
        scopeType: 'UNITS',
        unitIds: [],
      });
      expect(noUnits.status).toBe(400);

      const granted = await admin.post(`/api/v1/users/${userId}/roles`, {
        roleId: leader.id,
        scopeType: 'UNITS',
        unitIds: [fx.units.A, fx.units.B],
      });
      expect(granted.status).toBe(201);
      const grant = granted.body.data.roles[0];
      expect(grant.units).toHaveLength(2);

      const dup = await admin.post(`/api/v1/users/${userId}/roles`, {
        roleId: leader.id,
        scopeType: 'UNITS',
        unitIds: [fx.units.A],
      });
      expect(dup.status).toBe(409);

      const noEmp = await admin.post('/api/v1/users', {
        username: `noemp-${fx.sfx}`,
        displayName: 'Không gắn hồ sơ',
      });
      const ownUnit = await admin.post(`/api/v1/users/${noEmp.body.data.user.id}/roles`, {
        roleId: unitLeader.id,
        scopeType: 'OWN_UNIT',
      });
      expect(ownUnit.status).toBe(422);

      const revoked = await admin.del(`/api/v1/users/${userId}/roles/${grant.id}`);
      expect(revoked.status).toBe(200);
      expect(revoked.body.data.roles).toHaveLength(0);
      const log = await db.auditLog.findFirst({
        where: { action: 'user.role.revoke', entityId: userId },
      });
      expect(log).not.toBeNull();
    });

    it('không thể tự khóa mình hoặc tự thu hồi quyền Quản trị hệ thống', async () => {
      const me = (await admin.get('/api/v1/auth/me')).body.data;
      expect((await admin.post(`/api/v1/users/${me.user.id}/lock`, { reason: 'thử' })).status).toBe(
        422,
      );
      const grant = me.roles.find((r: { roleCode: string }) => r.roleCode === 'SUPER_ADMIN');
      expect((await admin.del(`/api/v1/users/${me.user.id}/roles/${grant.id}`)).status).toBe(422);
    });

    it('vai trò: tạo vai trò mới, cập nhật quyền; không xóa vai trò hệ thống', async () => {
      const created = await admin.post('/api/v1/roles', {
        code: `xem-bao-cao-${fx.sfx}`,
        name: 'Chỉ xem báo cáo',
        permissions: ['report.read', 'dashboard.read'],
      });
      expect(created.status).toBe(201);
      const updated = await admin.put(`/api/v1/roles/${created.body.data.id}`, {
        name: 'Chỉ xem báo cáo',
        permissions: ['report.read'],
      });
      expect(updated.body.data.permissions).toEqual(['report.read']);
      const badPerm = await admin.put(`/api/v1/roles/${created.body.data.id}`, {
        name: 'X',
        permissions: ['khong.ton.tai'],
      });
      expect(badPerm.status).toBe(400);
      expect((await admin.del(`/api/v1/roles/${created.body.data.id}`)).status).toBe(200);

      const roles = (await admin.get('/api/v1/roles')).body.data as { id: string; code: string }[];
      const superAdmin = roles.find((r) => r.code === 'SUPER_ADMIN')!;
      expect((await admin.del(`/api/v1/roles/${superAdmin.id}`)).status).toBe(422);
      const strip = await admin.put(`/api/v1/roles/${superAdmin.id}`, {
        name: 'Quản trị hệ thống',
        permissions: ['audit.read'],
      });
      expect(strip.status).toBe(422);
    });

    it('danh sách người dùng: tìm kiếm và lọc theo vai trò', async () => {
      const res = await admin.get(
        `/api/v1/users?q=${fx.sfx.toLowerCase()}&roleCode=UNIT_LEADER&sort=username:asc`,
      );
      expect(res.status).toBe(200);
      const names = res.body.data.map((u: { username: string }) => u.username);
      expect(names).toEqual(expect.arrayContaining([fx.users.headA, fx.users.headB]));
      expect(names).not.toContain(fx.users.officer);
    });

    it.each(['username:asc', 'createdAt:desc', 'lastLoginAt:desc', 'lastLoginAt:asc'])(
      'sắp xếp danh sách người dùng theo %s',
      async (sort) => {
        const res = await admin.get(`/api/v1/users?sort=${sort}&pageSize=5`);
        expect(res.status).toBe(200);
      },
    );

    it('tài khoản mới đăng nhập được bằng mật khẩu ban đầu hợp lệ', async () => {
      await admin.post('/api/v1/users', {
        username: `init-${fx.sfx}`,
        displayName: 'Có mật khẩu ban đầu',
        initialPassword: TEST_PASSWORD,
      });
      const s = await login(app, `init-${fx.sfx}`.toLowerCase());
      expect((await s.get('/api/v1/auth/me')).body.data.user.mustChangePassword).toBe(true);
    });
  });
});
