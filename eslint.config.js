// Cấu hình ESLint (flat config) dùng chung cho toàn monorepo.
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      'apps/api/src/generated/**',
      'docs/references/**',
      'storage/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': 'off',
    },
  },
  {
    files: ['apps/api/**/*.ts', 'packages/shared/**/*.ts', '*.js'],
    languageOptions: { globals: globals.node },
  },
  {
    // Chỉ repository/lib được gọi Prisma trực tiếp (bảo đảm lọc phạm vi dữ liệu — docs/02).
    files: ['apps/api/src/modules/**/*.ts'],
    ignores: ['apps/api/src/modules/**/repository.ts', 'apps/api/src/modules/**/*.test.ts'],
    rules: {
      // Cho phép `import type` (kiểu dữ liệu), cấm import thực thi Prisma ngoài repository.ts.
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/lib/prisma*', '**/generated/prisma*'],
              message: 'Chỉ repository.ts được truy cập Prisma trực tiếp.',
              allowTypeImports: true,
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
);
