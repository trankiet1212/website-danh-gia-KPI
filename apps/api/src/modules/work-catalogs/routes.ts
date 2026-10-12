/** /api/v1/work-catalogs — xem: catalog.read; phê duyệt: catalog.approve. */
import { Router } from 'express';
import { z } from 'zod';
import { decisionSchema, uuid, type DecisionInput } from '@kpi/shared';
import type { AppDeps } from '../../app.js';
import { actorOf, authorize, requireAuth } from '../../auth/middleware.js';
import { sendData, validBody, validParams, validQuery } from '../../lib/http.js';
import { validate } from '../../middlewares/validate.js';
import { createWorkCatalogsService } from './service.js';

const idParams = z.object({ id: uuid });
const itemsQuery = z.object({
  q: z.string().trim().max(200).optional(),
  groupCode: z.string().max(10).optional(),
});

export function workCatalogsRouter(deps: AppDeps): Router {
  const service = createWorkCatalogsService(deps.db);
  const router = Router();
  const canRead = authorize(deps.db, 'catalog.read');
  const id = (req: Parameters<typeof validParams>[0]) => validParams<{ id: string }>(req).id;

  router.get('/versions', canRead, async (_req, res) =>
    sendData(res, await service.listVersions()),
  );
  router.get(
    '/versions/:id/items',
    canRead,
    validate({ params: idParams, query: itemsQuery }),
    async (req, res) => {
      const q = validQuery<{ q?: string; groupCode?: string }>(req);
      sendData(res, await service.items(id(req), q.q || undefined, q.groupCode || undefined));
    },
  );
  router.post(
    '/versions/:id/approve',
    authorize(deps.db, 'catalog.approve'),
    validate({ params: idParams, body: decisionSchema }),
    async (req, res) => {
      sendData(
        res,
        await service.approve(
          requireAuth(req),
          id(req),
          validBody<DecisionInput>(req),
          actorOf(req),
        ),
      );
    },
  );
  return router;
}
