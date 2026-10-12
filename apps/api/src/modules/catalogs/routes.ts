/** /api/v1/positions và /api/v1/job-positions — đọc: org.read; ghi: org.manage. */
import { Router } from 'express';
import { z } from 'zod';
import {
  catalogListQuerySchema,
  createJobPositionSchema,
  createPositionSchema,
  updateJobPositionSchema,
  updatePositionSchema,
  uuid,
} from '@kpi/shared';
import type {
  CreateJobPositionInput,
  CreatePositionInput,
  UpdateJobPositionInput,
  UpdatePositionInput,
} from '@kpi/shared';
import type { AppDeps } from '../../app.js';
import { actorOf, authorize } from '../../auth/middleware.js';
import { sendData, validBody, validParams, validQuery } from '../../lib/http.js';
import { validate } from '../../middlewares/validate.js';
import { createCatalogsService } from './service.js';

const idParams = z.object({ id: uuid });
const id = (req: Parameters<typeof validParams>[0]) => validParams<{ id: string }>(req).id;
const includeArchived = (req: Parameters<typeof validQuery>[0]) =>
  validQuery<{ includeArchived?: boolean }>(req).includeArchived ?? false;

export function positionsRouter(deps: AppDeps): Router {
  const { db } = deps;
  const service = createCatalogsService(db);
  const router = Router();
  const canRead = authorize(db, 'org.read');
  const canManage = authorize(db, 'org.manage');

  router.get('/', canRead, validate({ query: catalogListQuerySchema }), async (req, res) =>
    sendData(res, await service.listPositions(includeArchived(req))),
  );
  router.post('/', canManage, validate({ body: createPositionSchema }), async (req, res) =>
    sendData(
      res,
      await service.createPosition(validBody<CreatePositionInput>(req), actorOf(req)),
      201,
    ),
  );
  router.patch(
    '/:id',
    canManage,
    validate({ params: idParams, body: updatePositionSchema }),
    async (req, res) =>
      sendData(
        res,
        await service.updatePosition(id(req), validBody<UpdatePositionInput>(req), actorOf(req)),
      ),
  );
  router.post('/:id/archive', canManage, validate({ params: idParams }), async (req, res) =>
    sendData(res, await service.setPositionArchived(id(req), true, actorOf(req))),
  );
  router.post('/:id/restore', canManage, validate({ params: idParams }), async (req, res) =>
    sendData(res, await service.setPositionArchived(id(req), false, actorOf(req))),
  );
  return router;
}

export function jobPositionsRouter(deps: AppDeps): Router {
  const { db } = deps;
  const service = createCatalogsService(db);
  const router = Router();
  const canRead = authorize(db, 'org.read');
  const canManage = authorize(db, 'org.manage');

  router.get('/', canRead, validate({ query: catalogListQuerySchema }), async (req, res) =>
    sendData(res, await service.listJobPositions(includeArchived(req))),
  );
  router.post('/', canManage, validate({ body: createJobPositionSchema }), async (req, res) =>
    sendData(
      res,
      await service.createJobPosition(validBody<CreateJobPositionInput>(req), actorOf(req)),
      201,
    ),
  );
  router.patch(
    '/:id',
    canManage,
    validate({ params: idParams, body: updateJobPositionSchema }),
    async (req, res) =>
      sendData(
        res,
        await service.updateJobPosition(
          id(req),
          validBody<UpdateJobPositionInput>(req),
          actorOf(req),
        ),
      ),
  );
  router.post('/:id/archive', canManage, validate({ params: idParams }), async (req, res) =>
    sendData(res, await service.setJobPositionArchived(id(req), true, actorOf(req))),
  );
  router.post('/:id/restore', canManage, validate({ params: idParams }), async (req, res) =>
    sendData(res, await service.setJobPositionArchived(id(req), false, actorOf(req))),
  );
  return router;
}
