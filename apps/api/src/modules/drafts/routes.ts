/** /api/v1/drafts — dự thảo văn bản theo mẫu (draft.create + report.read; dữ liệu theo phạm vi report.read). */
import { Router } from 'express';
import { draftRequestSchema, type DraftRequest } from '@kpi/shared';
import type { AppDeps } from '../../app.js';
import { actorOf, authorize, requireAuth } from '../../auth/middleware.js';
import { sendData, validBody } from '../../lib/http.js';
import { exportLimiter } from '../../middlewares/export-limit.js';
import { validate } from '../../middlewares/validate.js';
import { sendFile } from '../reports/routes.js';
import { createDraftsService } from './service.js';

export function draftsRouter(deps: AppDeps): Router {
  const service = createDraftsService(deps.db);
  const router = Router();
  const can = authorize(deps.db, 'draft.create', 'report.read');

  router.get('/templates', can, (_req, res) => sendData(res, service.templates()));
  router.post('/preview', can, validate({ body: draftRequestSchema }), async (req, res) => {
    sendData(
      res,
      await service.preview(requireAuth(req), validBody<DraftRequest>(req), actorOf(req)),
    );
  });
  router.post(
    '/pdf',
    can,
    exportLimiter(),
    validate({ body: draftRequestSchema }),
    async (req, res) => {
      sendFile(
        res,
        await service.pdf(requireAuth(req), validBody<DraftRequest>(req), actorOf(req)),
      );
    },
  );
  return router;
}
