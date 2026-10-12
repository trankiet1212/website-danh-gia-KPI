/** /api/v1/employees — hồ sơ cán bộ, phân công, điều chuyển. */
import { Router } from 'express';
import { z } from 'zod';
import {
  archiveEmployeeSchema,
  createEmployeeSchema,
  employeeListQuerySchema,
  transferEmployeeSchema,
  updateEmployeeSchema,
  uuid,
} from '@kpi/shared';
import type {
  ArchiveEmployeeInput,
  CreateEmployeeInput,
  EmployeeListQuery,
  TransferEmployeeInput,
  UpdateEmployeeInput,
} from '@kpi/shared';
import type { AppDeps } from '../../app.js';
import { actorOf, authorize, requireAuth } from '../../auth/middleware.js';
import { sendData, sendPage, validBody, validParams, validQuery } from '../../lib/http.js';
import { validate } from '../../middlewares/validate.js';
import { createEmployeesService } from './service.js';

const idParams = z.object({ id: uuid });

export function employeesRouter(deps: AppDeps): Router {
  const { db } = deps;
  const service = createEmployeesService(db);
  const router = Router();
  const canRead = authorize(db, 'employee.read');
  const canWrite = authorize(db, 'employee.read', 'employee.write');
  const id = (req: Parameters<typeof validParams>[0]) => validParams<{ id: string }>(req).id;

  router.get('/', canRead, validate({ query: employeeListQuerySchema }), async (req, res) => {
    const { items, meta } = await service.list(
      requireAuth(req),
      validQuery<EmployeeListQuery>(req),
    );
    sendPage(res, items, meta);
  });

  router.get('/:id', canRead, validate({ params: idParams }), async (req, res) => {
    sendData(res, await service.detail(requireAuth(req), id(req)));
  });

  router.post('/', canWrite, validate({ body: createEmployeeSchema }), async (req, res) => {
    sendData(
      res,
      await service.create(requireAuth(req), validBody<CreateEmployeeInput>(req), actorOf(req)),
      201,
    );
  });

  router.patch(
    '/:id',
    canWrite,
    validate({ params: idParams, body: updateEmployeeSchema }),
    async (req, res) => {
      sendData(
        res,
        await service.update(
          requireAuth(req),
          id(req),
          validBody<UpdateEmployeeInput>(req),
          actorOf(req),
        ),
      );
    },
  );

  router.post(
    '/:id/transfer',
    canWrite,
    validate({ params: idParams, body: transferEmployeeSchema }),
    async (req, res) => {
      sendData(
        res,
        await service.transfer(
          requireAuth(req),
          id(req),
          validBody<TransferEmployeeInput>(req),
          actorOf(req),
        ),
      );
    },
  );

  router.post(
    '/:id/end-employment',
    canWrite,
    validate({ params: idParams, body: archiveEmployeeSchema }),
    async (req, res) => {
      sendData(
        res,
        await service.endEmployment(
          requireAuth(req),
          id(req),
          validBody<ArchiveEmployeeInput>(req),
          actorOf(req),
        ),
      );
    },
  );

  return router;
}
