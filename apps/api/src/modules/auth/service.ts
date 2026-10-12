/**
 * Nghiệp vụ xác thực: đăng nhập (khóa tạm khi sai nhiều lần), đăng xuất, đổi mật khẩu, quản lý phiên.
 */
import type { AuthMe, ChangePasswordInput, LoginInput, SessionDto } from '@kpi/shared';
import { checkPasswordStrength } from '@kpi/shared';
import { writeAudit, type AuditActor } from '../../lib/audit.js';
import { AppError } from '../../lib/errors.js';
import { burnPasswordCheck, hashPassword, verifyPassword } from '../../lib/password.js';
import type { Db } from '../../lib/prisma.js';
import {
  createSession,
  csrfTokenFor,
  purgeOldSessions,
  revokeSession,
  revokeUserSessions,
} from '../../auth/session-store.js';
import type { AuthConfig, AuthContext } from '../../auth/types.js';
import { createAuthRepository } from './repository.js';

const INVALID_CREDENTIALS = 'Tên đăng nhập hoặc mật khẩu không đúng';

export function createAuthService(db: Db, cfg: AuthConfig) {
  const repo = createAuthRepository(db);

  async function login(input: LoginInput, actor: AuditActor, userAgent: string | null) {
    const user = await repo.findUserByUsername(input.username);

    if (!user) {
      await burnPasswordCheck(input.password);
      await repo.recordAttempt(input.username, actor.ip, false, 'UNKNOWN_USER');
      await writeAudit(db, actor, {
        action: 'auth.login',
        entityType: 'user',
        result: 'FAILURE',
        changes: { username: input.username, reason: 'UNKNOWN_USER' },
      });
      throw new AppError('UNAUTHENTICATED', INVALID_CREDENTIALS);
    }

    const audit = (result: 'SUCCESS' | 'FAILURE', reason?: string) =>
      writeAudit(
        db,
        { ...actor, userId: user.id },
        {
          action: 'auth.login',
          entityType: 'user',
          entityId: user.id,
          result,
          changes: reason ? { reason } : undefined,
        },
      );

    if (user.status !== 'ACTIVE') {
      await burnPasswordCheck(input.password);
      await repo.recordAttempt(user.username, actor.ip, false, `STATUS_${user.status}`);
      await audit('FAILURE', `STATUS_${user.status}`);
      throw new AppError(
        'ACCOUNT_LOCKED',
        'Tài khoản đã bị khóa hoặc ngừng sử dụng. Vui lòng liên hệ quản trị hệ thống.',
      );
    }
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      await repo.recordAttempt(user.username, actor.ip, false, 'TEMP_LOCKED');
      await audit('FAILURE', 'TEMP_LOCKED');
      const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
      throw new AppError(
        'ACCOUNT_LOCKED',
        `Tài khoản tạm khóa do đăng nhập sai nhiều lần. Thử lại sau ${minutes} phút.`,
        { lockedUntil: user.lockedUntil.toISOString() },
      );
    }

    if (!(await verifyPassword(user.passwordHash, input.password))) {
      const lockedUntil = await repo.registerFailure(
        user.id,
        cfg.maxFailedAttempts,
        cfg.lockMinutes,
      );
      await repo.recordAttempt(user.username, actor.ip, false, 'BAD_PASSWORD');
      await audit('FAILURE', lockedUntil ? 'BAD_PASSWORD_LOCKED' : 'BAD_PASSWORD');
      if (lockedUntil) {
        throw new AppError(
          'ACCOUNT_LOCKED',
          `Đăng nhập sai quá ${cfg.maxFailedAttempts} lần. Tài khoản tạm khóa ${cfg.lockMinutes} phút.`,
          { lockedUntil: lockedUntil.toISOString() },
        );
      }
      throw new AppError('UNAUTHENTICATED', INVALID_CREDENTIALS);
    }

    await repo.markLoginSuccess(user.id);
    await repo.recordAttempt(user.username, actor.ip, true, null);
    const created = await createSession(db, cfg, { userId: user.id, ip: actor.ip, userAgent });
    await audit('SUCCESS');
    // Dọn phiên cũ đã hết hạn lâu ngày (không chặn đăng nhập nếu lỗi)
    purgeOldSessions(db).catch(() => undefined);
    return created;
  }

  async function logout(auth: AuthContext, actor: AuditActor) {
    await revokeSession(db, auth.sessionId);
    await writeAudit(db, actor, {
      action: 'auth.logout',
      entityType: 'session',
      entityId: auth.sessionId,
    });
  }

  async function changePassword(auth: AuthContext, input: ChangePasswordInput, actor: AuditActor) {
    const user = await repo.findUserById(auth.userId);
    if (!user) throw new AppError('UNAUTHENTICATED', 'Phiên không hợp lệ');
    if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
      await writeAudit(db, actor, {
        action: 'auth.password.change',
        entityType: 'user',
        entityId: user.id,
        result: 'FAILURE',
      });
      throw new AppError('VALIDATION_ERROR', 'Mật khẩu hiện tại không đúng', [
        { location: 'body', path: 'currentPassword', message: 'Mật khẩu hiện tại không đúng' },
      ]);
    }
    const issues = checkPasswordStrength(input.newPassword, user.username);
    if (issues.length > 0) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Mật khẩu mới chưa đạt yêu cầu',
        issues.map((message) => ({ location: 'body', path: 'newPassword', message })),
      );
    }
    await repo.updatePassword(user.id, await hashPassword(input.newPassword));
    // Thu hồi các phiên khác — nếu mật khẩu cũ bị lộ, phiên của kẻ khác bị đăng xuất.
    const revoked = await revokeUserSessions(db, user.id, auth.sessionId);
    await writeAudit(db, actor, {
      action: 'auth.password.change',
      entityType: 'user',
      entityId: user.id,
      changes: { revokedOtherSessions: revoked },
    });
  }

  function me(auth: AuthContext): AuthMe {
    return {
      user: {
        id: auth.userId,
        username: auth.username,
        displayName: auth.displayName,
        mustChangePassword: auth.mustChangePassword,
        employee: auth.employee
          ? {
              id: auth.employee.id,
              employeeCode: auth.employee.employeeCode,
              fullName: auth.employee.fullName,
              unitName: auth.employee.unitName,
            }
          : null,
      },
      roles: auth.grants.map((g) => ({
        id: g.id,
        roleId: g.roleId,
        roleCode: g.roleCode,
        roleName: g.roleName,
        scopeType: g.scopeType,
        units: g.units,
      })),
      permissions: [...auth.permissions].sort(),
      csrfToken: csrfTokenFor(cfg, auth.sessionId),
      session: {
        id: auth.sessionId,
        expiresAt: auth.sessionExpiresAt.toISOString(),
        idleTimeoutMinutes: cfg.idleMinutes,
      },
    };
  }

  async function listSessions(auth: AuthContext): Promise<SessionDto[]> {
    const sessions = await repo.listActiveSessions(auth.userId);
    return sessions.map((s) => ({
      id: s.id,
      ip: s.ip,
      userAgent: s.userAgent,
      createdAt: s.createdAt.toISOString(),
      lastSeenAt: s.lastSeenAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      current: s.id === auth.sessionId,
    }));
  }

  async function revokeOwnSession(auth: AuthContext, sessionId: string, actor: AuditActor) {
    const session = await repo.findSession(sessionId);
    if (!session || session.userId !== auth.userId)
      throw new AppError('NOT_FOUND', 'Không tìm thấy phiên');
    await revokeSession(db, sessionId);
    await writeAudit(db, actor, {
      action: 'auth.session.revoke',
      entityType: 'session',
      entityId: sessionId,
    });
  }

  return { login, logout, changePassword, me, listSessions, revokeOwnSession };
}
