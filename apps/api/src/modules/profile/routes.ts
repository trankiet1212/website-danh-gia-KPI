/**
 * /api/v1/profile — hồ sơ cá nhân của người đang đăng nhập.
 * Không cần quyền riêng: dữ liệu luôn là của chính mình (lấy theo phiên, không nhận id từ client).
 */
import { Router } from 'express';
import { updateOwnProfileSchema, type UpdateOwnProfileInput } from '@kpi/shared';
import type { AppDeps } from '../../app.js';
import { actorOf, requireAuth } from '../../auth/middleware.js';
import { sendData, validBody } from '../../lib/http.js';
import { validate } from '../../middlewares/validate.js';
import { createProfileService } from './service.js';

export function profileRouter(deps: AppDeps): Router {
  const service = createProfileService(deps.db);
  const router = Router();

  router.get('/', async (req, res) => {
    sendData(res, await service.get(requireAuth(req)));
  });

  router.patch('/', validate({ body: updateOwnProfileSchema }), async (req, res) => {
    sendData(
      res,
      await service.updateOwn(
        requireAuth(req),
        validBody<UpdateOwnProfileInput>(req),
        actorOf(req),
      ),
    );
  });

  return router;
}
