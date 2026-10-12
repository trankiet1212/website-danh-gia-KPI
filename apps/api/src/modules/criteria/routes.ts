/** /api/v1/criteria-sets, /api/v1/criteria-versions — xem: criteria.read; soạn: criteria.write; duyệt: criteria.approve. */
import { Router } from 'express';
import { z } from 'zod';
import {
  createCriteriaSetSchema,
  createCriteriaVersionSchema,
  decisionSchema,
  saveCriteriaItemsSchema,
  uuid,
  type CreateCriteriaSetInput,
  type DecisionInput,
  type SaveCriteriaItemsInput,
} from '@kpi/shared';
import type { AppDeps } from '../../app.js';
import { actorOf, authorize, requireAuth } from '../../auth/middleware.js';
import { sendData, validBody, validParams } from '../../lib/http.js';
import { validate } from '../../middlewares/validate.js';
import { createCriteriaService } from './service.js';

const idParams = z.object({ id: uuid });

export function criteriaSetsRouter(deps: AppDeps): Router {
  const service = createCriteriaService(deps.db);
  const router = Router();
  const canWrite = authorize(deps.db, 'criteria.write');
  const id = (req: Parameters<typeof validParams>[0]) => validParams<{ id: string }>(req).id;

  router.get('/', authorize(deps.db, 'criteria.read'), async (_req, res) =>
    sendData(res, await service.listSets()),
  );
  router.post('/', canWrite, validate({ body: createCriteriaSetSchema }), async (req, res) => {
    sendData(
      res,
      await service.createSet(validBody<CreateCriteriaSetInput>(req), actorOf(req)),
      201,
    );
  });
  router.post(
    '/:id/versions',
    canWrite,
    validate({ params: idParams, body: createCriteriaVersionSchema }),
    async (req, res) => {
      const body = validBody<{ cloneFromVersionId: string | null }>(req);
      sendData(
        res,
        await service.createVersion(
          requireAuth(req),
          id(req),
          body.cloneFromVersionId,
          actorOf(req),
        ),
        201,
      );
    },
  );
  return router;
}

export function criteriaVersionsRouter(deps: AppDeps): Router {
  const service = createCriteriaService(deps.db);
  const router = Router();
  const canWrite = authorize(deps.db, 'criteria.write');
  const canApprove = authorize(deps.db, 'criteria.approve');
  const id = (req: Parameters<typeof validParams>[0]) => validParams<{ id: string }>(req).id;
  const decision = validate({ params: idParams, body: decisionSchema });

  router.get(
    '/:id',
    authorize(deps.db, 'criteria.read'),
    validate({ params: idParams }),
    async (req, res) => sendData(res, await service.getVersion(id(req))),
  );
  router.put(
    '/:id/items',
    canWrite,
    validate({ params: idParams, body: saveCriteriaItemsSchema }),
    async (req, res) => {
      sendData(
        res,
        await service.saveItems(id(req), validBody<SaveCriteriaItemsInput>(req), actorOf(req)),
      );
    },
  );
  router.post('/:id/submit', canWrite, decision, async (req, res) => {
    sendData(res, await service.submit(id(req), validBody<DecisionInput>(req), actorOf(req)));
  });
  router.post('/:id/approve', canApprove, decision, async (req, res) => {
    sendData(
      res,
      await service.approve(requireAuth(req), id(req), validBody<DecisionInput>(req), actorOf(req)),
    );
  });
  router.post('/:id/return', canApprove, decision, async (req, res) => {
    sendData(
      res,
      await service.returnToDraft(id(req), validBody<DecisionInput>(req), actorOf(req)),
    );
  });
  router.post('/:id/retire', canApprove, decision, async (req, res) => {
    sendData(res, await service.retire(id(req), validBody<DecisionInput>(req), actorOf(req)));
  });
  return router;
}
