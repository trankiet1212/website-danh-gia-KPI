import type { Db } from '../../lib/prisma.js';

export function createAuthRepository(db: Db) {
  return {
    findUserByUsername(username: string) {
      return db.user.findUnique({ where: { username } });
    },

    findUserById(id: string) {
      return db.user.findUnique({ where: { id } });
    },

    recordAttempt(username: string, ip: string | null, success: boolean, reason: string | null) {
      return db.loginAttempt.create({
        data: { username: username.slice(0, 100), ip, success, reason },
      });
    },

    /** Tăng số lần sai; đạt ngưỡng thì khóa tạm. Trả về thời điểm mở khóa (nếu vừa bị khóa). */
    async registerFailure(
      userId: string,
      maxAttempts: number,
      lockMinutes: number,
    ): Promise<Date | null> {
      const user = await db.user.update({
        where: { id: userId },
        data: { failedLoginCount: { increment: 1 } },
      });
      if (user.failedLoginCount >= maxAttempts) {
        const lockedUntil = new Date(Date.now() + lockMinutes * 60_000);
        await db.user.update({ where: { id: userId }, data: { lockedUntil, failedLoginCount: 0 } });
        return lockedUntil;
      }
      return null;
    },

    markLoginSuccess(userId: string) {
      return db.user.update({
        where: { id: userId },
        data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
      });
    },

    updatePassword(userId: string, passwordHash: string) {
      return db.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          mustChangePassword: false,
          passwordChangedAt: new Date(),
          version: { increment: 1 },
        },
      });
    },

    listActiveSessions(userId: string) {
      return db.session.findMany({
        where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { lastSeenAt: 'desc' },
      });
    },

    findSession(id: string) {
      return db.session.findUnique({ where: { id } });
    },
  };
}
export type AuthRepository = ReturnType<typeof createAuthRepository>;
