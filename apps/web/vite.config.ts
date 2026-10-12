import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

// Biến môi trường đọc từ file .env ở thư mục gốc monorepo. Chỉ biến tiền tố VITE_ được nhúng vào bundle;
// API_PROXY_TARGET chỉ dùng trong cấu hình dev server nên KHÔNG mang tiền tố VITE_.
const ROOT_DIR = path.resolve(import.meta.dirname, '../..');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ROOT_DIR, '');
  const apiTarget = env['API_PROXY_TARGET'] || 'http://localhost:4000';

  return {
    envDir: ROOT_DIR,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': path.resolve(import.meta.dirname, 'src') },
    },
    server: {
      port: 5173,
      strictPort: true,
      // Dev: trình duyệt gọi /api trên cùng origin 5173 → Vite chuyển tiếp sang API (không cần CORS).
      proxy: {
        '/api': { target: apiTarget, changeOrigin: false },
      },
    },
    preview: { port: 4173, strictPort: true },
    build: {
      sourcemap: true,
      // Chunk vendor-react (~527 kB, gzip ~161 kB) là thư viện React/React Router — chỉ đổi khi nâng cấp
      // thư viện và được cache lâu dài. Mã ứng dụng đã tách theo từng trang (code splitting).
      chunkSizeWarningLimit: 600,
      rolldownOptions: {
        output: {
          // Tách thư viện ổn định (React, router, React Query) thành chunk riêng để trình duyệt cache lâu dài.
          codeSplitting: {
            groups: [
              {
                name: 'vendor-react',
                test: /node_modules[\\/](react|react-dom|scheduler|react-router)[\\/]/,
              },
              {
                name: 'vendor-data',
                test: /node_modules[\\/](@tanstack|zod|react-hook-form|@hookform)[\\/]/,
              },
            ],
          },
        },
      },
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  };
});
