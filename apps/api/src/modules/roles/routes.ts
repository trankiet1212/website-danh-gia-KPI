/** /api/v1/roles, /api/v1/permissions — quyền role.manage. */
import { Router } from 'express';
import { z } from 'zod';
import { createRoleSchema, updateRoleSchema, uuid } from '@kpi/shared';
import type { CreateRoleInput, UpdateRoleInput } from '@kpi/shared';
import type { AppDeps } from '../../app.js';
import { actorOf, authorize } from '../../auth/middleware.js';
import { sendData, validBody, validParams } from '../../lib/http.js';
import { validate } from '../../middlewares/validate.js';
import { createRolesService } from './service.js';

const idParams = z.object({ id: uuid });

export function rolesRouter(deps: AppDeps): Router {
  const service = createRolesService(deps.db);
  const router = Router();
  router.use(authorize(deps.db, 'role.manage'));

  router.get('/', async (_req, res) => sendData(res, await service.list()));

  router.post('/', validate({ body: createRoleSchema }), async (req, res) => {
    sendData(res, await service.create(validBody<CreateRoleInput>(req), actorOf(req)), 201);
  });

  router.put('/:id', validate({ params: idParams, body: updateRoleSchema }), async (req, res) => {
    sendData(
      res,
      await service.update(
        validParams<{ id: string }>(req).id,
        validBody<UpdateRoleInput>(req),
        actorOf(req),
      ),
    );
  });

  router.delete('/:id', validate({ params: idParams }), async (req, res) => {
    await service.remove(validParams<{ id: string }>(req).id, actorOf(req));
    sendData(res, { deleted: true });
  });

  return router;
}

export function permissionsRouter(deps: AppDeps): Router {
  const service = createRolesService(deps.db);
  const router = Router();
  router.get('/', authorize(deps.db, 'role.manage'), async (_req, res) =>
    sendData(res, await service.listPermissions()),
  );
  return router;
}
