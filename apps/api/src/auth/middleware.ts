/**
 * Middleware bảo vệ API: xác thực phiên, bắt buộc đổi mật khẩu, CSRF, kiểm tra Origin, phân quyền.
 * Mọi kiểm tra quyền thực hiện ở backend — giao diện chỉ ẩn/hiện chức năng.
 */
import type { Request, RequestHandler } from 'express';
import type { PermissionCode } from '@kpi/shared';
import { writeAudit, type AuditActor } from '../lib/audit.js';
import { safeEqual, sha256 } from '../lib/crypto.js';
import { AppError } from '../lib/errors.js';
import type { Db } from '../lib/prisma.js';
import { loadAuthContext } from './context.js';
import { cookieName, findValidSession } from './session-store.js';
import type { AuthConfig, AuthContext } from './types.js';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function actorOf(req: Request): AuditActor {
  return { userId: req.auth?.userId ?? null, ip: req.ip ?? null, requestId: req.id ?? null };
}

/** Lấy req.auth (đã qua authenticate) — ném 401 nếu thiếu (phòng lỗi cấu hình route). */
export function requireAuth(req: Request): AuthContext {
  if (!req.auth) throw new AppError('UNAUTHENTICATED', 'Bạn chưa đăng nhập hoặc phiên đã hết hạn');
  return req.auth;
}

export function authenticate(db: Db, cfg: AuthConfig): RequestHandler {
  const name = cookieName(cfg);
  return async (req, res, next) => {
    const token = (req.cookies as Record<string, string> | undefined)?.[name];
    const session = await findValidSession(db, cfg, token);
    const auth = session ? await loadAuthContext(db, session) : null;
    if (!auth) {
      if (token) res.clearCookie(name, { path: '/' });
      next(new AppError('UNAUTHENTICATED', 'Bạn chưa đăng nhập hoặc phiên đã hết hạn'));
      return;
    }
    req.auth = auth;
    next();
  };
}

/** Tài khoản phải đổi mật khẩu (mật khẩu tạm) chỉ được dùng các API tài khoản cơ bản. */
export const requireFreshPassword: RequestHandler = (req, _res, next) => {
  if (req.auth?.mustChangePassword) {
    next(
      new AppError('PASSWORD_CHANGE_REQUIRED', 'Bạn cần đổi mật khẩu trước khi sử dụng hệ thống'),
    );
    return;
  }
  next();
};

/** CSRF: request thay đổi dữ liệu phải gửi header X-CSRF-Token khớp với phiên. */
export const csrfProtection: RequestHandler = (req, _res, next) => {
  if (!UNSAFE_METHODS.has(req.method) || !req.auth) {
    next();
    return;
  }
  const header = req.get('x-csrf-token');
  if (!header || !safeEqual(sha256(header), req.auth.csrfTokenHash)) {
    next(new AppError('CSRF_INVALID', 'Phiên làm việc không hợp lệ, vui lòng tải lại trang'));
    return;
  }
  next();
};

/**
 * Chặn request thay đổi dữ liệu đến từ origin lạ (bổ sung cho SameSite cookie, bảo vệ cả form đăng nhập).
 * Request không có header Origin (công cụ dòng lệnh, server) không bị ảnh hưởng.
 */
export function originCheck(allowedOrigins: readonly string[]): RequestHandler {
  const allowed = new Set(allowedOrigins);
  return (req, _res, next) => {
    const origin = req.get('origin');
    if (UNSAFE_METHODS.has(req.method) && origin && !allowed.has(origin)) {
      next(new AppError('FORBIDDEN', 'Nguồn gửi yêu cầu không được phép'));
      return;
    }
    next();
  };
}

/** Yêu cầu quyền; thiếu quyền → 403 và ghi nhật ký DENIED. */
export function authorize(db: Db, ...permissions: PermissionCode[]): RequestHandler {
  return async (req, _res, next) => {
    const auth = requireAuth(req);
    const missing = permissions.filter((p) => !auth.permissions.has(p));
    if (missing.length === 0) {
      next();
      return;
    }
    await writeAudit(db, actorOf(req), {
      action: 'access.denied',
      entityType: 'endpoint',
      entityId: `${req.method} ${req.baseUrl}${req.route?.path ?? req.path}`.slice(0, 100),
      result: 'DENIED',
      changes: { missing },
    });
    next(new AppError('FORBIDDEN', 'Bạn không có quyền thực hiện chức năng này'));
  };
}
