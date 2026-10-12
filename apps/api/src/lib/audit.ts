/**
 * Ghi nhật ký kiểm toán (bảng audit_logs, append-only). Không ghi mật khẩu/token.
 * Gọi trong cùng transaction với thay đổi nghiệp vụ khi có thể, để không có thay đổi "mất dấu".
 */
import type { Db } from './prisma.js';

export type AuditResult = 'SUCCESS' | 'DENIED' | 'FAILURE';

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  result?: AuditResult;
  changes?: unknown;
}

export interface AuditActor {
  userId: string | null;
  ip: string | null;
  requestId: string | null;
}

/** Client Prisma hoặc transaction client — đều có model auditLog. */
type AuditCapable = Pick<Db, 'auditLog'>;

const SENSITIVE_KEYS = /pass(word)?|token|secret|hash|cookie/i;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = SENSITIVE_KEYS.test(k) ? '[ĐÃ CHE]' : redact(v, depth + 1);
  }
  return out;
}

export async function writeAudit(
  db: AuditCapable,
  actor: AuditActor,
  entry: AuditEntry,
): Promise<void> {
  await db.auditLog.create({
    data: {
      actorUserId: actor.userId,
      actorIp: actor.ip,
      requestId: actor.requestId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      result: entry.result ?? 'SUCCESS',
      changes: entry.changes === undefined ? undefined : (redact(entry.changes) as object),
    },
  });
}

/** Trường kỹ thuật không cần ghi vào nhật ký thay đổi. */
const IGNORED_DIFF_KEYS = new Set(['updatedAt', 'createdAt', 'version', '_count']);

/** Chỉ giữ các trường nghiệp vụ thay đổi giữa hai bản ghi (để audit gọn). */
export function diff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const changed: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(after)) {
    if (IGNORED_DIFF_KEYS.has(key)) continue;
    const a = before[key] instanceof Date ? (before[key] as Date).toISOString() : before[key];
    const b = after[key] instanceof Date ? (after[key] as Date).toISOString() : after[key];
    if (JSON.stringify(a) !== JSON.stringify(b)) changed[key] = { from: a, to: b };
  }
  return changed;
}
