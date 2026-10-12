// Cấu hình Prisma CLI (Prisma ORM 7). Biến môi trường đọc từ file .env ở thư mục gốc monorepo.
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

loadEnv({ path: path.resolve(import.meta.dirname, '../../.env'), quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed/index.ts',
  },
  datasource: {
    // Để undefined được: `prisma generate` không cần kết nối DB (máy mới chưa có .env vẫn cài được).
    url: process.env['DATABASE_URL'],
  },
});
