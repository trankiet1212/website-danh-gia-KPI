/**
 * /api/v1/work-catalogs — xem: catalog.read (mặc định chỉ mục theo VTVL của người dùng); phê duyệt: catalog.approve;
 * phân danh mục theo vị trí việc làm: catalog.assign (docs/04 "Danh mục theo vị trí việc làm").
 */
import { Router } from 'express';
import { z } from 'zod';
import {
  assignJobPositionItemsSchema,
  catalogItemsQuerySchema,
  decisionSchema,
  uuid,
  type AssignJobPositionItemsInput,
  type CatalogItemsQuery,
  type DecisionInput,
} from '@kpi/shared';
import type { AppDeps } from '../../app.js';
import { actorOf, authorize, requireAuth } from '../../auth/middleware.js';
import { sendData, validBody, validParams, validQuery } from '../../lib/http.js';
import { validate } from '../../middlewares/validate.js';
import { createWorkCatalogsService } from './service.js';

const idParams = z.object({ id: uuid });

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
    validate({ params: idParams, query: catalogItemsQuerySchema }),
    async (req, res) => {
      sendData(
        res,
        await service.items(requireAuth(req), id(req), validQuery<CatalogItemsQuery>(req)),
      );
    },
  );
  router.get('/my-job-position', canRead, async (req, res) =>
    sendData(res, await service.myJobPosition(requireAuth(req))),
  );
  const canAssign = authorize(deps.db, 'catalog.assign');
  router.get('/job-positions', canAssign, async (_req, res) =>
    sendData(res, await service.jobPositions()),
  );
  router.put(
    '/job-positions/:id/items',
    canAssign,
    validate({ params: idParams, body: assignJobPositionItemsSchema }),
    async (req, res) => {
      sendData(
        res,
        await service.assignItems(
          requireAuth(req),
          id(req),
          validBody<AssignJobPositionItemsInput>(req),
          actorOf(req),
        ),
      );
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
