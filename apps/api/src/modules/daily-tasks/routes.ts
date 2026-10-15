/**
 * /api/v1/daily-tasks — sổ giao việc hằng ngày (docs/04 "Giao việc hằng ngày").
 * Xem: task.read. Giao/sửa/xóa: task.assign. Báo cáo: task.update. Đánh giá: task.quality.record.
 * Điều kiện "cấp trên" và "chính cán bộ" kiểm tra trong service.
 */
import { Router } from 'express';
import { z } from 'zod';
import {
  createDailyTaskSchema,
  dailyTaskListQuerySchema,
  dailyTaskVersionQuerySchema,
  evaluateDailyTaskSchema,
  reportDailyTaskSchema,
  updateDailyTaskSchema,
  uuid,
  type CreateDailyTaskInput,
  type DailyTaskListQuery,
  type EvaluateDailyTaskInput,
  type ReportDailyTaskInput,
  type UpdateDailyTaskInput,
} from '@kpi/shared';
import type { AppDeps } from '../../app.js';
import { actorOf, authorize, requireAuth } from '../../auth/middleware.js';
import { sendData, validBody, validParams, validQuery } from '../../lib/http.js';
import { validate } from '../../middlewares/validate.js';
import { createDailyTasksService } from './service.js';

const idParams = z.object({ id: uuid });

export function dailyTasksRouter(deps: AppDeps): Router {
  const service = createDailyTasksService(deps.db);
  const router = Router();
  const canAssign = authorize(deps.db, 'task.assign');
  const id = (req: Parameters<typeof validParams>[0]) => validParams<{ id: string }>(req).id;

  router.get(
    '/',
    authorize(deps.db, 'task.read'),
    validate({ query: dailyTaskListQuerySchema }),
    async (req, res) => {
      sendData(res, await service.list(requireAuth(req), validQuery<DailyTaskListQuery>(req)));
    },
  );
  router.get('/assignees', canAssign, async (req, res) => {
    sendData(res, await service.assignees(requireAuth(req)));
  });
  router.post('/', canAssign, validate({ body: createDailyTaskSchema }), async (req, res) => {
    sendData(
      res,
      await service.create(requireAuth(req), validBody<CreateDailyTaskInput>(req), actorOf(req)),
      201,
    );
  });
  router.patch(
    '/:id',
    canAssign,
    validate({ params: idParams, body: updateDailyTaskSchema }),
    async (req, res) => {
      sendData(
        res,
        await service.update(
          requireAuth(req),
          id(req),
          validBody<UpdateDailyTaskInput>(req),
          actorOf(req),
        ),
      );
    },
  );
  router.delete(
    '/:id',
    canAssign,
    validate({ params: idParams, query: dailyTaskVersionQuerySchema }),
    async (req, res) => {
      await service.remove(
        requireAuth(req),
        id(req),
        validQuery<{ version: number }>(req).version,
        actorOf(req),
      );
      res.status(204).end();
    },
  );
  router.put(
    '/:id/report',
    authorize(deps.db, 'task.update'),
    validate({ params: idParams, body: reportDailyTaskSchema }),
    async (req, res) => {
      sendData(
        res,
        await service.report(
          requireAuth(req),
          id(req),
          validBody<ReportDailyTaskInput>(req),
          actorOf(req),
        ),
      );
    },
  );
  router.put(
    '/:id/evaluation',
    authorize(deps.db, 'task.quality.record'),
    validate({ params: idParams, body: evaluateDailyTaskSchema }),
    async (req, res) => {
      sendData(
        res,
        await service.evaluate(
          requireAuth(req),
          id(req),
          validBody<EvaluateDailyTaskInput>(req),
          actorOf(req),
        ),
      );
    },
  );
  return router;
}
