/** /api/v1/dashboard — quyền dashboard.read, số liệu lọc theo phạm vi. */
import { Router } from 'express';
import { dashboardQuerySchema, type DashboardQuery } from '@kpi/shared';
import type { AppDeps } from '../../app.js';
import { authorize, requireAuth } from '../../auth/middleware.js';
import { sendData, validQuery } from '../../lib/http.js';
import { validate } from '../../middlewares/validate.js';
import { createDashboardService } from './service.js';

export function dashboardRouter(deps: AppDeps): Router {
  const service = createDashboardService(deps.db);
  const router = Router();
  router.get(
    '/summary',
    authorize(deps.db, 'dashboard.read'),
    validate({ query: dashboardQuerySchema }),
    async (req, res) => {
      sendData(res, await service.summary(requireAuth(req), validQuery<DashboardQuery>(req)));
    },
  );
  return router;
}
