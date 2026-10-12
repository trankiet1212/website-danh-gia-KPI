/**
 * Dữ liệu kiểm thử trên database web_kpi_test.
 * Mỗi lần gọi tạo một bộ dữ liệu RIÊNG (mã có hậu tố ngẫu nhiên) — test không phụ thuộc nhau,
 * KHÔNG xóa/reset dữ liệu (audit_logs là append-only; DB test chỉ tích lũy thêm).
 *
 * Cơ cấu mẫu:
 *   Đơn vị A: headA (Trưởng phòng) ← deputyA (Phó phòng) ← staffA1 ; staffA2 ← headA
 *   Đơn vị B: headB (Trưởng phòng) ← staffB1
 */
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { config as loadDotenv } from 'dotenv';
import request from 'supertest';
import type { ScopeType } from '@kpi/shared';
import type { Express } from 'express';
import { seedPermissionsAndRoles } from '../../prisma/seed/rbac.js';
import { hashPassword } from '../../src/lib/password.js';
import { createPrismaClient, type Db } from '../../src/lib/prisma.js';
import { TEST_ORIGIN } from './test-app.js';

loadDotenv({ path: path.resolve(import.meta.dirname, '../../../../.env'), quiet: true });
export const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];

export const TEST_PASSWORD = 'Kiem-Thu-Mat-Khau#2026';

export function createTestDb(): Db {
  if (!TEST_DATABASE_URL) throw new Error('Thiếu TEST_DATABASE_URL');
  if (TEST_DATABASE_URL === process.env['DATABASE_URL']) {
    throw new Error('TEST_DATABASE_URL trùng DATABASE_URL — từ chối chạy test trên DB dev');
  }
  return createPrismaClient(TEST_DATABASE_URL);
}

export const suffix = () => randomBytes(4).toString('hex').toUpperCase();

let cachedHash: Promise<string> | undefined;
const passwordHash = () => (cachedHash ??= hashPassword(TEST_PASSWORD));

export interface Fixture {
  sfx: string;
  units: { A: string; B: string };
  positions: { head: string; deputy: string; staff: string };
  jobPositionId: string;
  employees: Record<'headA' | 'deputyA' | 'staffA1' | 'staffA2' | 'headB' | 'staffB1', string>;
  users: Record<
    'admin' | 'officer' | 'headA' | 'deputyA' | 'staffA1' | 'headB' | 'ptbA' | 'noRole',
    string
  >;
}

export async function createFixture(db: Db): Promise<Fixture> {
  await seedPermissionsAndRoles(db);
  const sfx = suffix();
  const roleId = new Map((await db.role.findMany()).map((r) => [r.code, r.id]));

  const unit = (code: string) =>
    db.organizationalUnit.create({
      data: { code: `${code}-${sfx}`, name: `Phòng ${code} ${sfx}`, type: 'DEPARTMENT' },
    });
  const [A, B] = [await unit('TA'), await unit('TB')];

  const pos = (code: string, level: number, isLeadership: boolean) =>
    db.position.create({
      data: {
        code: `${code}-${sfx}`,
        name: `${code} ${sfx}`,
        level,
        isLeadership,
        kpiProfile: isLeadership ? 'LEADER' : 'STAFF',
      },
    });
  const [head, deputy, staff] = [
    await pos('TP', 3, true),
    await pos('PP', 4, true),
    await pos('CV', 5, false),
  ];
  const job = await db.jobPosition.create({
    data: { code: `VT-${sfx}`, name: `VTVL ${sfx}`, group: 'PROFESSIONAL' },
  });

  const emp = async (key: string, unitId: string, positionId: string, managerId: string | null) => {
    const e = await db.employee.create({
      data: {
        employeeCode: `E-${key}-${sfx}`,
        fullName: `Cán bộ ${key} ${sfx}`,
        email: `${key.toLowerCase()}.${sfx.toLowerCase()}@test.vn`,
      },
    });
    await db.employeeAssignment.create({
      data: {
        employeeId: e.id,
        unitId,
        positionId,
        jobPositionId: job.id,
        managerEmployeeId: managerId,
        startDate: new Date('2026-01-01T00:00:00Z'),
      },
    });
    return e.id;
  };
  const headA = await emp('HEADA', A.id, head.id, null);
  const deputyA = await emp('DEPA', A.id, deputy.id, headA);
  const staffA1 = await emp('STA1', A.id, staff.id, deputyA);
  const staffA2 = await emp('STA2', A.id, staff.id, headA);
  const headB = await emp('HEADB', B.id, head.id, null);
  const staffB1 = await emp('STB1', B.id, staff.id, headB);

  const user = async (
    name: string,
    employeeId: string | null,
    grants: { role: string; scope: ScopeType; units?: string[] }[],
  ) => {
    const u = await db.user.create({
      data: {
        username: `${name}-${sfx}`.toLowerCase(),
        displayName: employeeId ? null : `Người dùng ${name}`,
        employeeId,
        passwordHash: await passwordHash(),
        mustChangePassword: false,
      },
    });
    for (const g of grants) {
      await db.userRole.create({
        data: {
          userId: u.id,
          roleId: roleId.get(g.role)!,
          scopeType: g.scope,
          units: { create: (g.units ?? []).map((unitId) => ({ unitId })) },
        },
      });
    }
    return u.username;
  };

  const users = {
    admin: await user('admin', null, [{ role: 'SUPER_ADMIN', scope: 'NONE' }]),
    officer: await user('officer', null, [{ role: 'EVAL_OFFICER', scope: 'ALL' }]),
    headA: await user('heada', headA, [
      { role: 'UNIT_LEADER', scope: 'OWN_UNIT' },
      { role: 'EMPLOYEE', scope: 'SELF' },
    ]),
    deputyA: await user('deputya', deputyA, [
      { role: 'UNIT_LEADER', scope: 'MANAGED' },
      { role: 'EMPLOYEE', scope: 'SELF' },
    ]),
    staffA1: await user('staffa1', staffA1, [{ role: 'EMPLOYEE', scope: 'SELF' }]),
    headB: await user('headb', headB, [
      { role: 'UNIT_LEADER', scope: 'OWN_UNIT' },
      { role: 'EMPLOYEE', scope: 'SELF' },
    ]),
    ptbA: await user('ptba', null, [{ role: 'AGENCY_LEADER', scope: 'UNITS', units: [A.id] }]),
    noRole: await user('norole', null, []),
  };

  return {
    sfx,
    units: { A: A.id, B: B.id },
    positions: { head: head.id, deputy: deputy.id, staff: staff.id },
    jobPositionId: job.id,
    employees: { headA, deputyA, staffA1, staffA2, headB, staffB1 },
    users,
  };
}

export interface Session {
  agent: ReturnType<typeof request.agent>;
  csrf: string;
  get: (url: string) => request.Test;
  post: (url: string, body?: object) => request.Test;
  patch: (url: string, body?: object) => request.Test;
  put: (url: string, body?: object) => request.Test;
  del: (url: string) => request.Test;
}

/** Đăng nhập và trả về agent giữ cookie + tự gắn CSRF token cho request thay đổi dữ liệu. */
export async function login(
  app: Express,
  username: string,
  password = TEST_PASSWORD,
): Promise<Session> {
  const agent = request.agent(app);
  const res = await agent
    .post('/api/v1/auth/login')
    .set('Origin', TEST_ORIGIN)
    .send({ username, password });
  if (res.status !== 200)
    throw new Error(`Đăng nhập ${username} thất bại: ${res.status} ${JSON.stringify(res.body)}`);
  const csrf = res.body.data.csrfToken as string;
  const withCsrf = (t: request.Test) => t.set('X-CSRF-Token', csrf).set('Origin', TEST_ORIGIN);
  return {
    agent,
    csrf,
    get: (url) => agent.get(url),
    post: (url, body) => withCsrf(agent.post(url)).send(body ?? {}),
    patch: (url, body) => withCsrf(agent.patch(url)).send(body ?? {}),
    put: (url, body) => withCsrf(agent.put(url)).send(body ?? {}),
    del: (url) => withCsrf(agent.delete(url)),
  };
}
