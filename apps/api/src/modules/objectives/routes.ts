/** /api/v1/objectives, /api/v1/key-results — xem: objective.read; sửa: objective.write (kèm phạm vi). */
import { Router } from 'express';
import { z } from 'zod';
import {
  checkinSchema,
  createObjectiveSchema,
  keyResultSchema,
  objectiveListQuerySchema,
  updateKeyResultSchema,
  updateObjectiveSchema,
  uuid,
  type CreateObjectiveInput,
  type KeyResultInput,
  type UpdateObjectiveInput,
} from '@kpi/shared';
import type { AppDeps } from '../../app.js';
import { actorOf, authorize, requireAuth } from '../../auth/middleware.js';
import { sendData, validBody, validParams, validQuery } from '../../lib/http.js';
import { validate } from '../../middlewares/validate.js';
import { createObjectivesService } from './service.js';

const idParams = z.object({ id: uuid });

export function objectivesRouter(deps: AppDeps): Router {
  const service = createObjectivesService(deps.db);
  const router = Router();
  const canRead = authorize(deps.db, 'objective.read');
  const canWrite = authorize(deps.db, 'objective.write');
  const id = (req: Parameters<typeof validParams>[0]) => validParams<{ id: string }>(req).id;

  router.get('/', canRead, validate({ query: objectiveListQuerySchema }), async (req, res) => {
    sendData(res, await service.list(requireAuth(req), validQuery(req)));
  });
  router.get('/:id', canRead, validate({ params: idParams }), async (req, res) => {
    sendData(res, await service.get(requireAuth(req), id(req)));
  });
  router.post('/', canWrite, validate({ body: createObjectiveSchema }), async (req, res) => {
    sendData(
      res,
      await service.create(requireAuth(req), validBody<CreateObjectiveInput>(req), actorOf(req)),
      201,
    );
  });
  router.patch(
    '/:id',
    canWrite,
    validate({ params: idParams, body: updateObjectiveSchema }),
    async (req, res) => {
      sendData(
        res,
        await service.update(
          requireAuth(req),
          id(req),
          validBody<UpdateObjectiveInput>(req),
          actorOf(req),
        ),
      );
    },
  );
  router.post(
    '/:id/key-results',
    canWrite,
    validate({ params: idParams, body: keyResultSchema }),
    async (req, res) => {
      sendData(
        res,
        await service.addKeyResult(
          requireAuth(req),
          id(req),
          validBody<KeyResultInput>(req),
          actorOf(req),
        ),
        201,
      );
    },
  );
  return router;
}

export function keyResultsRouter(deps: AppDeps): Router {
  const service = createObjectivesService(deps.db);
  const router = Router();
  const canWrite = authorize(deps.db, 'objective.write');
  const id = (req: Parameters<typeof validParams>[0]) => validParams<{ id: string }>(req).id;

  router.patch(
    '/:id',
    canWrite,
    validate({ params: idParams, body: updateKeyResultSchema }),
    async (req, res) => {
      const body = validBody<KeyResultInput & { version: number }>(req);
      sendData(res, await service.updateKeyResult(requireAuth(req), id(req), body, actorOf(req)));
    },
  );
  router.post(
    '/:id/checkins',
    canWrite,
    validate({ params: idParams, body: checkinSchema }),
    async (req, res) => {
      const body = validBody<{ value: number; note?: string | null }>(req);
      sendData(res, await service.checkin(requireAuth(req), id(req), body, actorOf(req)), 201);
    },
  );
  return router;
}
