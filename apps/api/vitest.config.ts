import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // Test tích hợp DB dùng chung web_kpi_test: chạy tuần tự giữa các file để tránh tranh chấp dữ liệu.
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
