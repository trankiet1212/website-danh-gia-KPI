# Hệ thống quản lý và đánh giá kết quả thực hiện nhiệm vụ KPI/OKR

Phần mềm quản lý, theo dõi tiến độ, đánh giá và tổng hợp kết quả thực hiện nhiệm vụ của cán bộ, công chức và các phòng chuyên môn thuộc Ban Tổ chức Tỉnh ủy.

> **Trạng thái:** Giai đoạn 4/8 — đăng nhập, phân quyền theo vai trò và phạm vi dữ liệu, quản lý tổ chức, nhân sự, tài khoản. Chưa có chức năng KPI/OKR và đánh giá. Xem [docs/11-lo-trinh.md](docs/11-lo-trinh.md).
>
> **Dữ liệu demo:** họ tên cán bộ trong seed là **tên giả**; cấu trúc đơn vị/chức vụ theo sơ đồ phân công. Các quy tắc tính điểm, xếp loại chưa được cơ quan xác nhận sẽ luôn được đánh dấu "chờ xác nhận".

## Công nghệ

React 19 + TypeScript + Vite + Tailwind CSS + shadcn/ui · Node.js + Express 5 + TypeScript · PostgreSQL 16 + Prisma 7 · Docker Compose · Vitest + Supertest (Playwright ở GĐ7). Chi tiết: [docs/02-kien-truc.md](docs/02-kien-truc.md), [ADR-0006](docs/adr/0006-tech-versions-and-dev-tooling.md).

## Cài đặt và chạy trên máy mới (Windows)

### 1. Chuẩn bị

- **Node.js ≥ 22.22** (khuyến nghị 24 LTS), **Git**, **Docker Desktop** (WSL 2). Hướng dẫn cài Docker: [docs/01-moi-truong.md](docs/01-moi-truong.md).
- Mở Docker Desktop và chờ nó chạy xong.

### 2. Lấy mã nguồn và cài thư viện

```powershell
git clone <địa-chỉ-repo> Web_KPI
cd Web_KPI
npm install
```

`npm install` tải thư viện cho cả 3 workspace, build gói dùng chung `@kpi/shared` và sinh Prisma Client.

### 3. Tạo file cấu hình `.env`

```powershell
Copy-Item .env.example .env
```

Mở `.env` và:

- thay **mọi** chỗ `CHANGE_ME` trong `POSTGRES_PASSWORD`, `DATABASE_URL`, `TEST_DATABASE_URL` bằng **cùng một** mật khẩu mạnh;
- đặt `SESSION_SECRET` là chuỗi ngẫu nhiên ≥ 32 ký tự;
- (tùy chọn, chỉ để dùng thử) đặt `DEMO_USER_PASSWORD` để seed tạo tài khoản DEMO.

Tạo nhanh chuỗi ngẫu nhiên:

```powershell
-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 24 | % {[char]$_})
```

> `.env` chứa bí mật — đã nằm trong `.gitignore`, **không commit**.

### 4. Khởi động database, tạo bảng, nạp dữ liệu demo

```powershell
npm run db:up            # chạy PostgreSQL trong Docker, chờ đến khi sẵn sàng
npm run db:migrate       # tạo bảng theo các migration trong apps/api/prisma/migrations
npm run db:seed          # nạp dữ liệu DEMO (chạy lại nhiều lần không bị trùng)
npm run db:check         # kiểm tra: kết nối OK + đã áp đủ migration
```

Lần chạy `db:up` đầu tiên Docker tải image `postgres:16-alpine` (~110 MB) và tạo sẵn 2 database: `web_kpi_dev` (dùng hằng ngày) và `web_kpi_test` (chỉ cho kiểm thử tự động).

### 5. Chạy ứng dụng

```powershell
npm run dev
```

- Giao diện: <http://localhost:5173> (trang **Trạng thái hệ thống** hiển thị kết nối API và DB)
- API: <http://localhost:4000/api/v1/health>

Dừng bằng `Ctrl + C`. Dừng database (giữ dữ liệu): `npm run db:stop`.

### 6. Kiểm tra chất lượng

```powershell
npm run db:migrate:test  # một lần (và sau mỗi migration mới): tạo bảng trong DB kiểm thử
npm run typecheck        # kiểm tra kiểu TypeScript cả 3 workspace
npm run lint             # ESLint
npm test                 # Vitest + Supertest (test DB chạy trên web_kpi_test, tự rollback)
npm run build            # build production
```

## Cấu trúc thư mục

```
Web_KPI/
├── apps/api/        REST API /api/v1 (Express + Prisma) — prisma/ chứa schema, migrations, seed
├── apps/web/        Giao diện React
├── packages/shared/ Enum, mã quyền, zod schema, kiểu dữ liệu dùng chung
├── docker/          Script khởi tạo PostgreSQL
├── scripts/         Sao lưu / phục hồi database (PowerShell)
├── backups/         File sao lưu (không commit)
├── docs/            Tài liệu thiết kế chuẩn (đọc docs/00-tong-quan.md trước)
└── CLAUDE.md        Quy tắc làm việc của dự án
```

## Đăng nhập

### Tài khoản DEMO (chỉ môi trường phát triển)

`npm run db:seed` tạo **39 tài khoản** (1 quản trị + 38 cán bộ DEMO) nếu `.env` có `DEMO_USER_PASSWORD` (mọi tài khoản demo dùng chung mật khẩu này). 8 tài khoản tiêu biểu để thử phân quyền:

| Tài khoản   | Vai trò — phạm vi dữ liệu                                                               |
| ----------- | --------------------------------------------------------------------------------------- |
| `quantri`   | Quản trị hệ thống — quản lý tài khoản, vai trò, danh mục; **không** xem hồ sơ nghiệp vụ |
| `truongban` | Lãnh đạo cơ quan — toàn cơ quan                                                         |
| `ptb.tccb`  | Lãnh đạo cơ quan — chỉ Phòng Tổ chức cán bộ                                             |
| `tp.tccb`   | Lãnh đạo phòng — cán bộ trong Phòng TCCB                                                |
| `pp.tccb`   | Lãnh đạo phòng — chỉ cán bộ do mình quản lý trực tiếp                                   |
| `cv.tccb`   | Cán bộ, công chức — chỉ hồ sơ bản thân                                                  |
| `tp.tcddv`  | Lãnh đạo phòng — Phòng TCĐ-ĐV (thử truy cập chéo)                                       |
| `tonghop`   | Cán bộ tổng hợp — thêm/sửa/điều chuyển hồ sơ toàn cơ quan                               |

<details>
<summary>31 tài khoản của các cán bộ còn lại</summary>

| Tài khoản        | Cán bộ (tên giả)   | Chức vụ — phạm vi                                                      |
| ---------------- | ------------------ | ---------------------------------------------------------------------- |
| `ptb.thuongtruc` | Lê Khánh Cúc       | Phó Trưởng ban thường trực — toàn cơ quan (giả định DEMO, docs/09 #32) |
| `ptb.vp`         | Vũ Minh Giao       | Phó Trưởng ban phụ trách Văn phòng                                     |
| `ptb.tcddv`      | Đỗ Gia Hằng        | Phó Trưởng ban phụ trách Phòng TCĐ-ĐV                                  |
| `ptb.bvctnb`     | Bùi Bảo Kha        | Phó Trưởng ban phụ trách Phòng BVCTNB                                  |
| `cvp`            | Đinh Thanh Lâm     | Chánh Văn phòng — cán bộ trong Văn phòng                               |
| `tp.bvctnb`      | Lý Văn Mẫn         | Trưởng phòng BVCTNB — cán bộ trong phòng                               |
| `pp.tccb2`       | Châu Quang Nghi    | Phó phòng TCCB — cấp dưới trực tiếp                                    |
| `pp.tccb3`       | Quách Khánh Oanh   | Phó phòng TCCB — cấp dưới trực tiếp                                    |
| `pcvp1`          | Trần Minh Quế      | Phó Chánh Văn phòng — cấp dưới trực tiếp                               |
| `pcvp2`          | Lê Gia Sang        | Phó Chánh Văn phòng — cấp dưới trực tiếp                               |
| `pcvp3`          | Phạm Bảo Tài       | Phó Chánh Văn phòng — cấp dưới trực tiếp                               |
| `pp.tcddv1`      | Vũ Thị Thoa        | Phó phòng TCĐ-ĐV — cấp dưới trực tiếp                                  |
| `pp.tcddv2`      | Đỗ Thanh Trinh     | Phó phòng TCĐ-ĐV — cấp dưới trực tiếp                                  |
| `pp.tcddv3`      | Bùi Diệu Uy        | Phó phòng TCĐ-ĐV — cấp dưới trực tiếp                                  |
| `cv.tccb2`       | Đinh Quang Xuyên   | Chuyên viên Phòng TCCB                                                 |
| `cv.tccb3`       | Tạ Khánh Ý         | Chuyên viên Phòng TCCB                                                 |
| `cv.tccb4`       | Lý Tường Đào       | Chuyên viên Phòng TCCB                                                 |
| `cv.tccb5`       | Châu Minh Hiền     | Chuyên viên Phòng TCCB                                                 |
| `cv.tccb6`       | Quách Gia Kiều     | Chuyên viên Phòng TCCB                                                 |
| `cv.vp1`         | Nguyễn Bảo Lực     | Chuyên viên Văn phòng (kế toán)                                        |
| `cv.vp2`         | Trần Thị Nhàn      | Chuyên viên Văn phòng (quản trị công sở)                               |
| `cv.vp3`         | Phạm Diệu Quyên    | Chuyên viên Văn phòng (chính sách)                                     |
| `cv.vp4`         | Vũ Văn Sương       | Chuyên viên Văn phòng (chính sách)                                     |
| `nv.vp1`         | Đỗ Quang Thắng     | Nhân viên Văn phòng (CNTT)                                             |
| `vt.vp1`         | Bùi Khánh Tín      | Văn thư, lưu trữ — Văn phòng                                           |
| `vt.vp2`         | Ngô Tường Trọng    | Văn thư, lưu trữ — Văn phòng                                           |
| `cv.tcddv1`      | Tạ Gia Yên         | Chuyên viên Phòng TCĐ-ĐV                                               |
| `cv.tcddv2`      | Lý Bảo Ánh         | Chuyên viên Phòng TCĐ-ĐV                                               |
| `cv.tcddv3`      | Châu Thị Bích Ngọc | Chuyên viên Phòng TCĐ-ĐV                                               |
| `cv.tcddv4`      | Quách Thanh Cẩm    | Chuyên viên Phòng TCĐ-ĐV                                               |
| `cv.tcddv5`      | Nguyễn Diệu An     | Chuyên viên Phòng TCĐ-ĐV                                               |

Quy ước tên: `ptb.*` Phó Trưởng ban, `tp.*`/`cvp` Trưởng phòng/Chánh VP, `pp.*`/`pcvp*` Phó phòng/Phó CVP, `cv.*` chuyên viên, `nv.*` nhân viên, `vt.*` văn thư. Phạm vi của Phó Trưởng ban thường trực là giả định DEMO (docs/09 #32).

</details>

> Nếu mật khẩu có ký tự `#`, đặt giá trị trong dấu nháy kép trong `.env`.

### Hướng dẫn demo từng bước (dữ liệu DEMO)

Seed tạo sẵn bộ quy tắc `RS-CANHAN` (**chờ xác nhận**), bộ tiêu chí `CS-LD`, `CS-CV` (**đã trình**), danh mục 48 sản phẩm/công việc, 17 mục tiêu OKR, kỳ Quý II/2026 ở giai đoạn "Tự đánh giá" và hai hồ sơ:

- **Phạm Tường Duy** (Phó Trưởng ban): đã nộp tự đánh giá bằng đúng số liệu ví dụ của 05-HD/TU Phụ lục 2 → **83,6 điểm** (đối chiếu với văn bản: [docs/07](docs/07-tieu-chi-va-tinh-diem.md) §7.4).
- **Ngô Văn Vân** (chuyên viên, `cv.tccb`): bản nháp đang tự đánh giá.

> **Trước khi demo**, nên sao lưu: `npm run db:backup`. Các bước dưới làm thay đổi dữ liệu DEMO và chạy lại seed **không** đưa hồ sơ về trạng thái cũ — muốn demo lại thì phục hồi bản sao lưu vào database mới (mục "Sao lưu và phục hồi").

| Bước | Tài khoản   | Thao tác                                                                                                                                           | Kết quả mong đợi                                                            |
| ---- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1    | `cv.tccb`   | Trang chủ → Dashboard chỉ có số liệu bản thân, mục "Hồ sơ chờ tôi xử lý" có hồ sơ của mình                                                         | Phạm vi "bản thân"                                                          |
| 2    | `cv.tccb`   | Menu **Hồ sơ đánh giá** → hồ sơ Quý II → sửa phiếu → **Lưu và tính thử** → xem giải thích → **Nộp tự đánh giá**                                    | Trạng thái "Đã nộp", có điểm tự đánh giá                                    |
| 3    | `tp.tcddv`  | Mở đường dẫn hồ sơ của bước 2                                                                                                                      | "Không tìm thấy" (ngoài phạm vi)                                            |
| 4    | `pp.tccb`   | Mở hồ sơ → phiếu thẩm định (điền sẵn số liệu tự đánh giá) → chỉnh nếu cần → **Hoàn tất thẩm định**                                                 | "Đã thẩm định", điểm thẩm định lưu riêng                                    |
| 5    | `truongban` | Hồ sơ hiện "Chưa đủ điều kiện phê duyệt" → menu **Quy tắc tính điểm** → v1 → **Xác nhận áp dụng**; menu **Bộ tiêu chí** → CS-CV v1 → **Phê duyệt** | Quy tắc "Đã xác nhận", bộ tiêu chí "Đã phê duyệt"                           |
| 6    | `truongban` | Quay lại hồ sơ → **Phê duyệt** (chọn mức khác mức đề xuất phải nêu lý do)                                                                          | "Đã phê duyệt", hồ sơ bị khóa                                               |
| 7    | `cv.tccb`   | Thử sửa hồ sơ                                                                                                                                      | Không còn nút sửa; API báo phải thực hiện quy trình mở lại                  |
| 8    | `truongban` | **Mở lại** (ghi lý do)                                                                                                                             | Lần điều chỉnh 2; kết quả duyệt lần 1 vẫn còn ở tab "Kết quả và giải thích" |
| 9    | `tp.tccb`   | Menu **Báo cáo** → Đơn vị → Quý II/2026, Phòng TCCB → **Xuất Excel**, **Xuất PDF**                                                                 | File chỉ có cán bộ Phòng TCCB                                               |
| 10   | `tonghop`   | Menu **Dự thảo văn bản** → mẫu báo cáo → **Xem trước** → **Tải PDF dự thảo**                                                                       | PDF có chữ chìm "DỰ THẢO", liệt kê trường còn thiếu                         |
| 11   | `quantri`   | Thử mở Hồ sơ đánh giá / Báo cáo                                                                                                                    | Không có menu; API trả 403 (quản trị kỹ thuật không xem dữ liệu nghiệp vụ)  |

Ngoài ra: **Mục tiêu, kết quả then chốt** (OKR — tiến độ chỉ để theo dõi), **Kỳ đánh giá**, **Danh mục SP/CV**; trang **Trạng thái hệ thống** kiểm tra kết nối API/DB.

### Tài khoản quản trị thật

Không có tài khoản/mật khẩu mặc định. Tạo bằng lệnh (hỏi tên đăng nhập và mật khẩu, nhập ẩn):

```powershell
npm run create-admin
```

Sau đó đăng nhập bằng tài khoản này để tạo tài khoản cho cán bộ và cấp vai trò. Tài khoản mới nhận **mật khẩu tạm** (chỉ hiện một lần) và phải đổi mật khẩu ở lần đăng nhập đầu.

## Sao lưu và phục hồi

Script PowerShell chạy `pg_dump`/`pg_restore` **bên trong container** (không cần cài PostgreSQL trên Windows). File sao lưu nằm trong `backups\` (đã `.gitignore` — có thể chứa dữ liệu cá nhân, **không commit**, cất giữ an toàn).

```powershell
npm run db:backup                                   # sao lưu web_kpi_dev → backups\web_kpi_dev-<thời gian>.dump (+ .sha256)
npm run db:backup -- -Database web_kpi_test         # sao lưu database khác

npm run db:restore -- -File backups\web_kpi_dev-20261011-210000.dump
#   → kiểm tra SHA-256, tạo database MỚI web_kpi_restore_<thời gian>, phục hồi, in số bản ghi để đối chiếu
npm run db:restore -- -File backups\x.dump -Target web_kpi_demo2   # tự đặt tên database đích
```

- Script phục hồi **không bao giờ ghi đè** database đang có: tên đích đã tồn tại → dừng; file bị sửa (sai SHA-256) → dừng.
- Dùng bản phục hồi: sửa `DATABASE_URL` trong `.env` sang database mới (ví dụ `.../web_kpi_restore_20261011_210500?schema=public`), chạy `npm run db:check`, rồi `npm run dev`.
- Đã diễn tập ngày 11/10/2026: số bản ghi và 12 trigger bảo vệ dữ liệu khớp nguồn ([docs/12](docs/12-qa-bao-cao.md) §3.6).
- Khuyến nghị vận hành: sao lưu trước mỗi lần chạy migration/cập nhật phiên bản và định kỳ hằng ngày; lưu ít nhất một bản ở máy khác; diễn tập phục hồi định kỳ.

## Kiểm thử và QA

- Báo cáo QA, rà soát bảo mật, danh sách lỗi theo mức độ, test đã/chưa chạy, rủi ro còn lại: [docs/12-qa-bao-cao.md](docs/12-qa-bao-cao.md).
- Hệ thống **chưa** được đánh giá, thẩm định cấp độ an toàn thông tin; tài liệu không khẳng định hệ thống đạt cấp độ nào.

## API

Đặc tả: [docs/04-api.md](docs/04-api.md) (mục "Trạng thái triển khai" liệt kê endpoint đã có). Định dạng lỗi chung: `{ "error": { "code", "message", "details"?, "requestId" } }`.

- Công khai: `GET /api/v1/health`, `GET /api/v1/health/live`, `POST /api/v1/auth/login`.
- Còn lại cần đăng nhập (cookie phiên) và header `X-CSRF-Token` cho request thay đổi dữ liệu.

## Biến môi trường

| Biến                                                  | Bắt buộc       | Mặc định                | Ý nghĩa                                                                            |
| ----------------------------------------------------- | -------------- | ----------------------- | ---------------------------------------------------------------------------------- |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Có             | — / — / `web_kpi_dev`   | Tài khoản và DB của container PostgreSQL                                           |
| `POSTGRES_PORT`                                       | Không          | `5432`                  | Cổng trên máy (chỉ 127.0.0.1)                                                      |
| `DATABASE_URL`                                        | Có             | —                       | Chuỗi kết nối API/Prisma dùng                                                      |
| `TEST_DATABASE_URL`                                   | Cho test DB    | —                       | DB kiểm thử, **phải khác** `DATABASE_URL`                                          |
| `NODE_ENV`                                            | Không          | `development`           | `development` / `test` / `production`                                              |
| `API_PORT`                                            | Không          | `4000`                  | Cổng API                                                                           |
| `CORS_ORIGINS`                                        | Production: có | rỗng                    | Danh sách origin được gọi API (phân tách bằng dấu phẩy). Production bắt buộc HTTPS |
| `LOG_LEVEL`                                           | Không          | `info`                  | Mức log                                                                            |
| `TRUST_PROXY`                                         | Không          | `false`                 | `true`/số hop khi chạy sau reverse proxy                                           |
| `BODY_LIMIT`                                          | Không          | `1mb`                   | Giới hạn kích thước JSON body                                                      |
| `SESSION_SECRET`                                      | Có             | —                       | Khóa bí mật ký CSRF token (≥ 32 ký tự ngẫu nhiên)                                  |
| `SESSION_IDLE_MINUTES` / `SESSION_ABSOLUTE_HOURS`     | Không          | `30` / `8`              | Hết hạn phiên khi không hoạt động / tối đa kể từ khi đăng nhập                     |
| `LOGIN_MAX_ATTEMPTS` / `LOGIN_LOCK_MINUTES`           | Không          | `5` / `15`              | Khóa tạm tài khoản sau N lần sai, trong M phút                                     |
| `LOGIN_RATE_LIMIT`                                    | Không          | `20`                    | Số lần gọi đăng nhập tối đa mỗi 15 phút / IP                                       |
| `DEMO_USER_PASSWORD`                                  | Không          | —                       | Mật khẩu chung cho tài khoản DEMO; để trống = không tạo                            |
| `SEED_DEMO`                                           | Không          | —                       | Phải là `true` thì `db:seed` mới chạy; luôn bị chặn khi production                 |
| `API_PROXY_TARGET`                                    | Không          | `http://localhost:4000` | Nơi Vite dev server chuyển tiếp `/api`                                             |

API kiểm tra toàn bộ biến khi khởi động và dừng ngay với thông báo tiếng Việt nếu có biến sai.

## Lưu ý an toàn dữ liệu

- **Không chạy** `docker compose down -v`, `npx prisma migrate reset`, `prisma db push --force-reset` khi chưa sao lưu — các lệnh này **xóa dữ liệu**.
- Nếu `npm run db:migrate` hỏi có reset database không → chọn **No** và kiểm tra lại migration.
- Không đặt văn bản gốc / dữ liệu cá nhân thật vào repo; dùng `docs/references/` (đã gitignore).
- Phần mềm **không dùng để xử lý thông tin, tài liệu bí mật nhà nước**.
