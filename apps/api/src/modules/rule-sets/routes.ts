/** /api/v1/rule-sets, /api/v1/rule-set-versions — xem: ruleset.read; soạn: ruleset.write; xác nhận: ruleset.confirm. */
import { Router } from 'express';
import { z } from 'zod';
import {
  createRuleSetSchema,
  createRuleSetVersionSchema,
  decisionSchema,
  updateRuleSetVersionSchema,
  uuid,
  type CreateRuleSetInput,
  type DecisionInput,
  type UpdateRuleSetVersionInput,
} from '@kpi/shared';
import type { AppDeps } from '../../app.js';
import { actorOf, authorize, requireAuth } from '../../auth/middleware.js';
import { sendData, validBody, validParams } from '../../lib/http.js';
import { validate } from '../../middlewares/validate.js';
import { createRuleSetsService } from './service.js';

const idParams = z.object({ id: uuid });

export function ruleSetsRouter(deps: AppDeps): Router {
  const service = createRuleSetsService(deps.db);
  const router = Router();
  const canRead = authorize(deps.db, 'ruleset.read');
  const canWrite = authorize(deps.db, 'ruleset.write');
  const id = (req: Parameters<typeof validParams>[0]) => validParams<{ id: string }>(req).id;

  router.get('/', canRead, async (_req, res) => sendData(res, await service.list()));
  router.post('/', canWrite, validate({ body: createRuleSetSchema }), async (req, res) => {
    sendData(res, await service.createSet(validBody<CreateRuleSetInput>(req), actorOf(req)), 201);
  });
  router.post(
    '/:id/versions',
    canWrite,
    validate({ params: idParams, body: createRuleSetVersionSchema }),
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

export function ruleSetVersionsRouter(deps: AppDeps): Router {
  const service = createRuleSetsService(deps.db);
  const router = Router();
  const canRead = authorize(deps.db, 'ruleset.read');
  const canWrite = authorize(deps.db, 'ruleset.write');
  const canConfirm = authorize(deps.db, 'ruleset.confirm');
  const id = (req: Parameters<typeof validParams>[0]) => validParams<{ id: string }>(req).id;
  const decision = validate({ params: idParams, body: decisionSchema });

  router.get('/:id', canRead, validate({ params: idParams }), async (req, res) =>
    sendData(res, await service.getVersion(id(req))),
  );
  router.put(
    '/:id',
    canWrite,
    validate({ params: idParams, body: updateRuleSetVersionSchema }),
    async (req, res) => {
      sendData(
        res,
        await service.updateVersion(
          id(req),
          validBody<UpdateRuleSetVersionInput>(req),
          actorOf(req),
        ),
      );
    },
  );
  router.post('/:id/submit', canWrite, decision, async (req, res) => {
    sendData(res, await service.submit(id(req), validBody<DecisionInput>(req), actorOf(req)));
  });
  router.post('/:id/confirm', canConfirm, decision, async (req, res) => {
    sendData(
      res,
      await service.confirm(requireAuth(req), id(req), validBody<DecisionInput>(req), actorOf(req)),
    );
  });
  router.post('/:id/return', canConfirm, decision, async (req, res) => {
    sendData(
      res,
      await service.returnToDraft(id(req), validBody<DecisionInput>(req), actorOf(req)),
    );
  });
  router.post('/:id/retire', canConfirm, decision, async (req, res) => {
    sendData(res, await service.retire(id(req), validBody<DecisionInput>(req), actorOf(req)));
  });
  return router;
}
