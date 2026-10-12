# Môi trường phát triển

## Yêu cầu

| Thành phần     | Phiên bản                    | Ghi chú                                           |
| -------------- | ---------------------------- | ------------------------------------------------- |
| Windows 10/11  | —                            | Đã kiểm tra trên Windows 11 Home                  |
| Node.js        | ≥ 22.22 (khuyến nghị 24 LTS) | Kiểm tra: `node -v`                               |
| npm            | ≥ 10                         | Đi kèm Node.js                                    |
| Git            | bất kỳ bản mới               | Kiểm tra: `git --version`                         |
| Docker Desktop | bản mới, backend WSL 2       | Chạy PostgreSQL 16                                |
| VS Code        | —                            | Extension đề xuất trong `.vscode/extensions.json` |

Máy dùng khi khởi tạo dự án (10/2026): Node 24.14, npm 11.9, Git 2.47, Docker 29.8, Docker Compose v5.5, RAM 31,7 GB.

## Cài Docker Desktop trên Windows (một lần)

1. Mở **PowerShell bằng quyền Administrator** (chuột phải → _Run as administrator_).
2. Cài WSL 2 — môi trường Linux mà Docker Desktop cần:
   ```powershell
   wsl --install
   ```
   Khởi động lại máy khi được yêu cầu.
3. Tải và cài **Docker Desktop** từ trang chính thức của Docker, chọn _Use WSL 2 instead of Hyper-V_.
4. Mở Docker Desktop, chờ biểu tượng chuyển sang trạng thái chạy, rồi kiểm tra:
   ```powershell
   docker --version
   docker compose version
   ```

## Quyền ghi thư mục dự án

Nếu thư mục dự án được tạo bằng quyền Administrator, tài khoản thường sẽ không ghi được (lỗi _Access denied_). Cấp quyền sửa cho tài khoản của bạn (PowerShell Admin):

```powershell
icacls "D:\Web_KPI" /grant "<máy>\<tài khoản>:(OI)(CI)M"
```

`M` = Modify (tạo/sửa/xóa file), `(OI)(CI)` = áp dụng cho mọi file/thư mục con. Lệnh không thay đổi dữ liệu.

## Các lệnh quan trọng

| Lệnh                                                                | Tác dụng                                                     | Mức an toàn                                                    |
| ------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------- |
| `npm install`                                                       | Cài thư viện, build `@kpi/shared`, sinh Prisma Client        | An toàn                                                        |
| `npm run db:up`                                                     | Khởi động PostgreSQL (Docker), chờ đến khi sẵn sàng          | An toàn                                                        |
| `npm run db:stop`                                                   | Dừng PostgreSQL, **giữ nguyên dữ liệu**                      | An toàn                                                        |
| `npm run db:migrate`                                                | Áp migration mới vào DB dev (`prisma migrate dev`)           | Cẩn thận: nếu Prisma hỏi **reset** → trả lời **No** và báo lại |
| `npm run db:migrate:test`                                           | Áp migration vào DB kiểm thử (`migrate deploy`, không reset) | An toàn                                                        |
| `npm run db:seed`                                                   | Nạp dữ liệu DEMO (idempotent, không xóa gì)                  | An toàn                                                        |
| `npm run db:check`                                                  | Kiểm tra kết nối + trạng thái migration                      | Chỉ đọc                                                        |
| `npm run db:studio`                                                 | Mở Prisma Studio xem dữ liệu trên trình duyệt                | Cẩn thận khi sửa tay                                           |
| `npm run dev`                                                       | Chạy API (4000) + Web (5173)                                 | An toàn                                                        |
| `npm test` / `npm run typecheck` / `npm run lint` / `npm run build` | Kiểm tra chất lượng                                          | An toàn                                                        |

**Lệnh phá hủy dữ liệu — KHÔNG chạy nếu chưa sao lưu và chưa thống nhất:**

| Lệnh                                                      | Hậu quả                                                |
| --------------------------------------------------------- | ------------------------------------------------------ |
| `docker compose down -v`                                  | Xóa volume `web-kpi-pgdata` → **mất toàn bộ database** |
| `npx prisma migrate reset`                                | Xóa sạch và tạo lại database                           |
| `npx prisma db push --force-reset` / `--accept-data-loss` | Xóa bảng/cột không khớp schema                         |

Prisma 7.9+ tự chặn các lệnh trên khi phát hiện chạy từ AI agent và yêu cầu người dùng xác nhận rõ ràng.

## Cổng sử dụng

| Cổng | Dịch vụ                     | Phạm vi                                                  |
| ---- | --------------------------- | -------------------------------------------------------- |
| 5173 | Vite dev server (giao diện) | localhost                                                |
| 4000 | API Express                 | mọi interface khi dev — production đặt sau reverse proxy |
| 5432 | PostgreSQL                  | **chỉ 127.0.0.1**                                        |

## Sự cố thường gặp

| Hiện tượng                                               | Nguyên nhân / cách xử lý                                                                          |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `Cấu hình môi trường không hợp lệ` khi chạy API          | Chưa có `.env` hoặc thiếu biến → sao chép `.env.example` thành `.env` và điền                     |
| Health trả `degraded` / 503                              | DB chưa chạy → `npm run db:up`, kiểm tra Docker Desktop                                           |
| `password authentication failed`                         | Mật khẩu trong `DATABASE_URL` khác `POSTGRES_PASSWORD`. Lưu ý: volume đã khởi tạo giữ mật khẩu cũ |
| `Port 5173 is in use`                                    | Còn tiến trình dev cũ → đóng terminal cũ hoặc dừng tiến trình `node` tương ứng                    |
| `tsx watch` không khởi động khi chạy cùng `concurrently` | Đã khắc phục: API dùng `node --watch --import tsx` (xem ADR-0006)                                 |
