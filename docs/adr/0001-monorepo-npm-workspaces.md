# ADR-0001: Monorepo với npm workspaces

- **Trạng thái:** Chấp nhận (GĐ2)
- **Bối cảnh:** Frontend và backend dùng chung enum, mã quyền, schema validate. Người phát triển chính có kinh nghiệm cơ bản, dùng Windows; máy chỉ có npm (không có pnpm/yarn).
- **Quyết định:** Một repo gồm `packages/shared` (zod schema, enum, mã quyền, kiểu API), `apps/api`, `apps/web`; quản lý bằng npm workspaces. `@kpi/shared` build ra `dist/` (chạy tự động ở `postinstall`).
- **Hệ quả:** Validate giống nhau ở FE và BE; một lệnh `npm install` cho cả dự án. Đổi code trong `shared` cần build lại (`npm run build -w @kpi/shared`) để API/Web thấy thay đổi.
