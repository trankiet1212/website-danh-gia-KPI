/**
 * Kiểm tra kết nối PostgreSQL và trạng thái migration.
 *   npm run db:check
 * Thoát mã 0 nếu kết nối được và đã áp đủ migration; mã 1 nếu có vấn đề.
 */
import { readdirSync } from 'node:fs';
import { loadEnv } from '../src/config/env.js';
import { checkDatabase, createPrismaClient } from '../src/lib/prisma.js';

/** Che mật khẩu trong chuỗi kết nối trước khi in ra màn hình. */
function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = '****';
    return u.toString();
  } catch {
    return '(chuỗi kết nối không đọc được)';
  }
}

async function main(): Promise<number> {
  const env = loadEnv();
  console.log(`Database: ${maskUrl(env.DATABASE_URL)}`);
  const db = createPrismaClient(env.DATABASE_URL);
  try {
    const result = await checkDatabase(db, 5_000);
    if (!result.ok) {
      console.error(`✗ Không kết nối được: ${result.error}`);
      console.error(
        '  Gợi ý: chạy `npm run db:up`, kiểm tra Docker Desktop và DATABASE_URL trong .env',
      );
      return 1;
    }
    console.log(`✓ Kết nối thành công (${result.latencyMs} ms)`);

    const [row] = await db.$queryRaw<{ version: string }[]>`SELECT version()`;
    console.log(`  Phiên bản: ${row?.version.split(',')[0] ?? 'không rõ'}`);

    const expected = readdirSync(new URL('../prisma/migrations/', import.meta.url), {
      withFileTypes: true,
    })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    const tableExists = await db.$queryRaw<{ exists: boolean }[]>`
      SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS "exists"`;
    if (!tableExists[0]?.exists) {
      console.error(`✗ Chưa áp migration nào (cần ${expected.length}). Chạy: npm run db:migrate`);
      return 1;
    }
    const applied = await db.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM _prisma_migrations
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    const appliedNames = new Set(applied.map((r) => r.migration_name));
    const pending = expected.filter((m) => !appliedNames.has(m));
    if (pending.length > 0) {
      console.error(`✗ Còn ${pending.length} migration chưa áp: ${pending.join(', ')}`);
      console.error('  Chạy: npm run db:migrate');
      return 1;
    }
    console.log(`✓ Migration: đã áp ${appliedNames.size}/${expected.length}`);
    return 0;
  } finally {
    await db.$disconnect();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
