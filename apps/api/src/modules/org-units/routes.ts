/** /api/v1/org-units — đọc: org.read; ghi: org.manage. */
import { Router } from 'express';
import { z } from 'zod';
import { createUnitSchema, unitListQuerySchema, updateUnitSchema, uuid } from '@kpi/shared';
import type { CreateUnitInput, UpdateUnitInput } from '@kpi/shared';
import type { AppDeps } from '../../app.js';
import { actorOf, authorize } from '../../auth/middleware.js';
import { sendData, validBody, validParams, validQuery } from '../../lib/http.js';
import { validate } from '../../middlewares/validate.js';
import { createOrgUnitsService } from './service.js';

const idParams = z.object({ id: uuid });

export function orgUnitsRouter(deps: AppDeps): Router {
  const { db } = deps;
  const service = createOrgUnitsService(db);
  const router = Router();
  const canRead = authorize(db, 'org.read');
  const canManage = authorize(db, 'org.manage');

  router.get('/', canRead, validate({ query: unitListQuerySchema }), async (req, res) => {
    sendData(
      res,
      await service.list(validQuery<{ includeArchived?: boolean }>(req).includeArchived ?? false),
    );
  });
  router.get('/:id', canRead, validate({ params: idParams }), async (req, res) => {
    sendData(res, await service.get(validParams<{ id: string }>(req).id));
  });
  router.post('/', canManage, validate({ body: createUnitSchema }), async (req, res) => {
    sendData(res, await service.create(validBody<CreateUnitInput>(req), actorOf(req)), 201);
  });
  router.patch(
    '/:id',
    canManage,
    validate({ params: idParams, body: updateUnitSchema }),
    async (req, res) => {
      sendData(
        res,
        await service.update(
          validParams<{ id: string }>(req).id,
          validBody<UpdateUnitInput>(req),
          actorOf(req),
        ),
      );
    },
  );
  router.post('/:id/archive', canManage, validate({ params: idParams }), async (req, res) => {
    sendData(
      res,
      await service.setArchived(validParams<{ id: string }>(req).id, true, actorOf(req)),
    );
  });
  router.post('/:id/restore', canManage, validate({ params: idParams }), async (req, res) => {
    sendData(
      res,
      await service.setArchived(validParams<{ id: string }>(req).id, false, actorOf(req)),
    );
  });
  return router;
}
