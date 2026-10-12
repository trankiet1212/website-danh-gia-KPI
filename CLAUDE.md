# CLAUDE.md — Quy tắc dự án Web KPI/OKR (Ban Tổ chức Tỉnh ủy)

## Bối cảnh

Hệ thống web full-stack quản lý, theo dõi, đánh giá kết quả thực hiện nhiệm vụ KPI/OKR của cán bộ, công chức và các phòng thuộc Ban Tổ chức Tỉnh ủy Đắk Lắk. Thiết kế chuẩn nằm trong `docs/` — **đọc `docs/00-tong-quan.md` trước khi làm việc**. Tiến độ: `docs/11-lo-trinh.md`.

Người dùng chính của repo có kiến thức lập trình cơ bản, dùng Windows + VS Code. **Giao tiếp và hướng dẫn bằng tiếng Việt, giải thích các lệnh quan trọng.**

## Kiến trúc tóm tắt

- Monorepo npm workspaces: `packages/shared` (enum, mã quyền, zod schema), `apps/api` (Express 5 + Prisma 7, `/api/v1`), `apps/web` (React 19 + Vite + Tailwind 4 + shadcn/ui).
- PostgreSQL 16 qua Docker Compose; DB dev `web_kpi_dev`, DB kiểm thử `web_kpi_test`.
- Backend: `routes → controller → service → repository`. **Chỉ `repository.ts` được gọi Prisma** và mọi truy vấn nghiệp vụ nhận `scopeWhere` (ADR-0004).
- Engine tính điểm và state machine là hàm thuần, không truy cập DB (ADR-0005).
- Quy tắc tính điểm/xếp loại là cấu hình có phiên bản (ADR-0003). Prisma 7 specifics: ADR-0006.

## Lệnh thường dùng

```
npm run db:up | db:stop | db:migrate | db:migrate:test | db:seed | db:check | db:studio
npm run dev | typecheck | lint | test | build | format
npm run create-admin          # tạo Quản trị hệ thống (không có mật khẩu mặc định)
npm run db:backup | db:restore -- -File <dump>   # sao lưu / phục hồi vào DB MỚI (không ghi đè)
```

Tài khoản DEMO: xem README (mật khẩu chung = `DEMO_USER_PASSWORD` trong `.env`).

Docker CLI trên máy dev nằm ở `C:\Users\admin\AppData\Local\Programs\DockerDesktop\resources\bin` (có thể chưa có trong PATH của shell).

## Quy tắc bắt buộc

### An toàn dữ liệu

- Không xóa hoặc ghi đè file chưa đọc. Không sửa file UTF-8 bằng `Get-Content`/`Set-Content` của PowerShell 5.1 (làm hỏng tiếng Việt) — dùng công cụ Edit/Write.
- **Cấm tự chạy khi chưa được người dùng cho phép rõ ràng:** `prisma migrate reset`, `prisma db push --force-reset`/`--accept-data-loss`, `docker compose down -v`, `DROP`/`TRUNCATE` trên DB dev, `git reset --hard`, `git push --force`, `rm -rf`.
- Nếu `prisma migrate dev` đòi reset/báo drift → **dừng lại và hỏi**.
- Test chỉ ghi vào `web_kpi_test` và phải tự rollback; không bao giờ trỏ test vào `DATABASE_URL`.
- Không đưa CHECK/trigger/partial index viết tay vào schema theo cách khiến Prisma báo drift; chỉ dùng CHECK và trigger trong migration SQL.

### Nghiệp vụ

- **Không tự đặt** ngưỡng xếp loại, công thức tính điểm, quy định pháp lý. Mọi con số nghiệp vụ nằm trong cấu hình có phiên bản kèm căn cứ (`docs/07`, `docs/08`). Giá trị chưa có căn cứ → `provisional`, hiển thị cảnh báo và ghi vào `docs/09-cau-hoi-mo.md`.
- Không coi tỷ lệ hoàn thành KR là điểm KPI nếu chưa có quy tắc quy đổi được xác nhận.
- Engine tính điểm (`apps/api/src/scoring`) chỉ đọc tham số từ `RuleConfig`; thêm tham số nghiệp vụ = thêm khóa vào `packages/shared/src/schemas/rule-config.ts` + seed + `provisionalKeys` nếu chưa có căn cứ. Đổi kết quả engine → tăng `ENGINE_VERSION`.
- Kết quả đã phê duyệt, ảnh chụp tính điểm, lịch sử hồ sơ được trigger DB bảo vệ — không viết code/migration "sửa thẳng"; điều chỉnh chỉ qua quy trình mở lại (docs/06).
- Văn bản sinh từ hệ thống luôn ở trạng thái "DỰ THẢO" cho tới khi được duyệt.
- Không tự khẳng định hệ thống đạt cấp độ ATTT hay tuân thủ pháp luật.

### Bảo mật

- Kiểm tra quyền ở backend cho mọi endpoint; frontend chỉ ẩn/hiện. Tài nguyên ngoài phạm vi trả 404.
- Không log mật khẩu, token, cookie. Không trả stack trace cho client.
- Không commit `.env`, `docs/references/*` (trừ README), `storage/`, dữ liệu cá nhân thật. Seed chỉ dùng tên giả.
- Biến `VITE_*` bị nhúng vào bundle — không đặt bí mật/cấu hình hạ tầng với tiền tố này.

### Code

- TypeScript strict. Tên biến/hàm tiếng Anh; giao diện, thông báo lỗi, comment nghiệp vụ tiếng Việt.
- Validate đầu vào bằng zod (schema dùng chung đặt ở `packages/shared`). Lỗi trả theo định dạng chuẩn `{ error: { code, message, details?, requestId } }`.
- Không tạo nút/liên kết tới chức năng chưa có. Dữ liệu demo phải được đánh dấu rõ.
- Thay đổi thiết kế (DB, API, quyền, trạng thái) → cập nhật `docs/` (và ADR nếu lớn) **trước** khi sửa code.

### Xác thực, phân quyền (đã triển khai GĐ4)

- Route mới trong `/api/v1` mặc định nằm sau `authenticate → requireFreshPassword → csrfProtection` (src/routes.ts); thêm `authorize(db, 'quyền')` cho từng route.
- Dữ liệu nghiệp vụ theo cán bộ/đơn vị: dùng `resolveScope` + `employeeScopeWhere` (src/auth/scope.ts) trong service, truyền vào repository.
- Thay đổi dữ liệu quan trọng: ghi `writeAudit` (src/lib/audit.ts), ưu tiên trong cùng transaction.
- Test tích hợp dùng `tests/helpers/fixture.ts`: mỗi lần chạy tạo bộ dữ liệu riêng (hậu tố ngẫu nhiên) trên `web_kpi_test`, KHÔNG xóa/reset DB.

### Quy trình mỗi giai đoạn

- Chạy thật `typecheck`, `lint`, `test`, `build` (và migration nếu có) trước khi báo hoàn thành; không tuyên bố đã test khi chưa chạy.
- Báo cáo: file đã tạo/sửa, lệnh đã chạy + kết quả, lỗi còn tồn tại; cập nhật `docs/11-lo-trinh.md`.
- Chỉ commit/push khi người dùng yêu cầu.
