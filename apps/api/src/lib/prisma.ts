/**
 * Kết nối PostgreSQL qua Prisma ORM 7 + driver adapter `pg`.
 * Mỗi tiến trình chỉ nên có MỘT PrismaClient (mỗi client giữ một connection pool).
 * Lưu ý kiến trúc: chỉ repository.ts trong modules/ được import file này (docs/02-kien-truc.md).
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

export type Db = InstanceType<typeof PrismaClient>;

export function createPrismaClient(connectionString: string): Db {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export interface DatabaseCheckResult {
  ok: boolean;
  latencyMs: number | null;
  /** Thông điệp lỗi nội bộ — CHỈ ghi log, không trả cho client. */
  error?: string;
}

/** Kiểm tra kết nối bằng `SELECT 1`, có giới hạn thời gian để health-check không bị treo. */
export async function checkDatabase(db: Db, timeoutMs = 2_000): Promise<DatabaseCheckResult> {
  const started = performance.now();
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      db.$queryRaw`SELECT 1`,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Quá thời gian ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
    return { ok: true, latencyMs: Math.round(performance.now() - started) };
  } catch (err) {
    return { ok: false, latencyMs: null, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}
