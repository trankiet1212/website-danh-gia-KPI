/** /api/v1/periods — xem: mọi người đã đăng nhập; quản lý: period.manage. */
import { Router } from 'express';
import { z } from 'zod';
import {
  generateYearSchema,
  periodListQuerySchema,
  periodTransitionSchema,
  updatePeriodSchema,
  uuid,
  type PeriodStatus,
  type PeriodType,
  type UpdatePeriodInput,
} from '@kpi/shared';
import type { AppDeps } from '../../app.js';
import { actorOf, authorize } from '../../auth/middleware.js';
import { sendData, validBody, validParams, validQuery } from '../../lib/http.js';
import { validate } from '../../middlewares/validate.js';
import { createPeriodsService } from './service.js';

const idParams = z.object({ id: uuid });

export function periodsRouter(deps: AppDeps): Router {
  const service = createPeriodsService(deps.db);
  const router = Router();
  const canManage = authorize(deps.db, 'period.manage');
  const id = (req: Parameters<typeof validParams>[0]) => validParams<{ id: string }>(req).id;

  router.get('/', validate({ query: periodListQuerySchema }), async (req, res) => {
    sendData(res, await service.list(validQuery<{ year?: number; type?: PeriodType }>(req)));
  });
  router.post(
    '/generate-year',
    canManage,
    validate({ body: generateYearSchema }),
    async (req, res) => {
      sendData(
        res,
        await service.generateYear(validBody<{ year: number }>(req).year, actorOf(req)),
        201,
      );
    },
  );
  router.patch(
    '/:id',
    canManage,
    validate({ params: idParams, body: updatePeriodSchema }),
    async (req, res) => {
      sendData(res, await service.update(id(req), validBody<UpdatePeriodInput>(req), actorOf(req)));
    },
  );
  router.post(
    '/:id/transition',
    canManage,
    validate({ params: idParams, body: periodTransitionSchema }),
    async (req, res) => {
      const body = validBody<{ to: PeriodStatus; version: number }>(req);
      sendData(res, await service.transition(id(req), body.to, body.version, actorOf(req)));
    },
  );
  return router;
}
