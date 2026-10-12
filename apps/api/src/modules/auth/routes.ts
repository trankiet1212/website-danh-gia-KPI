/**
 * /api/v1/auth — đăng nhập, đăng xuất, thông tin phiên, đổi mật khẩu, quản lý phiên của bản thân.
 */
import { Router, type CookieOptions } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { changePasswordSchema, loginSchema, uuid } from '@kpi/shared';
import type { ChangePasswordInput, LoginInput } from '@kpi/shared';
import type { AppDeps } from '../../app.js';
import { loadAuthContext } from '../../auth/context.js';
import {
  actorOf,
  authenticate,
  csrfProtection,
  originCheck,
  requireAuth,
} from '../../auth/middleware.js';
import { cookieName } from '../../auth/session-store.js';
import { AppError } from '../../lib/errors.js';
import { sendData, validBody, validParams } from '../../lib/http.js';
import { validate } from '../../middlewares/validate.js';
import { createAuthService } from './service.js';

export function authRouter(deps: AppDeps): Router {
  const { db, config } = deps;
  const cfg = config.auth;
  const service = createAuthService(db, cfg);
  const router = Router();
  const name = cookieName(cfg);
  const cookieOptions: CookieOptions = {
    httpOnly: true,
    sameSite: 'strict',
    secure: cfg.secureCookies,
    path: '/',
  };

  const loginLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: config.loginRateLimit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) =>
      next(
        new AppError('RATE_LIMITED', 'Bạn đăng nhập quá nhiều lần. Vui lòng thử lại sau ít phút.'),
      ),
  });

  const requireSession = [authenticate(db, cfg), csrfProtection];

  router.post(
    '/login',
    originCheck(config.corsOrigins),
    loginLimiter,
    validate({ body: loginSchema }),
    async (req, res) => {
      const { token, session } = await service.login(
        validBody<LoginInput>(req),
        actorOf(req),
        req.get('user-agent') ?? null,
      );
      res.cookie(name, token, cookieOptions);
      // Trả về cùng định dạng /auth/me (kèm CSRF token) để giao diện dùng ngay
      const auth = await loadAuthContext(db, session);
      if (!auth) throw new AppError('UNAUTHENTICATED', 'Không tạo được phiên đăng nhập');
      sendData(res, service.me(auth));
    },
  );

  router.post('/logout', ...requireSession, async (req, res) => {
    await service.logout(requireAuth(req), actorOf(req));
    res.clearCookie(name, { path: '/' });
    sendData(res, { loggedOut: true });
  });

  router.get('/me', authenticate(db, cfg), (req, res) => {
    sendData(res, service.me(requireAuth(req)));
  });

  router.get('/csrf', authenticate(db, cfg), (req, res) => {
    sendData(res, { csrfToken: service.me(requireAuth(req)).csrfToken });
  });

  router.post(
    '/change-password',
    ...requireSession,
    validate({ body: changePasswordSchema }),
    async (req, res) => {
      await service.changePassword(
        requireAuth(req),
        validBody<ChangePasswordInput>(req),
        actorOf(req),
      );
      sendData(res, { changed: true });
    },
  );

  router.get('/sessions', authenticate(db, cfg), async (req, res) => {
    sendData(res, await service.listSessions(requireAuth(req)));
  });

  router.delete(
    '/sessions/:id',
    ...requireSession,
    validate({ params: z.object({ id: uuid }) }),
    async (req, res) => {
      await service.revokeOwnSession(
        requireAuth(req),
        validParams<{ id: string }>(req).id,
        actorOf(req),
      );
      sendData(res, { revoked: true });
    },
  );

  return router;
}
