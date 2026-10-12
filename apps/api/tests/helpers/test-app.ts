import { pino } from 'pino';
import { createApp, type AppConfig } from '../../src/app.js';
import { createPrismaClient, type DatabaseCheckResult, type Db } from '../../src/lib/prisma.js';

export const TEST_ORIGIN = 'http://localhost:5173';

export const TEST_AUTH_CONFIG = {
  sessionSecret: 'test-session-secret-0123456789abcdef-0123456789',
  idleMinutes: 30,
  absoluteHours: 8,
  maxFailedAttempts: 5,
  lockMinutes: 15,
  secureCookies: false,
} satisfies AppConfig['auth'];

function baseConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    nodeEnv: 'test',
    corsOrigins: [TEST_ORIGIN],
    trustProxy: false,
    bodyLimit: '1kb',
    loginRateLimit: 1000,
    auth: TEST_AUTH_CONFIG,
    ...overrides,
  };
}

/**
 * App cho test KHÔNG cần PostgreSQL: health dùng kết quả DB giả lập.
 * PrismaClient trỏ tới địa chỉ không tồn tại và không bao giờ được gọi trong các test này.
 */
export function buildTestApp(
  options: { db?: DatabaseCheckResult; config?: Partial<AppConfig> } = {},
) {
  const dbResult = options.db ?? { ok: true, latencyMs: 3 };
  return createApp({
    config: baseConfig(options.config),
    logger: pino({ level: 'silent' }),
    version: '0.0.0-test',
    db: createPrismaClient('postgresql://unused:unused@127.0.0.1:1/unused'),
    checkDatabase: async () => dbResult,
  });
}

/** App cho test tích hợp với database kiểm thử thật (web_kpi_test). */
export function buildDbTestApp(db: Db, config: Partial<AppConfig> = {}) {
  return createApp({
    config: baseConfig({ bodyLimit: '1mb', ...config }),
    logger: pino({ level: 'silent' }),
    version: '0.0.0-test',
    db,
    checkDatabase: async () => ({ ok: true, latencyMs: 1 }),
  });
}
