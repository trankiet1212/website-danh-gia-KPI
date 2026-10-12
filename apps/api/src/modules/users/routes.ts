/**
 * /api/v1/users — quản lý tài khoản (quyền user.manage) và cấp vai trò (quyền role.manage).
 */
import { Router } from 'express';
import { z } from 'zod';
import {
  createUserSchema,
  grantRoleSchema,
  pageParams,
  updateUserSchema,
  userListQuerySchema,
  userStatusActionSchema,
  uuid,
} from '@kpi/shared';
import type { CreateUserInput, GrantRoleInput, UpdateUserInput, UserListQuery } from '@kpi/shared';
import type { AppDeps } from '../../app.js';
import { actorOf, authorize, requireAuth } from '../../auth/middleware.js';
import { sendData, sendPage, validBody, validParams, validQuery } from '../../lib/http.js';
import { validate } from '../../middlewares/validate.js';
import { createUsersService } from './service.js';

const idParams = z.object({ id: uuid });
const grantParams = z.object({ id: uuid, grantId: uuid });

export function usersRouter(deps: AppDeps): Router {
  const { db } = deps;
  const service = createUsersService(db);
  const router = Router();
  const canManage = authorize(db, 'user.manage');
  const canGrant = authorize(db, 'role.manage');

  router.get('/', canManage, validate({ query: userListQuerySchema }), async (req, res) => {
    const { items, meta } = await service.list(validQuery<UserListQuery>(req));
    sendPage(res, items, meta);
  });

  router.get(
    '/employee-options',
    canManage,
    validate({ query: z.object({ q: pageParams.q }) }),
    async (req, res) => {
      sendData(res, await service.employeeOptions(validQuery<{ q?: string }>(req).q));
    },
  );

  router.post('/', canManage, validate({ body: createUserSchema }), async (req, res) => {
    sendData(res, await service.create(validBody<CreateUserInput>(req), actorOf(req)), 201);
  });

  router.get('/:id', canManage, validate({ params: idParams }), async (req, res) => {
    sendData(res, await service.get(validParams<{ id: string }>(req).id));
  });

  router.patch(
    '/:id',
    canManage,
    validate({ params: idParams, body: updateUserSchema }),
    async (req, res) => {
      sendData(
        res,
        await service.update(
          validParams<{ id: string }>(req).id,
          validBody<UpdateUserInput>(req),
          actorOf(req),
        ),
      );
    },
  );

  const statusAction = (
    path: string,
    status: 'ACTIVE' | 'LOCKED' | 'DISABLED',
    needsReason: boolean,
  ) => {
    router.post(
      `/:id/${path}`,
      canManage,
      validate({ params: idParams, ...(needsReason ? { body: userStatusActionSchema } : {}) }),
      async (req, res) => {
        const reason = needsReason ? validBody<{ reason: string }>(req).reason : null;
        sendData(
          res,
          await service.setStatus(
            requireAuth(req),
            validParams<{ id: string }>(req).id,
            status,
            reason,
            actorOf(req),
          ),
        );
      },
    );
  };
  statusAction('lock', 'LOCKED', true);
  statusAction('disable', 'DISABLED', true);
  statusAction('unlock', 'ACTIVE', false);

  router.post(
    '/:id/reset-password',
    canManage,
    validate({ params: idParams }),
    async (req, res) => {
      sendData(res, await service.resetPassword(validParams<{ id: string }>(req).id, actorOf(req)));
    },
  );

  router.post(
    '/:id/revoke-sessions',
    canManage,
    validate({ params: idParams }),
    async (req, res) => {
      sendData(
        res,
        await service.revokeSessions(validParams<{ id: string }>(req).id, actorOf(req)),
      );
    },
  );

  router.post(
    '/:id/roles',
    canGrant,
    validate({ params: idParams, body: grantRoleSchema }),
    async (req, res) => {
      sendData(
        res,
        await service.grantRole(
          requireAuth(req),
          validParams<{ id: string }>(req).id,
          validBody<GrantRoleInput>(req),
          actorOf(req),
        ),
        201,
      );
    },
  );

  router.delete(
    '/:id/roles/:grantId',
    canGrant,
    validate({ params: grantParams }),
    async (req, res) => {
      const { id, grantId } = validParams<{ id: string; grantId: string }>(req);
      sendData(res, await service.revokeRole(requireAuth(req), id, grantId, actorOf(req)));
    },
  );

  return router;
}
