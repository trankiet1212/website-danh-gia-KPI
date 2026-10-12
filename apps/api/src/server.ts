/**
 * Điểm khởi động API: nạp cấu hình, kết nối DB, lắng nghe cổng, tắt an toàn khi nhận tín hiệu dừng.
 */
import { readFileSync } from 'node:fs';
import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { createLogger } from './lib/logger.js';
import { checkDatabase, createPrismaClient } from './lib/prisma.js';

function readVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      version?: string;
    };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger({ level: env.LOG_LEVEL, pretty: env.NODE_ENV === 'development' });
  const db = createPrismaClient(env.DATABASE_URL);

  const app = createApp({
    config: {
      nodeEnv: env.NODE_ENV,
      corsOrigins: env.CORS_ORIGINS,
      trustProxy: env.TRUST_PROXY,
      bodyLimit: env.BODY_LIMIT,
      loginRateLimit: env.LOGIN_RATE_LIMIT,
      auth: {
        sessionSecret: env.SESSION_SECRET,
        idleMinutes: env.SESSION_IDLE_MINUTES,
        absoluteHours: env.SESSION_ABSOLUTE_HOURS,
        maxFailedAttempts: env.LOGIN_MAX_ATTEMPTS,
        lockMinutes: env.LOGIN_LOCK_MINUTES,
        secureCookies: env.NODE_ENV === 'production',
      },
    },
    logger,
    version: readVersion(),
    db,
    checkDatabase: () => checkDatabase(db),
  });

  const startup = await checkDatabase(db);
  if (startup.ok) {
    logger.info({ latencyMs: startup.latencyMs }, 'Đã kết nối PostgreSQL');
  } else {
    // Không thoát: API vẫn chạy và /health báo "degraded" để vận hành dễ chẩn đoán.
    logger.warn(
      { dbError: startup.error },
      'CHƯA kết nối được PostgreSQL — kiểm tra `npm run db:up` và DATABASE_URL',
    );
  }

  const server = app.listen(env.API_PORT, () => {
    logger.info(
      { port: env.API_PORT, env: env.NODE_ENV, corsOrigins: env.CORS_ORIGINS },
      `API đang chạy tại http://localhost:${env.API_PORT}/api/v1`,
    );
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Đang dừng API...');
    server.close(() => {
      db.$disconnect()
        .catch((err: unknown) => logger.error({ err }, 'Lỗi khi đóng kết nối DB'))
        .finally(() => process.exit(0));
    });
    // Ép thoát nếu còn kết nối treo quá 10 giây
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'Unhandled promise rejection');
    shutdown('unhandledRejection');
  });
}

main().catch((err: unknown) => {
  // Lỗi cấu hình (env) hoặc khởi động: in rõ ràng rồi thoát mã 1.
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
