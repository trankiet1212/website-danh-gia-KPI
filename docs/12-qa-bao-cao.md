# Báo cáo QA và rà soát bảo mật — đợt 1 (11/10/2026)

> Phạm vi: toàn bộ mã nguồn hiện có sau GĐ6 (xác thực, phân quyền, nhân sự, kỳ, quy tắc, bộ tiêu chí, OKR, chấm điểm, phê duyệt, dashboard, báo cáo, xuất Excel/PDF, dự thảo).
> Báo cáo này **không** khẳng định hệ thống an toàn tuyệt đối, cũng **không** khẳng định đạt một cấp độ an toàn thông tin nào. Việc xác định cấp độ phải theo hồ sơ đề xuất, thẩm định và kiểm tra theo quy định hiện hành.

## 1. Tóm tắt

| Hạng mục                                | Kết quả                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------ |
| Lỗi tìm thấy                            | 8 (0 Nghiêm trọng, 0 Cao, 4 Trung bình, 4 Thấp) — **đã sửa cả 8** và có test hồi quy |
| Thiếu sót chức năng (chưa triển khai)   | Giao nhiệm vụ, upload minh chứng — **không kiểm thử được**                           |
| Test tự động                            | 268 test qua (API 255, web 9, shared 4)                                              |
| Kiểm thử HTTP trên bản build production | 57 phép kiểm tra: 56 đạt, 1 báo động giả (xem §3.3)                                  |
| Diễn tập sao lưu/phục hồi               | Đạt (số bản ghi và trigger khớp nguồn; từ chối file bị sửa và tên DB trùng)          |

## 2. Danh sách lỗi theo mức độ

Mức độ: **Nghiêm trọng** (lộ/mất dữ liệu, vượt quyền) · **Cao** (sai nghiệp vụ, chặn chức năng chính) · **Trung bình** (lỗi hệ thống khi thao tác hợp lệ, nguy cơ từ chối dịch vụ) · **Thấp** (thông tin thừa, thiếu dấu vết trong tình huống hiếm).

| Mã    | Mức        | Mô tả                                                                                                                                                                                                                  | Tái hiện                             | Trạng thái                                                                                  | Kiểm chứng sau sửa                                                                              |
| ----- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| QA-01 | Trung bình | Hai người cùng tạo phiên bản bộ quy tắc → người thứ hai nhận **HTTP 500** (trùng số phiên bản). Dữ liệu không hỏng nhờ ràng buộc UNIQUE                                                                                | 3 yêu cầu song song: `500, 500, 201` | **Đã sửa**: cấp số phiên bản trong transaction có khóa tư vấn PostgreSQL (`lib/db-lock.ts`) | Test `qa-regression` (4 yêu cầu → 4×201, số 1–4); chạy lại trên bản production: `201, 201, 201` |
| QA-02 | Trung bình | Như QA-01 với phiên bản bộ tiêu chí                                                                                                                                                                                    | `500, 201, 500`                      | **Đã sửa** (cùng cách)                                                                      | Test + chạy lại: `201, 201, 201`                                                                |
| QA-04 | Trung bình | Sinh cây kỳ cùng một năm đồng thời → HTTP 500                                                                                                                                                                          | `201, 500`                           | **Đã sửa**: khóa theo năm trong transaction                                                 | Test (3 yêu cầu song song, đúng 19 kỳ); chạy lại: `201 (tạo 19), 201 (tạo 0)`                   |
| QA-06 | Trung bình | Xuất Excel/PDF và PDF dự thảo không giới hạn tần suất → một tài khoản hợp lệ có thể làm chậm máy chủ                                                                                                                   | Phân tích mã                         | **Đã sửa**: giới hạn 30 lần/5 phút/tài khoản (`middlewares/export-limit.ts`)                | Test: lần 31 → 429; tài khoản khác không bị ảnh hưởng                                           |
| QA-03 | Thấp       | Lỗi ràng buộc DB (trùng khóa, trigger khóa dữ liệu) lọt qua service sẽ thành HTTP 500                                                                                                                                  | Suy ra từ QA-01/02/04                | **Đã sửa**: bộ xử lý lỗi chung ánh xạ → 409 (phòng thủ nhiều lớp)                           | Unit test `mapPrismaError`                                                                      |
| QA-05 | Thấp       | `/health` công khai trả phiên bản, môi trường, thời gian chạy ở production                                                                                                                                             | `curl /api/v1/health`                | **Đã sửa**: production chỉ trả trạng thái                                                   | Test production/không production; chạy lại bản production                                       |
| QA-07 | Thấp       | Nhật ký kiểm toán của thao tác đổi trạng thái/cập nhật (xác nhận quy tắc, duyệt bộ tiêu chí, duyệt danh mục, chuyển trạng thái kỳ, sửa OKR) ghi **ngoài** transaction — nếu lệnh ghi nhật ký lỗi, thay đổi mất dấu vết | Phân tích mã                         | **Đã sửa**: ghi nhật ký trong cùng transaction                                              | Toàn bộ test tích hợp liên quan chạy lại đạt                                                    |
| QA-08 | Thấp       | Script phục hồi mới viết lỗi khi database đích chưa tồn tại                                                                                                                                                            | Diễn tập phục hồi                    | **Đã sửa**                                                                                  | Diễn tập lại đạt                                                                                |

## 3. Kiểm thử đã chạy (thành công)

### 3.1 Cài đặt, migration, build

| Bước                      | Lệnh                                                                                    | Kết quả                                                       |
| ------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Cài sạch                  | `npm ci` (Node 24.14, npm 11.9)                                                         | Đạt                                                           |
| Migration từ database mới | Tạo DB `web_kpi_qa` trống → `prisma migrate deploy` → `prisma migrate diff --exit-code` | 3 migration áp dụng; **không có sai lệch** (no drift)         |
| Seed vào DB mới           | `prisma db seed`                                                                        | Đạt; chạy lại không tạo trùng                                 |
| Lint / TypeScript         | `npm run lint`, `npm run typecheck`                                                     | 0 lỗi                                                         |
| Build                     | `npm run build` (shared, API `tsc`, web Vite)                                           | Đạt; **bản build API khởi động được ở `NODE_ENV=production`** |
| Test                      | `npm run test`                                                                          | API 255 (20 file), web 9, shared 4 — đạt                      |

### 3.2 Công thức tính điểm — bộ dữ liệu mẫu (`src/scoring/datasets.test.ts`)

| Bộ  | Dữ liệu                                                    | Kỳ vọng tính tay                                          | Kết quả |
| --- | ---------------------------------------------------------- | --------------------------------------------------------- | ------- |
| D1  | Lãnh đạo hoàn thành đủ, đúng hạn                           | 100; HTTNV (HTXS cần ≥30% nhiệm vụ vượt mức)              | Đạt     |
| D2  | D1 + vượt mức                                              | 100; HTXS                                                 | Đạt     |
| D3  | Không đảm bảo tiêu chí 18 điểm                             | 82; HTTNV                                                 | Đạt     |
| D4  | Chuyên viên, KH 4×hệ số 2, HT 3, 1 làm lại                 | A 75%, B 68,75%, C 75% → 81,0; không đủ điều kiện mức nào | Đạt     |
| D5  | 2 sản phẩm chậm 2 lần, D = 100/100/50                      | 88,3; không đủ điều kiện                                  | Đạt     |
| D6  | Trừ vượt giá trị sản phẩm                                  | B = 0 (sàn), 76,7; HTTNV                                  | Đạt     |
| D7  | 100 điểm + cờ kỷ luật                                      | KHTNV (bắt buộc)                                          | Đạt     |
| D8  | Tổng 39 điểm                                               | KHTNV theo khoảng điểm                                    | Đạt     |
| D9  | Thiếu 1 tiêu chí                                           | Chưa đủ dữ liệu, không đề xuất                            | Đạt     |
| D10 | Kế hoạch = 0                                               | Lỗi NO_PLAN, không chia 0                                 | Đạt     |
| D11 | Chỉ tiêu trọng số 60/40 (tăng 8/10; giảm 10→6, mục tiêu 2) | 68% → 77,6                                                | Đạt     |
| D12 | Làm tròn 74,45                                             | HALF_UP 74,5 / HALF_EVEN 74,4 / DOWN 74,4                 | Đạt     |
| D13 | Đổi cấu hình (trừ 10%, mẫu số B = hoàn thành)              | B = 2,9/3                                                 | Đạt     |

Cộng với 87 unit test engine/quy trình đã có (golden test ví dụ [HD05] Phụ lục 2 — docs/07 §7.4).

### 3.3 Kiểm thử HTTP trên bản build production (DB `web_kpi_qa`, cookie Secure, origin HTTPS giả lập)

| Nhóm                  | Phép kiểm tra                                                                                                                                                                                                                                                                  | Kết quả |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| Đăng nhập             | Chưa đăng nhập → 401 (kể cả đường dẫn không tồn tại); sai mật khẩu và tài khoản không tồn tại cùng thông báo; chuỗi SQL injection ở form đăng nhập → 401; 8 tài khoản DEMO đăng nhập được; cookie `__Host-kpi_sid; HttpOnly; Secure; SameSite=Strict`; đăng xuất thu hồi phiên | Đạt     |
| Lộ dữ liệu            | Phản hồi đăng nhập có `mustChangePassword` và `csrfToken` (thiết kế) — **không** có hash mật khẩu. Phép kiểm tra tự động báo FAIL vì bắt nhầm chữ "Password" trong tên cờ → **báo động giả**, đã kiểm tra lại thủ công                                                         | Đạt     |
| CSRF                  | Thiếu `X-CSRF-Token` → 403 `CSRF_INVALID`; Origin lạ → 403                                                                                                                                                                                                                     | Đạt     |
| RBAC / IDOR           | Chuyên viên chỉ thấy 1 hồ sơ (bản thân); đọc hồ sơ người khác bằng id → 404; lãnh đạo phòng khác → 404; quản trị kỹ thuật không đọc đánh giá → 403; chuyên viên vào quản trị → 403; thẩm định hồ sơ ngoài phạm vi → 404; tự phê duyệt → 403                                    | Đạt     |
| SQL injection         | Chuỗi `' OR 1=1 --`, `%' ; DROP TABLE…`, `%`, `_`, `\'` trong tìm kiếm → 200, không vượt phạm vi; tham số sắp xếp lạ → 400; id không phải UUID → 400. Rà mã: chỉ có 4 truy vấn SQL thô, đều tham số hóa, không nhận dữ liệu người dùng                                         | Đạt     |
| XSS / chèn công thức  | Tên `<img src=x onerror=…> =HYPERLINK(…)` lưu nguyên văn bản; giao diện React tự escape, không dùng `dangerouslySetInnerHTML`; ô Excel bắt đầu `= + - @` được thêm dấu `'`; API trả JSON với CSP `default-src 'none'`, `nosniff`                                               | Đạt     |
| Dữ liệu sai / trùng   | Trùng mã cán bộ → 409; body 2 MB → 413; JSON hỏng → 400, không lộ stack trace                                                                                                                                                                                                  | Đạt     |
| Đồng thời             | Hai người sửa cùng phiên bản hồ sơ → 200 + 409; hai người phê duyệt cùng lúc → đúng 1 thành công; tạo hồ sơ trùng song song → 1×201 + 409; tạo hàng loạt song song không trùng                                                                                                 | Đạt     |
| Chấm điểm → phê duyệt | Tính thử → nộp → thẩm định (Phó phòng) → chặn phê duyệt khi quy tắc chưa xác nhận → xác nhận quy tắc, duyệt bộ tiêu chí → phê duyệt → khóa → sửa sau duyệt 409                                                                                                                 | Đạt     |
| Xuất Excel/PDF        | Excel đơn vị của Trưởng phòng TCCB chỉ có cán bộ TCCB; Excel toàn cơ quan của chuyên viên chỉ có bản thân; PDF hợp lệ                                                                                                                                                          | Đạt     |
| Lỗi / 404             | Endpoint không tồn tại → 404 định dạng chuẩn có `requestId`; hồ sơ không tồn tại → 404                                                                                                                                                                                         | Đạt     |
| Header bảo mật        | CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Cache-Control `no-store`                                                                                                                                                                                                 | Có      |

### 3.4 Lịch sử kiểm toán, transaction

- Nhật ký `audit_logs` chỉ ghi thêm (trigger) — đã có test; kiểm tra lại trên bản phục hồi: lệnh UPDATE bị chặn.
- Chuyển trạng thái hồ sơ đánh giá ghi lịch sử + ảnh chụp + nhật ký trong **một transaction** (test GĐ5); sau QA-07, các thay đổi cấu hình cũng vậy.
- Log máy chủ (pino) che `cookie`, `x-csrf-token`, trường mật khẩu/token (đã thấy `[ĐÃ CHE]` trong log thật).

### 3.5 Giao diện (rà soát mã)

Mọi trang có trạng thái đang tải và thông báo lỗi; trang danh sách có trạng thái rỗng; có trang 404 và trang lỗi chung không lộ chi tiết kỹ thuật; nút xuất file gọi API thật (có unit test tải file). **Chưa bấm thử trên trình duyệt** (§4).

### 3.6 Sao lưu / phục hồi

`npm run db:backup -- -Database web_kpi_qa` → file `.dump` + `.sha256`; `npm run db:restore -- -File … -Target web_kpi_restore_qa` → số bản ghi users 8, employees 39, evaluation_records 39, evaluation_calculations 4, audit_logs 67, migrations 3 **khớp nguồn**; 12/12 trigger được phục hồi. Phục hồi vào tên DB đã tồn tại → từ chối; file bị sửa 1 byte → từ chối (sai SHA-256).

## 4. Kiểm thử CHƯA chạy

| Hạng mục                                                               | Lý do / đề xuất                                                                      |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Giao nhiệm vụ, upload minh chứng                                       | **Chức năng chưa triển khai** (lộ trình GĐ7) — không có gì để kiểm thử               |
| E2E trên trình duyệt (bấm thử giao diện, đa trình duyệt, điện thoại)   | Chưa có Playwright; cần chạy tay theo hướng dẫn demo trong README hoặc bổ sung ở GĐ7 |
| Quét bảo mật bằng công cụ (OWASP ZAP, Burp), kiểm thử xâm nhập độc lập | Ngoài phạm vi đợt này; nên thực hiện trước khi đưa vào sử dụng                       |
| Kiểm thử tải/hiệu năng (nhiều người dùng, nhiều kỳ)                    | Chưa làm                                                                             |
| Triển khai nhiều tiến trình, HTTPS thật, reverse proxy                 | Chưa có môi trường (GĐ8)                                                             |
| Phục hồi đè lên database đang dùng                                     | Cố ý không làm (thao tác phá hủy dữ liệu) — script chỉ phục hồi vào database mới     |

## 5. Rủi ro còn lại (chưa xử lý)

| Mã   | Mức             | Rủi ro                                                                                                                                                                 | Đề xuất                                                                                       |
| ---- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| R-01 | Cao (chức năng) | Thiếu module giao nhiệm vụ và minh chứng: số liệu nhiệm vụ nhập tay trong phiếu chấm, chưa có dữ liệu nguồn đối chiếu                                                  | Triển khai GĐ7 kèm kiểm soát upload (docs/10 R8)                                              |
| R-02 | Trung bình      | Bộ đếm giới hạn tần suất (đăng nhập, xuất file) nằm trong bộ nhớ tiến trình: khởi động lại thì đặt lại, nhiều tiến trình không dùng chung                              | Dùng kho đếm chung (PostgreSQL/Redis) khi triển khai nhiều tiến trình                         |
| R-03 | Trung bình      | Nhật ký kiểm toán chưa có chuỗi băm toàn vẹn; người có quyền quản trị DB vẫn tắt được trigger                                                                          | Chuỗi băm + kiểm tra định kỳ (GĐ7); tài khoản DB của ứng dụng không có quyền DDL ở production |
| R-04 | Trung bình      | Chưa cấu hình CSP/header cho giao diện tĩnh khi triển khai; chưa có HTTPS thật                                                                                         | Cấu hình reverse proxy (GĐ8)                                                                  |
| R-05 | Trung bình      | `npm audit`: `uuid` (trung bình, qua exceljs — chỉ ảnh hưởng khi truyền `buf`, hệ thống không dùng); `mysql2`, `deepmerge-ts` (qua prisma — hệ thống không dùng MySQL) | Theo dõi bản cập nhật exceljs/prisma                                                          |
| R-06 | Thấp            | Ghi nhật ký của một số thao tác **tạo mới** cấu hình (bộ quy tắc, bộ tiêu chí, mục tiêu) vẫn sau khi tạo, ngoài transaction                                            | Chuyển vào transaction khi chỉnh các module này                                               |
| R-07 | Thấp            | Thông báo "tài khoản bị khóa/ngừng" cho biết tài khoản tồn tại (đánh đổi để người dùng hiểu lý do)                                                                     | Chấp nhận hoặc đổi thông báo chung                                                            |
| R-08 | Thấp            | Tìm kiếm: `%`, `_` hoạt động như ký tự đại diện (không vượt phạm vi)                                                                                                   | Có thể escape nếu cần tìm chính xác                                                           |
| R-09 | Thấp            | Bộ lọc đơn vị trên giao diện liệt kê mọi đơn vị; chọn đơn vị ngoài phạm vi nhận "Không tìm thấy"                                                                       | Lọc danh sách theo phạm vi                                                                    |
| R-10 | —               | Không có MFA; chưa đánh giá theo quy định về cấp độ ATTT                                                                                                               | Thuộc phần 3 của đề bài — phân tích riêng, không khẳng định đạt cấp độ                        |

## 6. Dữ liệu QA còn lại trên máy

Hai database tạo ra khi QA: `web_kpi_qa`, `web_kpi_restore_qa` (không ảnh hưởng `web_kpi_dev`, `web_kpi_test`) và file `backups/web_kpi_qa-*.dump`. Xóa khi không cần (thao tác xóa dữ liệu — tự thực hiện khi chắc chắn):

```powershell
docker exec web-kpi-db psql -U <POSTGRES_USER> -d postgres -c "DROP DATABASE web_kpi_qa" -c "DROP DATABASE web_kpi_restore_qa"
```
