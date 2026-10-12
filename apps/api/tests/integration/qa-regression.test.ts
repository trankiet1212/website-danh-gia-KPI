/**
 * Test hồi quy cho các lỗi tìm được trong đợt QA/rà soát bảo mật (docs/12-qa-bao-cao.md).
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mapPrismaError } from '../../src/lib/db-errors.js';
import { AppError } from '../../src/lib/errors.js';
import type { Db } from '../../src/lib/prisma.js';
import {
  TEST_DATABASE_URL,
  createFixture,
  createTestDb,
  login,
  type Fixture,
  type Session,
} from '../helpers/fixture.js';
import { createQuarter, createReportSetup, createRuleSetVersion } from '../helpers/kpi-fixture.js';
import { buildDbTestApp, buildTestApp } from '../helpers/test-app.js';

describe('QA-05: /health công khai không lộ thông tin triển khai ở production', () => {
  it('production: không có version, environment, uptime', async () => {
    const res = await request(buildTestApp({ config: { nodeEnv: 'production' } })).get(
      '/api/v1/health',
    );
    expect(res.status).toBe(200);
    expect(res.body.data).not.toHaveProperty('version');
    expect(res.body.data).not.toHaveProperty('environment');
    expect(res.body.data).not.toHaveProperty('uptimeSeconds');
    expect(res.body.data.checks.database.status).toBe('up');
  });

  it('môi trường phát triển vẫn hiển thị để chẩn đoán', async () => {
    const res = await request(buildTestApp()).get('/api/v1/health');
    expect(res.body.data.environment).toBe('test');
  });
});

describe('QA-03: lỗi ràng buộc DB lọt qua service không thành HTTP 500', () => {
  it('trùng khóa → 409 DUPLICATE; trigger khóa dữ liệu → 409 INVALID_TRANSITION', () => {
    const dup = mapPrismaError({ code: 'P2002', meta: { target: ['code'] } });
    expect(dup).toBeInstanceOf(AppError);
    expect((dup as AppError).status).toBe(409);
    const locked = mapPrismaError({
      message: 'Hồ sơ đánh giá đã phê duyệt bị khóa — phải thực hiện quy trình mở lại',
    });
    expect((locked as AppError).code).toBe('INVALID_TRANSITION');
    const other = new Error('khác');
    expect(mapPrismaError(other)).toBe(other);
  });
});

describe.skipIf(!TEST_DATABASE_URL)('QA — gửi đồng thời và giới hạn xuất file', () => {
  let db: Db;
  let fx: Fixture;
  let officer: Session;
  let app: ReturnType<typeof buildDbTestApp>;

  beforeAll(async () => {
    db = createTestDb();
    fx = await createFixture(db);
    app = buildDbTestApp(db);
    officer = await login(app, fx.users.officer);
  });
  afterAll(async () => db?.$disconnect());

  it('QA-01: nhiều người tạo phiên bản bộ quy tắc cùng lúc → đều thành công, số phiên bản không trùng', async () => {
    const template = await createRuleSetVersion(db, fx);
    const set = await officer.post('/api/v1/rule-sets', {
      code: `RSC-${fx.sfx}`,
      name: 'Đồng thời',
    });
    const results = await Promise.all(
      [1, 2, 3, 4].map(() =>
        officer.post(`/api/v1/rule-sets/${set.body.data.id}/versions`, {
          cloneFromVersionId: template.id,
        }),
      ),
    );
    expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201]);
    expect(results.map((r) => r.body.data.versionNo).sort()).toEqual([1, 2, 3, 4]);
  });

  it('QA-02: nhiều người tạo phiên bản bộ tiêu chí cùng lúc → đều thành công, số phiên bản không trùng', async () => {
    const set = await officer.post('/api/v1/criteria-sets', {
      code: `CSC-${fx.sfx}`,
      name: 'Đồng thời',
      kpiProfile: 'STAFF',
    });
    const results = await Promise.all(
      [1, 2, 3].map(() => officer.post(`/api/v1/criteria-sets/${set.body.data.id}/versions`, {})),
    );
    expect(results.map((r) => r.status)).toEqual([201, 201, 201]);
    expect(results.map((r) => r.body.data.versionNo).sort()).toEqual([1, 2, 3]);
  });

  it('QA-04: sinh cây kỳ cùng một năm đồng thời → không lỗi, không tạo trùng', async () => {
    const year = 2030 + (Number.parseInt(fx.sfx, 16) % 60);
    const results = await Promise.all(
      [1, 2, 3].map(() => officer.post('/api/v1/periods/generate-year', { year })),
    );
    expect(results.every((r) => r.status === 201)).toBe(true);
    const created = results.flatMap((r) => r.body.data.created as string[]);
    expect(new Set(created).size).toBe(created.length);
    expect(await db.evaluationPeriod.count({ where: { year } })).toBe(19);
  });

  it('QA-06: xuất file quá nhiều lần trong thời gian ngắn → 429 (theo tài khoản)', async () => {
    const setup = await createReportSetup(db, fx);
    const p = await createQuarter(db, fx, { tag: 'X' });
    await setup.record({
      periodId: p.id,
      employeeId: fx.employees.staffA1,
      unitId: fx.units.A,
      status: 'DRAFT',
    });
    const url = `/api/v1/reports/agency/export?periodId=${p.id}&format=xlsx`;
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) statuses.push((await officer.get(url)).status);
    expect(statuses.slice(0, 30).every((s) => s === 200)).toBe(true);
    expect(statuses[30]).toBe(429);
    // Người dùng khác không bị ảnh hưởng
    const head = await login(app, fx.users.headA);
    expect((await head.get(url)).status).toBe(200);
  });
});
