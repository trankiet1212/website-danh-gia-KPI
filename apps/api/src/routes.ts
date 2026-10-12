/**
 * Router gốc /api/v1 (docs/04-api.md).
 *  - Công khai: /health, /auth/login.
 *  - Còn lại: phải đăng nhập + không bị buộc đổi mật khẩu + CSRF token hợp lệ với request thay đổi dữ liệu.
 */
import { Router } from 'express';
import type { AppDeps } from './app.js';
import {
  authenticate,
  csrfProtection,
  originCheck,
  requireFreshPassword,
} from './auth/middleware.js';
import { authRouter } from './modules/auth/routes.js';
import { jobPositionsRouter, positionsRouter } from './modules/catalogs/routes.js';
import { dashboardRouter } from './modules/dashboard/routes.js';
import { draftsRouter } from './modules/drafts/routes.js';
import { criteriaSetsRouter, criteriaVersionsRouter } from './modules/criteria/routes.js';
import { employeesRouter } from './modules/employees/routes.js';
import { evaluationsRouter } from './modules/evaluations/routes.js';
import { healthRouter } from './modules/health/routes.js';
import { keyResultsRouter, objectivesRouter } from './modules/objectives/routes.js';
import { orgUnitsRouter } from './modules/org-units/routes.js';
import { periodsRouter } from './modules/periods/routes.js';
import { profileRouter } from './modules/profile/routes.js';
import { permissionsRouter, rolesRouter } from './modules/roles/routes.js';
import { reportsRouter } from './modules/reports/routes.js';
import { ruleSetVersionsRouter, ruleSetsRouter } from './modules/rule-sets/routes.js';
import { usersRouter } from './modules/users/routes.js';
import { workCatalogsRouter } from './modules/work-catalogs/routes.js';

export function apiRouter(deps: AppDeps): Router {
  const router = Router();
  router.use('/health', healthRouter(deps));
  router.use('/auth', authRouter(deps));

  const protectedRouter = Router();
  protectedRouter.use(
    originCheck(deps.config.corsOrigins),
    authenticate(deps.db, deps.config.auth),
    requireFreshPassword,
    csrfProtection,
  );
  protectedRouter.use('/profile', profileRouter(deps));
  protectedRouter.use('/users', usersRouter(deps));
  protectedRouter.use('/roles', rolesRouter(deps));
  protectedRouter.use('/permissions', permissionsRouter(deps));
  protectedRouter.use('/org-units', orgUnitsRouter(deps));
  protectedRouter.use('/positions', positionsRouter(deps));
  protectedRouter.use('/job-positions', jobPositionsRouter(deps));
  protectedRouter.use('/employees', employeesRouter(deps));
  // GĐ5 — KPI/OKR và tính điểm
  protectedRouter.use('/periods', periodsRouter(deps));
  protectedRouter.use('/rule-sets', ruleSetsRouter(deps));
  protectedRouter.use('/rule-set-versions', ruleSetVersionsRouter(deps));
  protectedRouter.use('/work-catalogs', workCatalogsRouter(deps));
  protectedRouter.use('/criteria-sets', criteriaSetsRouter(deps));
  protectedRouter.use('/criteria-versions', criteriaVersionsRouter(deps));
  protectedRouter.use('/objectives', objectivesRouter(deps));
  protectedRouter.use('/key-results', keyResultsRouter(deps));
  protectedRouter.use('/evaluations', evaluationsRouter(deps));
  // GĐ6 — Dashboard, báo cáo, xuất dữ liệu, dự thảo
  protectedRouter.use('/dashboard', dashboardRouter(deps));
  protectedRouter.use('/reports', reportsRouter(deps));
  protectedRouter.use('/drafts', draftsRouter(deps));
  router.use(protectedRouter);

  return router;
}
