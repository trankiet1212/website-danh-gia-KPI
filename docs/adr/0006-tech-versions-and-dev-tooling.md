# ADR-0006: Phiên bản công nghệ và công cụ phát triển (GĐ3)

- **Trạng thái:** Chấp nhận (10/2026)

## Phiên bản chọn

| Gói                                          | Phiên bản                       | Lý do                                                                        |
| -------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------- |
| TypeScript                                   | ~6.0                            | `typescript-eslint` 8.71 chỉ hỗ trợ TS < 6.1; chưa dùng TS 7                 |
| Prisma / @prisma/client / @prisma/adapter-pg | 7.10.0 (ghim cứng)              | Bản ổn định; tag `latest` trên npm đang trỏ tới 8.0.0-rc — không dùng bản RC |
| Express                                      | 5.x                             | Hỗ trợ async handler, query chỉ đọc                                          |
| zod                                          | 4.x                             | Validate dùng chung FE/BE                                                    |
| React / React Router / Vite / Tailwind       | 19 / 8 / 8 / 4                  | Bản ổn định hiện hành, tương thích peer dependency                           |
| ESLint / Vitest                              | 10 / 5                          |                                                                              |
| PostgreSQL                                   | 16 (image `postgres:16-alpine`) |                                                                              |

## Prisma 7 — điểm khác cần nhớ

- Chuỗi kết nối khai báo ở `apps/api/prisma.config.ts` (đọc `.env` gốc), không còn `url` trong `schema.prisma`.
- Client sinh vào `apps/api/src/generated/prisma` (không commit); generator đặt `importFileExtension = "js"` để biên dịch được với `module: NodeNext`.
- Bắt buộc driver adapter: `new PrismaClient({ adapter: new PrismaPg({ connectionString }) })`.
- `prisma db seed` chạy riêng, không tự chạy sau migrate.
- CHECK/trigger viết tay trong migration; **không** dùng partial index viết tay để tránh Prisma phát hiện drift và đòi reset DB. Đã kiểm chứng: chạy lại `migrate dev` báo "Already in sync".

## Chạy API ở chế độ dev

`tsx watch` bị treo (không khởi động server) khi stdout bị pipe bởi `concurrently` trên Windows. Đã thay bằng watch có sẵn của Node: `node --watch --watch-preserve-output --import tsx src/server.ts` — đã kiểm chứng chạy được dưới `concurrently`.

## Biến môi trường frontend

Biến có tiền tố `VITE_` bị nhúng vào bundle trình duyệt, nên cấu hình hạ tầng (`API_PROXY_TARGET`) **không** mang tiền tố này.
