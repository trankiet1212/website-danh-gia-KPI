/**
 * Áp migration vào database KIỂM THỬ (TEST_DATABASE_URL) bằng `prisma migrate deploy`.
 *   npm run db:migrate:test
 * `migrate deploy` chỉ áp migration còn thiếu — KHÔNG reset, KHÔNG xóa dữ liệu.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { config as loadDotenv } from 'dotenv';

loadDotenv({ path: path.resolve(import.meta.dirname, '../../../.env'), quiet: true });

const testUrl = process.env['TEST_DATABASE_URL'];
if (!testUrl) {
  console.error('Thiếu TEST_DATABASE_URL trong .env');
  process.exit(1);
}
if (testUrl === process.env['DATABASE_URL']) {
  console.error('TEST_DATABASE_URL đang trùng DATABASE_URL — từ chối chạy để bảo vệ dữ liệu dev.');
  process.exit(1);
}

const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  cwd: path.resolve(import.meta.dirname, '..'),
  env: { ...process.env, DATABASE_URL: testUrl },
});
process.exit(result.status ?? 1);
