/**
 * Health-check.
 *  GET /api/v1/health       — trạng thái ứng dụng + kết nối DB. 200 khi DB lên, 503 khi DB xuống.
 *  GET /api/v1/health/live  — tiến trình còn sống (không chạm DB), dùng cho liveness probe.
 * Không lộ thông tin lỗi nội bộ (chuỗi kết nối, host, thông điệp driver) ra ngoài;
 * ở production không trả phiên bản, môi trường, thời gian chạy.
 */
import { Router } from 'express';
import type { ApiSuccess, HealthResponse } from '@kpi/shared';
import type { AppDeps } from '../../app.js';

export function healthRouter(
  deps: Pick<AppDeps, 'checkDatabase' | 'logger' | 'version' | 'config'>,
): Router {
  const router = Router();

  router.get('/live', (_req, res) => {
    res.json({ data: { status: 'ok' } });
  });

  router.get('/', async (req, res) => {
    const db = await deps.checkDatabase();
    if (!db.ok) {
      deps.logger.warn(
        { requestId: req.id, dbError: db.error },
        'Health-check: không kết nối được database',
      );
    }
    const body: ApiSuccess<HealthResponse> = {
      data: {
        status: db.ok ? 'ok' : 'degraded',
        service: 'kpi-api',
        // Production: không công khai phiên bản, môi trường, thời gian chạy (giảm thông tin cho người dò quét)
        ...(deps.config.nodeEnv === 'production'
          ? {}
          : {
              version: deps.version,
              environment: deps.config.nodeEnv,
              uptimeSeconds: Math.round(process.uptime()),
            }),
        timestamp: new Date().toISOString(),
        checks: { database: { status: db.ok ? 'up' : 'down', latencyMs: db.latencyMs } },
      },
    };
    res.status(db.ok ? 200 : 503).json(body);
  });

  return router;
}
