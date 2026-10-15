/**
 * /api/v1/evaluations — hồ sơ đánh giá.
 * Xem: evaluation.read (theo phạm vi). Tạo hồ sơ: evaluation.read + (period.manage hoặc evaluation.review —
 * lãnh đạo chỉ tạo cho cấp dưới; kiểm tra trong service). Giao nhiệm vụ: task.assign (cấp trên).
 * Tự đánh giá/nộp: evaluation.self (chỉ chính đối tượng). Thẩm định/trả lại: evaluation.review.
 * Phê duyệt: evaluation.approve. Mở lại: evaluation.reopen. Phạm vi kiểm tra trong service.
 */
import { Router } from 'express';
import { z } from 'zod';
import {
  approveEvaluationSchema,
  assignTasksSchema,
  calculateSchema,
  createEvaluationSchema,
  evaluationActionSchema,
  evaluationListQuerySchema,
  evaluationReasonSchema,
  generateEvaluationsSchema,
  saveEvaluationInputsSchema,
  uuid,
  type ApproveEvaluationInput,
  type AssignTasksInput,
  type CreateEvaluationInput,
  type EvaluationListQuery,
  type SaveEvaluationInputs,
} from '@kpi/shared';
import type { AppDeps } from '../../app.js';
import { actorOf, authorize, requireAuth } from '../../auth/middleware.js';
import { sendData, sendPage, validBody, validParams, validQuery } from '../../lib/http.js';
import { validate } from '../../middlewares/validate.js';
import { createEvaluationsService } from './service.js';

const idParams = z.object({ id: uuid });
type Action = { comment?: string | null; version: number };
type Reason = { reason: string; version: number };

export function evaluationsRouter(deps: AppDeps): Router {
  const service = createEvaluationsService(deps.db);
  const router = Router();
  const canRead = authorize(deps.db, 'evaluation.read');
  const canCreate = authorize(deps.db, 'evaluation.read');
  const id = (req: Parameters<typeof validParams>[0]) => validParams<{ id: string }>(req).id;
  const withId = <S extends z.ZodType>(body: S) => validate({ params: idParams, body });

  router.get('/', canRead, validate({ query: evaluationListQuerySchema }), async (req, res) => {
    const page = await service.list(requireAuth(req), validQuery<EvaluationListQuery>(req));
    sendPage(res, page.data, page.meta);
  });
  router.post('/', canCreate, validate({ body: createEvaluationSchema }), async (req, res) => {
    sendData(
      res,
      await service.create(requireAuth(req), validBody<CreateEvaluationInput>(req), actorOf(req)),
      201,
    );
  });
  router.post(
    '/generate',
    canCreate,
    validate({ body: generateEvaluationsSchema }),
    async (req, res) => {
      const body = validBody<{ periodId: string; unitId?: string | null }>(req);
      sendData(res, await service.generate(requireAuth(req), body, actorOf(req)));
    },
  );
  router.get('/:id', canRead, validate({ params: idParams }), async (req, res) => {
    sendData(res, await service.detail(requireAuth(req), id(req)));
  });
  router.post('/:id/calculate', canRead, withId(calculateSchema), async (req, res) => {
    const body = validBody<{ layer: 'self' | 'review' }>(req);
    sendData(res, await service.trial(requireAuth(req), id(req), body.layer));
  });

  const self = authorize(deps.db, 'evaluation.self');
  router.put('/:id/self', self, withId(saveEvaluationInputsSchema), async (req, res) => {
    sendData(
      res,
      await service.saveSelf(
        requireAuth(req),
        id(req),
        validBody<SaveEvaluationInputs>(req),
        actorOf(req),
      ),
    );
  });
  router.post('/:id/submit', self, withId(evaluationActionSchema), async (req, res) => {
    sendData(
      res,
      await service.submit(requireAuth(req), id(req), validBody<Action>(req), actorOf(req)),
    );
  });

  router.put(
    '/:id/tasks',
    authorize(deps.db, 'task.assign'),
    withId(assignTasksSchema),
    async (req, res) => {
      sendData(
        res,
        await service.assignTasks(
          requireAuth(req),
          id(req),
          validBody<AssignTasksInput>(req),
          actorOf(req),
        ),
      );
    },
  );

  const review = authorize(deps.db, 'evaluation.review');
  router.put('/:id/review', review, withId(saveEvaluationInputsSchema), async (req, res) => {
    sendData(
      res,
      await service.saveReview(
        requireAuth(req),
        id(req),
        validBody<SaveEvaluationInputs>(req),
        actorOf(req),
      ),
    );
  });
  router.post('/:id/complete-review', review, withId(evaluationActionSchema), async (req, res) => {
    sendData(
      res,
      await service.completeReview(requireAuth(req), id(req), validBody<Action>(req), actorOf(req)),
    );
  });
  router.post('/:id/return', review, withId(evaluationReasonSchema), async (req, res) => {
    sendData(
      res,
      await service.returnToSubject(
        requireAuth(req),
        id(req),
        validBody<Reason>(req),
        actorOf(req),
      ),
    );
  });

  router.post(
    '/:id/approve',
    authorize(deps.db, 'evaluation.approve'),
    withId(approveEvaluationSchema),
    async (req, res) => {
      sendData(
        res,
        await service.approve(
          requireAuth(req),
          id(req),
          validBody<ApproveEvaluationInput>(req),
          actorOf(req),
        ),
      );
    },
  );
  router.post(
    '/:id/reopen',
    authorize(deps.db, 'evaluation.reopen'),
    withId(evaluationReasonSchema),
    async (req, res) => {
      sendData(
        res,
        await service.reopen(requireAuth(req), id(req), validBody<Reason>(req), actorOf(req)),
      );
    },
  );
  return router;
}
