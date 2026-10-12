/**
 * Phiên đăng nhập phía server (docs/adr/0002):
 *  - Token ngẫu nhiên 256 bit trong cookie httpOnly; DB chỉ lưu SHA-256 của token.
 *  - Hết hạn khi: bị thu hồi, quá thời hạn tuyệt đối, hoặc không hoạt động quá idle timeout.
 *  - CSRF token = HMAC(SESSION_SECRET, session id) — ổn định trong phiên, dùng được nhiều tab.
 */
import { hmacSha256, randomToken, sha256 } from '../lib/crypto.js';
import type { Db } from '../lib/prisma.js';
import type { AuthConfig } from './types.js';

/** Chỉ cập nhật last_seen_at tối đa mỗi phút để giảm ghi DB. */
const TOUCH_INTERVAL_MS = 60_000;

export function cookieName(cfg: AuthConfig): string {
  return cfg.secureCookies ? '__Host-kpi_sid' : 'kpi_sid';
}

export function csrfTokenFor(cfg: AuthConfig, sessionId: string): string {
  return hmacSha256(cfg.sessionSecret, `csrf:${sessionId}`);
}

export async function createSession(
  db: Db,
  cfg: AuthConfig,
  input: { userId: string; ip: string | null; userAgent: string | null },
) {
  const token = randomToken(32);
  const now = new Date();
  const session = await db.session.create({
    data: {
      tokenHash: sha256(token),
      csrfTokenHash: 'pending',
      userId: input.userId,
      ip: input.ip,
      userAgent: input.userAgent?.slice(0, 500) ?? null,
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + cfg.absoluteHours * 3_600_000),
    },
  });
  const csrfToken = csrfTokenFor(cfg, session.id);
  const saved = await db.session.update({
    where: { id: session.id },
    data: { csrfTokenHash: sha256(csrfToken) },
  });
  return { token, csrfToken, session: saved };
}

/** Tìm phiên hợp lệ theo token cookie; trả null nếu không tồn tại/hết hạn/bị thu hồi. */
export async function findValidSession(db: Db, cfg: AuthConfig, token: string | undefined) {
  if (!token || token.length > 200) return null;
  const session = await db.session.findUnique({ where: { tokenHash: sha256(token) } });
  if (!session || session.revokedAt) return null;

  const now = Date.now();
  if (session.expiresAt.getTime() <= now) return null;
  if (now - session.lastSeenAt.getTime() > cfg.idleMinutes * 60_000) return null;

  if (now - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date(now) } });
  }
  return session;
}

export async function revokeSession(db: Db, sessionId: string): Promise<void> {
  await db.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeUserSessions(
  db: Db,
  userId: string,
  exceptSessionId?: string,
): Promise<number> {
  const { count } = await db.session.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
    },
    data: { revokedAt: new Date() },
  });
  return count;
}

/** Dọn phiên đã hết hạn quá 7 ngày (chỉ là dữ liệu kỹ thuật, không phải dữ liệu nghiệp vụ). */
export async function purgeOldSessions(db: Db): Promise<number> {
  const cutoff = new Date(Date.now() - 7 * 86_400_000);
  const { count } = await db.session.deleteMany({
    where: { OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }] },
  });
  return count;
}
