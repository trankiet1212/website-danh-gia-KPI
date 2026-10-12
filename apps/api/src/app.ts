/**
 * Tạo Express app từ các phụ thuộc được truyền vào (dễ kiểm thử: test truyền checkDatabase giả).
 * Thứ tự middleware: log + requestId → security headers → CORS → body/cookie parser → /api/v1 → 404 → lỗi.
 */
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express, type RequestHandler } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';
import type { AuthConfig } from './auth/types.js';
import type { DatabaseCheckResult, Db } from './lib/prisma.js';
import { buildCorsOptions } from './middlewares/cors.js';
import { errorHandler, notFoundHandler } from './middlewares/error-handler.js';
import { genRequestId } from './middlewares/request-id.js';
import { apiRouter } from './routes.js';

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  corsOrigins: readonly string[];
  trustProxy: boolean | number;
  bodyLimit: string;
  auth: AuthConfig;
  /** Số lần gọi /auth/login tối đa mỗi 15 phút cho một IP. */
  loginRateLimit: number;
}

export interface AppDeps {
  config: AppConfig;
  logger: Logger;
  version: string;
  db: Db;
  checkDatabase: () => Promise<DatabaseCheckResult>;
}

/** API trả JSON động — không cho trình duyệt/proxy lưu cache. */
const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};

export function createApp(deps: AppDeps): Express {
  const { config, logger } = deps;
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(
    pinoHttp({
      logger,
      genReqId: genRequestId,
      autoLogging: { ignore: (req) => req.url === '/api/v1/health/live' },
      customLogLevel: (_req, res, err) =>
        err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
    }),
  );

  app.use(
    helmet({
      // API chỉ trả JSON: chặn mọi tài nguyên nhúng và việc bị nhúng vào frame.
      contentSecurityPolicy: {
        useDefaults: false,
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
      // HSTS chỉ có ý nghĩa khi chạy HTTPS (production sau reverse proxy).
      strictTransportSecurity: config.nodeEnv === 'production',
    }),
  );

  app.use(cors(buildCorsOptions(config.corsOrigins)));
  app.use(express.json({ limit: config.bodyLimit }));
  app.use(cookieParser());

  app.use('/api/v1', noStore, apiRouter(deps));

  app.use(notFoundHandler());
  app.use(errorHandler(logger));
  return app;
}
