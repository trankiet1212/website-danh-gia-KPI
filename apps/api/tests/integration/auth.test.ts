/**
 * Xác thực: đăng nhập/đăng xuất, cookie, khóa tạm, hết hạn phiên, CSRF, đổi mật khẩu bắt buộc.
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sha256 } from '../../src/lib/crypto.js';
import type { Db } from '../../src/lib/prisma.js';
import {
  TEST_DATABASE_URL,
  TEST_PASSWORD,
  createFixture,
  createTestDb,
  login,
  type Fixture,
} from '../helpers/fixture.js';
import { TEST_ORIGIN, buildDbTestApp } from '../helpers/test-app.js';

describe.skipIf(!TEST_DATABASE_URL)('Xác thực và phiên đăng nhập', () => {
  let db: Db;
  let fx: Fixture;
  let app: ReturnType<typeof buildDbTestApp>;

  beforeAll(async () => {
    db = createTestDb();
    fx = await createFixture(db);
    app = buildDbTestApp(db);
  });
  afterAll(async () => db?.$disconnect());

  const loginReq = (username: string, password: string, origin = TEST_ORIGIN) =>
    request(app).post('/api/v1/auth/login').set('Origin', origin).send({ username, password });

  it('đăng nhập thành công: cookie httpOnly + SameSite=Strict, trả về quyền và CSRF token', async () => {
    const res = await loginReq(fx.users.headA, TEST_PASSWORD);
    expect(res.status).toBe(200);
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/kpi_sid=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(res.body.data.user.username).toBe(fx.users.headA);
    expect(res.body.data.permissions).toContain('employee.read');
    expect(res.body.data.csrfToken).toEqual(expect.any(String));
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|tokenHash/);
  });

  it('chỉ lưu băm của token phiên trong DB', async () => {
    const res = await loginReq(fx.users.staffA1, TEST_PASSWORD);
    const token = String(res.headers['set-cookie']).match(/kpi_sid=([^;]+)/)![1]!;
    expect(await db.session.findUnique({ where: { tokenHash: token } })).toBeNull();
    expect(await db.session.findUnique({ where: { tokenHash: sha256(token) } })).not.toBeNull();
  });

  it('sai mật khẩu và tài khoản không tồn tại trả cùng một thông báo', async () => {
    const wrong = await loginReq(fx.users.headB, 'sai-mat-khau-123');
    const unknown = await loginReq(`khong-ton-tai-${fx.sfx}`.toLowerCase(), 'sai-mat-khau-123');
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it('khóa tạm tài khoản sau 5 lần sai liên tiếp, kể cả khi sau đó nhập đúng', async () => {
    const username = fx.users.deputyA;
    for (let i = 0; i < 4; i++)
      expect((await loginReq(username, 'Sai-Mat-Khau#1')).status).toBe(401);
    const fifth = await loginReq(username, 'Sai-Mat-Khau#1');
    expect(fifth.status).toBe(423);
    expect(fifth.body.error.code).toBe('ACCOUNT_LOCKED');
    const correct = await loginReq(username, TEST_PASSWORD);
    expect(correct.status).toBe(423);
    // Mở khóa (giả lập hết thời gian khóa) để các test khác dùng được
    await db.user.update({ where: { username }, data: { lockedUntil: null, failedLoginCount: 0 } });
    expect((await loginReq(username, TEST_PASSWORD)).status).toBe(200);
  });

  it('giới hạn số lần gọi đăng nhập theo IP → 429', async () => {
    const limited = buildDbTestApp(db, { loginRateLimit: 2 });
    const call = () =>
      request(limited)
        .post('/api/v1/auth/login')
        .set('Origin', TEST_ORIGIN)
        .send({ username: 'x', password: 'y' });
    expect((await call()).status).toBe(401);
    expect((await call()).status).toBe(401);
    const third = await call();
    expect(third.status).toBe(429);
    expect(third.body.error.code).toBe('RATE_LIMITED');
  });

  it('từ chối đăng nhập từ origin lạ', async () => {
    const res = await loginReq(fx.users.headA, TEST_PASSWORD, 'https://evil.example');
    expect(res.status).toBe(403);
  });

  it('chưa đăng nhập → 401 cho API được bảo vệ (kể cả đường dẫn không tồn tại)', async () => {
    expect((await request(app).get('/api/v1/employees')).status).toBe(401);
    expect((await request(app).get('/api/v1/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/v1/khong-ton-tai')).status).toBe(401);
  });

  it('đăng xuất thu hồi phiên phía server', async () => {
    const s = await login(app, fx.users.headA);
    expect((await s.get('/api/v1/auth/me')).status).toBe(200);
    expect((await s.post('/api/v1/auth/logout')).status).toBe(200);
    expect((await s.get('/api/v1/auth/me')).status).toBe(401);
  });

  it('phiên hết hạn khi không hoạt động quá thời gian idle và khi quá hạn tuyệt đối', async () => {
    const s1 = await login(app, fx.users.headA);
    const me1 = await s1.get('/api/v1/auth/me');
    await db.session.update({
      where: { id: me1.body.data.session.id },
      data: { lastSeenAt: new Date(Date.now() - 31 * 60_000) },
    });
    expect((await s1.get('/api/v1/auth/me')).status).toBe(401);

    const s2 = await login(app, fx.users.headA);
    const me2 = await s2.get('/api/v1/auth/me');
    await db.session.update({
      where: { id: me2.body.data.session.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await s2.get('/api/v1/auth/me')).status).toBe(401);
  });

  it('request thay đổi dữ liệu thiếu/sai CSRF token → 403', async () => {
    const s = await login(app, fx.users.officer);
    const body = { code: `CSRF-${fx.sfx}`, name: 'Thử CSRF', group: 'PROFESSIONAL' };
    const noToken = await s.agent
      .post('/api/v1/job-positions')
      .set('Origin', TEST_ORIGIN)
      .send(body);
    expect(noToken.status).toBe(403);
    expect(noToken.body.error.code).toBe('CSRF_INVALID');
    const badToken = await s.agent
      .post('/api/v1/auth/logout')
      .set('Origin', TEST_ORIGIN)
      .set('X-CSRF-Token', 'gia-mao')
      .send();
    expect(badToken.status).toBe(403);
    expect(badToken.body.error.code).toBe('CSRF_INVALID');
    // Phiên vẫn còn hiệu lực vì đăng xuất giả mạo bị chặn
    expect((await s.get('/api/v1/auth/me')).status).toBe(200);
  });

  it('khóa tài khoản bởi quản trị làm mất hiệu lực phiên đang mở', async () => {
    const victim = await login(app, fx.users.headB);
    const admin = await login(app, fx.users.admin);
    const user = await db.user.findUniqueOrThrow({ where: { username: fx.users.headB } });
    expect((await admin.post(`/api/v1/users/${user.id}/lock`, { reason: 'Kiểm thử' })).status).toBe(
      200,
    );
    expect((await victim.get('/api/v1/auth/me')).status).toBe(401);
    expect((await admin.post(`/api/v1/users/${user.id}/unlock`)).status).toBe(200);
  });

  describe('mật khẩu tạm — bắt buộc đổi trước khi dùng hệ thống', () => {
    it('đặt lại mật khẩu → chỉ được đổi mật khẩu; sau khi đổi dùng bình thường và phiên khác bị thu hồi', async () => {
      const admin = await login(app, fx.users.admin);
      const target = await db.user.findUniqueOrThrow({ where: { username: fx.users.staffA1 } });
      const otherSession = await login(app, fx.users.staffA1);

      const reset = await admin.post(`/api/v1/users/${target.id}/reset-password`);
      expect(reset.status).toBe(200);
      const temp = reset.body.data.temporaryPassword as string;
      expect(temp).toHaveLength(16);
      expect((await otherSession.get('/api/v1/auth/me')).status).toBe(401);

      const s = await login(app, fx.users.staffA1, temp);
      const me = await s.get('/api/v1/auth/me');
      expect(me.body.data.user.mustChangePassword).toBe(true);
      const blocked = await s.get('/api/v1/employees');
      expect(blocked.status).toBe(403);
      expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');

      const weak = await s.post('/api/v1/auth/change-password', {
        currentPassword: temp,
        newPassword: 'ngan',
        confirmPassword: 'ngan',
      });
      expect(weak.status).toBe(400);

      const changed = await s.post('/api/v1/auth/change-password', {
        currentPassword: temp,
        newPassword: TEST_PASSWORD,
        confirmPassword: TEST_PASSWORD,
      });
      expect(changed.status).toBe(200);
      expect((await s.get('/api/v1/employees')).status).toBe(200);
    });

    it('đổi mật khẩu sai mật khẩu hiện tại → 400', async () => {
      const s = await login(app, fx.users.headA);
      const res = await s.post('/api/v1/auth/change-password', {
        currentPassword: 'Khong-Dung#123',
        newPassword: 'Mat-Khau-Moi#2026',
        confirmPassword: 'Mat-Khau-Moi#2026',
      });
      expect(res.status).toBe(400);
    });
  });

  it('danh sách phiên của bản thân và thu hồi phiên khác', async () => {
    const a = await login(app, fx.users.officer);
    const b = await login(app, fx.users.officer);
    const meB = await b.get('/api/v1/auth/me');
    const list = await a.get('/api/v1/auth/sessions');
    expect(list.body.data.some((x: { id: string }) => x.id === meB.body.data.session.id)).toBe(
      true,
    );
    expect((await a.del(`/api/v1/auth/sessions/${meB.body.data.session.id}`)).status).toBe(200);
    expect((await b.get('/api/v1/auth/me')).status).toBe(401);
  });

  it('ghi nhật ký đăng nhập thành công và thất bại', async () => {
    const user = await db.user.findUniqueOrThrow({ where: { username: fx.users.headA } });
    const logs = await db.auditLog.findMany({ where: { action: 'auth.login', entityId: user.id } });
    expect(logs.some((l) => l.result === 'SUCCESS')).toBe(true);
    const failed = await db.auditLog.findMany({
      where: { action: 'auth.login', result: 'FAILURE' },
    });
    expect(failed.length).toBeGreaterThan(0);
    expect(JSON.stringify(failed.map((l) => l.changes))).not.toContain(TEST_PASSWORD);
  });
});
