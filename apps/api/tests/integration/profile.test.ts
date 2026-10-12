/**
 * Hồ sơ cá nhân (GET/PATCH /profile): xem thông tin của chính mình, tự sửa thông tin liên hệ,
 * không sửa được thông tin quan trọng; dữ liệu đồng bộ với hồ sơ cán bộ; nghỉ việc → tài khoản bị vô hiệu hóa
 * và không kích hoạt lại được.
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
import { TEST_ORIGIN, buildDbTestApp } from '../helpers/test-app.js';

describe.skipIf(!TEST_DATABASE_URL)('Hồ sơ cá nhân', () => {
  let db: Db;
  let fx: Fixture;
  let app: ReturnType<typeof buildDbTestApp>;
  let staff: Session;
  let officer: Session;

  beforeAll(async () => {
    db = createTestDb();
    fx = await createFixture(db);
    app = buildDbTestApp(db);
    staff = await login(app, fx.users.staffA1);
    officer = await login(app, fx.users.officer);
  });
  afterAll(async () => db?.$disconnect());

  const myProfile = async (s: Session = staff) => {
    const res = await s.get('/api/v1/profile');
    expect(res.status).toBe(200);
    return res.body.data;
  };

  it('cán bộ xem được hồ sơ của mình kèm phân công hiện hành và trường được tự sửa', async () => {
    const p = await myProfile();
    expect(p.account.username).toBe(fx.users.staffA1);
    expect(p.employee.id).toBe(fx.employees.staffA1);
    expect(p.employee.current.unit.id).toBe(fx.units.A);
    expect(p.employee.current.manager.id).toBe(fx.employees.deputyA);
    expect(p.editableFields).toEqual(['phone', 'email']);
    expect(p.account).not.toHaveProperty('passwordHash');
  });

  it('tài khoản không gắn hồ sơ cán bộ: employee = null, không sửa được', async () => {
    const admin = await login(app, fx.users.admin);
    const p = await myProfile(admin);
    expect(p.employee).toBeNull();
    expect(p.editableFields).toEqual([]);
    const res = await admin.patch('/api/v1/profile', { phone: '0912345678', version: 1 });
    expect(res.status).toBe(422);
  });

  it('tự sửa số điện thoại, email: chuẩn hóa, ghi nhật ký, hồ sơ cán bộ cập nhật theo', async () => {
    const before = await myProfile();
    const res = await staff.patch('/api/v1/profile', {
      phone: '0905 123 456',
      email: `  Moi.${fx.sfx}@Test.VN `,
      version: before.employee.version,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.employee.phone).toBe('0905123456');
    expect(res.body.data.employee.email).toBe(`moi.${fx.sfx.toLowerCase()}@test.vn`);
    expect(res.body.data.employee.version).toBe(before.employee.version + 1);

    const audit = await db.auditLog.findFirst({
      where: { action: 'employee.self_update', entityId: fx.employees.staffA1 },
      orderBy: { id: 'desc' },
    });
    expect(audit?.changes).toMatchObject({ phone: { from: null, to: '0905123456' } });

    // Cán bộ tổng hợp thấy ngay dữ liệu mới trên hồ sơ cán bộ (một nguồn dữ liệu duy nhất)
    const detail = await officer.get(`/api/v1/employees/${fx.employees.staffA1}`);
    expect(detail.body.data.phone).toBe('0905123456');
  });

  it('không sửa được thông tin quan trọng qua /profile (trường lạ bị bỏ qua)', async () => {
    const before = await myProfile();
    const res = await staff.patch('/api/v1/profile', {
      fullName: 'Tên Mới',
      gender: 'FEMALE',
      dateOfBirth: '2000-01-01',
      employeeCode: 'HACK',
      phone: '0905000111',
      version: before.employee.version,
    });
    expect(res.status).toBe(200);
    const e = res.body.data.employee;
    expect(e.fullName).toBe(before.employee.fullName);
    expect(e.gender).toBe(before.employee.gender);
    expect(e.dateOfBirth).toBe(before.employee.dateOfBirth);
    expect(e.employeeCode).toBe(before.employee.employeeCode);
    expect(e.phone).toBe('0905000111');
  });

  it('dữ liệu sai → 400; email trùng hồ sơ khác → 409; phiên bản cũ → 409', async () => {
    const p = await myProfile();
    const bad = await staff.patch('/api/v1/profile', { phone: 'abc', version: p.employee.version });
    expect(bad.status).toBe(400);

    const other = await db.employee.findUniqueOrThrow({ where: { id: fx.employees.headA } });
    const dup = await staff.patch('/api/v1/profile', {
      email: other.email,
      version: p.employee.version,
    });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('DUPLICATE');

    const stale = await staff.patch('/api/v1/profile', {
      phone: '0905999888',
      version: p.employee.version - 1,
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('CONFLICT_VERSION');
  });

  it('cán bộ tổng hợp cập nhật giới tính, ngày sinh → cán bộ thấy trên hồ sơ cá nhân', async () => {
    const cur = (await officer.get(`/api/v1/employees/${fx.employees.staffA1}`)).body.data;
    const res = await officer.patch(`/api/v1/employees/${fx.employees.staffA1}`, {
      fullName: cur.fullName,
      gender: 'MALE',
      dateOfBirth: '1992-03-15',
      email: cur.email,
      phone: cur.phone,
      version: cur.version,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.gender).toBe('MALE');
    const p = await myProfile();
    expect(p.employee.gender).toBe('MALE');
    expect(p.employee.dateOfBirth).toBe('1992-03-15');
  });

  it('nghỉ việc → tài khoản bị vô hiệu hóa, phiên bị thu hồi, không kích hoạt lại được', async () => {
    const cur = (await officer.get(`/api/v1/employees/${fx.employees.staffA1}`)).body.data;
    const end = await officer.post(`/api/v1/employees/${fx.employees.staffA1}/end-employment`, {
      status: 'RETIRED',
      endDate: '2026-09-30',
      reason: 'Nghỉ việc',
      version: cur.version,
    });
    expect(end.status).toBe(200);

    // Phiên đang mở bị thu hồi
    expect((await staff.get('/api/v1/profile')).status).toBe(401);

    const user = await db.user.findUniqueOrThrow({ where: { username: fx.users.staffA1 } });
    expect(user.status).toBe('DISABLED');
    // Tài khoản vẫn còn trong CSDL (không xóa vật lý) để giữ lịch sử
    expect(user.employeeId).toBe(fx.employees.staffA1);

    const relogin = await (
      await import('supertest')
    )
      .default(app)
      .post('/api/v1/auth/login')
      .set('Origin', TEST_ORIGIN)
      .send({ username: fx.users.staffA1, password: TEST_PASSWORD });
    expect(relogin.status).toBe(423);

    const admin = await login(app, fx.users.admin);
    const unlock = await admin.post(`/api/v1/users/${user.id}/unlock`);
    expect(unlock.status).toBe(422);
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).status).toBe('DISABLED');
  });
});
