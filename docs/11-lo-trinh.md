# Lộ trình triển khai

> Mỗi giai đoạn phải: chạy được, có kiểm thử thật, liệt kê file thay đổi, cập nhật bảng trạng thái dưới đây.

| GĐ  | Nội dung                                                                                                                               | Điều kiện hoàn thành                                                                | Trạng thái                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------- |
| 1   | Phân tích yêu cầu, căn cứ nghiệp vụ                                                                                                    | docs/08, docs/09                                                                    | ✅ Xong (còn văn bản chưa đọc — docs/08)           |
| 2   | Thiết kế kiến trúc, ERD, API, phân quyền, trạng thái, tính điểm                                                                        | docs/02–07, docs/10                                                                 | ✅ Xong                                            |
| 3   | Monorepo, cấu hình, Docker Compose, Prisma + migration đợt 1, seed DEMO, khung API (validate, lỗi, CORS, health), khung Web            | typecheck/lint/test/build qua; health báo DB OK                                     | ✅ Xong — xem chi tiết dưới                        |
| 4   | Auth phiên + CSRF, RBAC + scope, users/roles, tổ chức, nhân sự, điều chuyển, layout UI                                                 | Supertest quyền + truy cập chéo                                                     | ✅ Xong (import Excel chuyển sang GĐ5)             |
| 5   | Kỳ, rule set, danh mục SP/CV, bộ tiêu chí có phiên bản, OKR, engine tính điểm, phiếu đánh giá, khóa/mở lại kết quả                     | Golden test [HD05] (đối chiếu từng dòng — docs/07 §7.4); test khóa kết quả đã duyệt | ✅ Xong (nhiệm vụ, minh chứng, import Excel → GĐ6) |
| 6   | Workflow phê duyệt theo trạng thái kỳ, Dashboard, báo cáo cá nhân/đơn vị/cơ quan/tổng hợp kỳ, xuất Excel/PDF, dự thảo văn bản theo mẫu | Test luồng + dữ liệu xuất khớp phạm vi                                              | ✅ Xong (nhiệm vụ, minh chứng, import Excel → GĐ7) |
| 7   | Audit chain, hardening, Playwright luồng chính                                                                                         | Toàn bộ test qua; báo cáo rà soát bảo mật                                           | ⏳                                                 |
| 8   | README vận hành, sao lưu/phục hồi, triển khai, giới hạn hệ thống                                                                       | Cài lại từ đầu theo tài liệu thành công                                             | ⏳                                                 |

## GĐ3 — kết quả (10/2026)

**Đã làm**

- Monorepo npm workspaces: `packages/shared`, `apps/api`, `apps/web`.
- PostgreSQL 16 qua Docker Compose (chỉ mở 127.0.0.1), DB dev `web_kpi_dev` + DB kiểm thử `web_kpi_test`.
- Prisma 7 schema đợt 1 (17 bảng): danh tính & phân quyền, tổ chức & nhân sự, kỳ đánh giá, audit log, cấu hình.
  Migration `init_identity_org_periods` gồm thêm CHECK và trigger (một phân công chính; audit log append-only).
- Seed DEMO idempotent: 42 quyền, 5 vai trò, 6 đơn vị, 10 chức vụ, 11 VTVL (tạm), 38 cán bộ tên giả + phân công, 19 kỳ năm 2026.
- API: cấu hình env có kiểm tra (fail fast), logger che dữ liệu nhạy cảm, request-id, helmet/CSP, CORS whitelist, giới hạn body,
  middleware validate (zod), xử lý lỗi chuẩn, 404, health-check (`/health`, `/health/live`), tắt an toàn.
- Web: Vite + React 19 + Tailwind 4 + thành phần kiểu shadcn/ui, React Router, TanStack Query, layout (header/sidebar/breadcrumb), trang trạng thái hệ thống, trang 404.
- Script `db:check`, `db:migrate:test`.

**Còn tồn tại / làm ở giai đoạn sau**

- Bundle web 610 kB (cảnh báo của Vite) → tách code theo route khi thêm module (GĐ4).
- Chưa có Playwright (cài ở GĐ7 cùng trình duyệt kiểm thử).
- `shadcn` CLI chưa chạy — các thành phần UI viết tay theo chuẩn shadcn; dùng CLI để thêm thành phần mới ở GĐ4.
- Chưa có tài khoản đăng nhập — script `create-admin` và luồng auth thuộc GĐ4.

## GĐ4 — kết quả (10/2026)

**Đã làm**

- Xác thực: phiên phía server (cookie `httpOnly; SameSite=Strict`, DB chỉ lưu SHA-256 token), hết hạn khi không hoạt động
  (`SESSION_IDLE_MINUTES`) và hạn tuyệt đối (`SESSION_ABSOLUTE_HOURS`), đăng xuất thu hồi phiên, quản lý phiên của bản thân.
- Mật khẩu băm Argon2id; chính sách ≥ 12 ký tự, 3/4 loại ký tự, không chứa tên đăng nhập; khóa tạm sau N lần sai;
  giới hạn tần suất đăng nhập theo IP; mật khẩu tạm bắt buộc đổi; đổi mật khẩu thu hồi các phiên khác.
- CSRF token (HMAC theo phiên) cho mọi request thay đổi dữ liệu; chặn Origin lạ.
- RBAC + phạm vi dữ liệu (ALL/UNITS/OWN_UNIT/MANAGED/SELF/NONE), lọc ở repository; ngoài phạm vi → 404; từ chối quyền ghi audit `DENIED`.
- API: `/auth`, `/users`, `/roles`, `/permissions`, `/org-units`, `/positions`, `/job-positions`, `/employees` (tìm kiếm, lọc,
  phân trang, sắp xếp phía server; trùng mã/email → 409; optimistic locking → 409; điều chuyển có lịch sử; kết thúc công tác
  không xóa cứng, khóa tài khoản liên kết).
- Nhật ký kiểm toán cho đăng nhập/đăng xuất, thay đổi tài khoản/quyền/tổ chức/hồ sơ (ghi trong cùng transaction với thay đổi hồ sơ).
- Seed: 8 tài khoản DEMO theo vai trò (mật khẩu từ `DEMO_USER_PASSWORD`); script `npm run create-admin` cho môi trường thật.
- Web: đăng nhập, bắt đổi mật khẩu, tài khoản của tôi; hồ sơ cán bộ (danh sách/chi tiết/thêm/sửa/điều chuyển/kết thúc công tác);
  cơ cấu tổ chức (3 tab); quản trị tài khoản, vai trò và quyền. Responsive, trạng thái loading/empty/error, toast, xác nhận thao tác.
  Không dùng localStorage — dữ liệu luôn lấy từ API/PostgreSQL. Tách code theo trang + chunk vendor.
- Kiểm thử: 116 test API (5 file tích hợp trên DB kiểm thử: xác thực, truy cập chéo, nhân sự, tổ chức/quản trị) + 7 test web + 4 test shared.

**Còn tồn tại / chuyển giai đoạn sau**

- Nhập hồ sơ cán bộ từ Excel (thiết kế có ở docs/04) — chuyển sang GĐ5 cùng import danh mục SP/CV.
- Tìm kiếm chưa bỏ qua dấu tiếng Việt (cần extension `unaccent` của PostgreSQL) — "nguyen" chưa khớp "Nguyễn".
- Phạm vi `OWN_UNIT` chưa bao gồm đơn vị con (cơ cấu hiện tại chỉ có 1 cấp phòng).
- Chưa có Playwright E2E cho giao diện (GĐ7); kiểm thử giao diện ở GĐ4 là thủ công + unit test.
- Chuỗi băm toàn vẹn audit log (`prev_hash`/`hash`) để GĐ7.

## GĐ5 — kết quả (10/2026)

**Đã làm**

- Engine tính điểm thuần (`apps/api/src/scoring`, Decimal 40 chữ số): 6 phương pháp chấm (đảm bảo/không, điểm trực tiếp, định tính, so với mục tiêu tăng/giảm, KPI tổng hợp A/B/C/D theo [HD05] PL2, chỉ tiêu có trọng số); loại trừ tiêu chí không áp dụng theo chính sách; làm tròn cấu hình; phát hiện dữ liệu thiếu/sai/ngoại lệ; đề xuất xếp loại (khoảng điểm + điều kiện + cờ bắt buộc); giải thích từng bước; checksum.
- Cấu hình có phiên bản: bộ quy tắc (soạn JSON có kiểm tra schema → trình → xác nhận; người soạn không tự xác nhận; bất biến), danh mục SP/CV (phê duyệt), bộ tiêu chí dạng cây (kiểm tra tổng điểm/trọng số/phương pháp; trình → duyệt; bất biến; sao chép thành phiên bản mới).
- Kỳ đánh giá (sinh cây năm, chuyển trạng thái từng bước). OKR (mục tiêu cá nhân/đơn vị, KR tăng/giảm/đạt-không đạt/mốc, cập nhật tiến độ chỉ ghi thêm; tiến độ chỉ để theo dõi).
- Hồ sơ đánh giá: tạo/tạo hàng loạt, tự đánh giá → nộp → thẩm định → hoàn tất → phê duyệt → khóa → mở lại; 3 lớp điểm tách biệt; ảnh chụp SELF/REVIEW/APPROVAL lưu đầu vào + phiên bản công thức + kết quả + checksum; lịch sử và audit mọi bước; trigger DB chặn sửa kết quả đã duyệt.
- Migration `gd5_kpi_okr_scoring` (15 bảng + CHECK/trigger, không drift). Seed DEMO: quy tắc RS-CANHAN (chờ xác nhận), danh mục 48 SP/CV, bộ tiêu chí CS-LD/CS-CV (tiêu chí chung nguyên văn PL03), 17 mục tiêu OKR, 2 hồ sơ mẫu (ví dụ [HD05] = 83,6 điểm).
- Web: Hồ sơ đánh giá (danh sách, chi tiết, phiếu chấm theo phương pháp, tính thử, giải thích, ảnh chụp, lịch sử, trả lại/phê duyệt/mở lại), OKR, Kỳ đánh giá, Bộ tiêu chí (xem cây + soạn thảo), Quy tắc tính điểm (trình bày dạng bảng + căn cứ, sửa JSON khi nháp), Danh mục SP/CV.
- Kiểm thử: API 212 test (87 unit engine/workflow + tích hợp, trong đó 3 file mới GĐ5), web 7, shared 4.

**Còn tồn tại / chuyển giai đoạn sau**

- Quản lý nhiệm vụ, minh chứng (upload), import Excel (cán bộ, danh mục) → GĐ6; hiện dữ liệu nhiệm vụ nhập trong phiếu chấm.
- Chuỗi duyệt nhiều bước, bước thẩm định hồ sơ của cán bộ tổng hợp, quyết định cấp ngoài, kiểm tra hạn mức HTXS, tổng hợp năm trên giao diện → GĐ6.
- Chưa ràng buộc trạng thái kỳ khi nộp (chỉ chặn kỳ đã đóng).
- Các giá trị nghiệp vụ "tạm" và sai số trong ví dụ [HD05] chờ cơ quan xác nhận: docs/09 #1–2, #19–27.
- Cảnh báo `DeprecationWarning` của thư viện `pg` khi chạy test (phát sinh bên trong `@prisma/adapter-pg`, không ảnh hưởng kết quả).
- Giao diện mới chưa có kiểm thử E2E (Playwright — GĐ7).

## GĐ6 — kết quả (10/2026)

**Đã làm**

- Workflow: gửi duyệt (nộp) → thẩm định → trả lại → phê duyệt → mở lại, kiểm tra ở backend cả quyền, phạm vi, trạng thái hồ sơ **và trạng thái kỳ** (`periodAllows`, docs/06 §5.4); lịch sử từng bước + nhật ký kiểm toán. Seed đưa kỳ DEMO Quý II/2026 sang "Tự đánh giá".
- Dashboard (`/dashboard/summary`): truy vấn DB thật, lọc theo kỳ/đơn vị/cá nhân/trạng thái và phạm vi `dashboard.read`; tiến độ đánh giá, điểm bình quân 3 lớp, phân bố xếp loại (chỉ hồ sơ đã duyệt), theo đơn vị, cán bộ chưa có hồ sơ, hồ sơ chờ tôi xử lý, tiến độ OKR (theo dõi).
- Báo cáo cá nhân (năm, kèm tổng hợp năm theo quy tắc + OKR), đơn vị, toàn cơ quan, tổng hợp kỳ (năm ← quý, 6 tháng ← quý, quý ← tháng) theo `annualAggregation`.
- Xuất Excel (ExcelJS: tiêu đề, bộ lọc, thời gian/người xuất, phạm vi, bảng đóng khung + lọc + cố định tiêu đề, định dạng số, phần tổng hợp, sheet "Tổng hợp", chống chèn công thức) và PDF (pdfmake, font Roboto tiếng Việt, số trang). Xem, in và xuất dùng chung một mô hình `ReportDocument` → nội dung khớp nhau; mọi lần xuất ghi audit.
- Dự thảo văn bản theo mẫu tạm (`BC-KQDG`, `PHIEU-KQDG`): xem trước, PDF có chữ chìm "DỰ THẢO", liệt kê trường còn thiếu, cảnh báo số liệu chưa duyệt.
- Web: Dashboard ở Trang chủ, trang Báo cáo (4 loại, nút In/Xuất Excel/Xuất PDF tải file thật), trang Dự thảo văn bản; ẩn khung giao diện khi in.
- Kiểm thử: API 235 test (thêm `reports.test.ts` 19 test: dashboard, báo cáo, phạm vi, **đọc lại file Excel xuất ra để so khớp dữ liệu được phép**, PDF thật, dự thảo, ràng buộc kỳ; unit test `periodAllows`), web 9 (thêm test tải file), shared 4.

**Còn tồn tại**

- Mẫu văn bản là mẫu tạm; chưa lưu văn bản đã sinh (`generated_documents`) và chưa có luồng duyệt dự thảo (`draft.approve`).
- Chưa có chuỗi duyệt nhiều bước cấu hình được, bước thẩm định hồ sơ của cán bộ tổng hợp, kiểm tra hạn mức HTXS.
- `npm audit`: `uuid` (phụ thuộc của exceljs, mức trung bình — chỉ ảnh hưởng khi truyền `buf`, hệ thống không dùng), `mysql2`, `deepmerge-ts` (phụ thuộc của prisma, có từ trước).
- Bộ lọc đơn vị trên giao diện liệt kê mọi đơn vị; chọn đơn vị ngoài phạm vi sẽ nhận thông báo "Không tìm thấy" từ máy chủ.
- Giao diện chưa có kiểm thử E2E (Playwright — GĐ7).

## QA đợt 1 (11/10/2026) — chi tiết: docs/12-qa-bao-cao.md

- Cài sạch (`npm ci`), migration trên database mới không sai lệch, lint/TypeScript/build đạt, 268 test tự động đạt.
- Kiểm thử HTTP 57 phép trên bản build production; diễn tập sao lưu/phục hồi đạt.
- Đã sửa 8 lỗi (4 Trung bình: lỗi 500 khi gửi đồng thời ×3, thiếu giới hạn xuất file; 4 Thấp) — có test hồi quy.
- Thêm 13 bộ dữ liệu kiểm tra công thức tính tay; script `db:backup`/`db:restore`; hướng dẫn demo từng bước.
- Còn lại: giao nhiệm vụ, minh chứng, E2E trình duyệt, chuỗi băm audit, quét bảo mật bằng công cụ, kiểm thử tải.

## Tài liệu và dữ liệu DEMO (12/10/2026)

- Tài liệu báo cáo trong `bao-cao/` (không commit — có mật khẩu DEMO): báo cáo tổng thể (65 trang, chương 8 xác định đề xuất cấp độ 3), hướng dẫn vận hành và phân tích (84 trang) — đã gồm chức năng hồ sơ cá nhân, bản Word + PDF.
- Seed tạo tài khoản cho **mọi cán bộ DEMO**: 39 tài khoản (1 quản trị + 38 cán bộ); danh sách trong README. Phạm vi Phó Trưởng ban thường trực là giả định DEMO (docs/09 #32).
- Sửa nhãn trạng thái hiển thị nhầm giữa hồ sơ đánh giá / bộ tiêu chí / bộ quy tắc (`StatusBadge` nhận `kind`).
- Kiểm tra: typecheck, lint đạt; 268 test tự động đạt.

## Hồ sơ cá nhân và vòng đời tài khoản (12/10/2026)

- Thiết kế: docs/03 (cột `employees.gender`), docs/04 (`GET/PATCH /profile`), docs/05 (bảng phân quyền sửa thông tin cá nhân, nghỉ việc → vô hiệu hóa tài khoản), docs/09 #33.
- Migration `20261012132219_employee_gender` (chỉ thêm enum + cột cho phép NULL), đã áp vào `web_kpi_dev` và `web_kpi_test`.
- API: module `profile` — cán bộ xem hồ sơ của mình, tự sửa số điện thoại/email (kiểm tra phiên bản, email trùng, ghi audit `employee.self_update` trong cùng giao dịch). Chặn kích hoạt lại tài khoản gắn hồ sơ không còn công tác.
- Web: trang "Tài khoản của tôi" hiển thị thông tin cá nhân, công tác, tài khoản, vai trò; hộp thoại sửa thông tin liên hệ. Form hồ sơ cán bộ có trường giới tính.
- Kiểm tra: typecheck, lint, build đạt; 275 test tự động đạt (thêm 7 test `profile.test.ts`).

## Video demo vận hành và sửa lỗi giao diện (13/10/2026)

- Quay video demo trên CSDL demo riêng (bản sao từ `web_kpi_demo_base`), không đụng `web_kpi_dev`.
- Sửa 3 lỗi phát hiện khi quay demo (`apps/web/src/features/kpi`):
  - Chọn sản phẩm trong danh mục tự điền tên nhiệm vụ dài hơn 500 ký tự → lưu phiếu bị từ chối. Nay rút gọn tên theo từ (`catalog-label.ts`, có test).
  - Lần "Lưu và tính thử" đầu tiên của người thẩm định làm mất bảng kết quả tính thử (phiếu bị dựng lại khi hồ sơ chuyển "Đã nộp" → "Đang thẩm định").
  - Hộp thoại phê duyệt hiện điểm "99.6" và mã mức "HTTNV" → nay "99,6" và "Hoàn thành tốt nhiệm vụ (HTTNV)".
- Kiểm tra: typecheck, lint, build đạt; 277 test tự động đạt (thêm 2 test web). Lỗi chập chờn "no tests" ở gói shared vẫn thỉnh thoảng xuất hiện khi chạy lần đầu, chạy lại thì đạt — chưa xác định nguyên nhân.

## Đánh giá theo cấp quản lý, kỳ tháng, giao nhiệm vụ (14/10/2026)

Theo yêu cầu người dùng; thiết kế: docs/05 "Đánh giá theo cấp quản lý", docs/06 §5.4 và §5.6, docs/04, docs/09 #3 và #34 (**tạm**, chờ cơ quan xác nhận).

- **Cấp trên đánh giá cấp dưới:** tạo hồ sơ, giao nhiệm vụ, thẩm định, trả lại, phê duyệt, mở lại chỉ khi người thực hiện có chức vụ cao hơn (`positions.level`) và đối tượng trong phạm vi. Người cùng cấp không đánh giá nhau. Lãnh đạo (`evaluation.review`) tạo được hồ sơ cho cấp dưới và chính mình; Cán bộ tổng hợp giữ nguyên quyền tạo hồ sơ cho mọi cán bộ trong phạm vi.
- **Giao nhiệm vụ:** `PUT /evaluations/:id/tasks` (`task.assign`), thẻ "Giao nhiệm vụ cho cán bộ" trên hồ sơ chưa nộp. Dòng được giao có cờ `assigned`; cán bộ không sửa/xóa được tên, hệ số, SL kế hoạch (server giữ nguyên khi lưu tự đánh giá).
- **Kỳ tháng:** hộp "Tạo hồ sơ cho kỳ" và bộ lọc danh sách có chọn năm, kỳ tháng/quý kèm khoảng ngày theo lịch, mặc định tháng hiện tại. Seed: bộ tiêu chí DEMO áp dụng cho Tháng + Quý. DB dev: tạo CS-LD v2, CS-CV v3 (sao chép nguyên bản đã duyệt, thêm loại kỳ Tháng) qua quy trình soạn → trình (tonghop) → phê duyệt (truongban).
- Bộ dữ liệu test: thêm cán bộ Phó Trưởng ban (cấp 2) gắn với tài khoản `ptbA`.
- Kiểm tra: typecheck, lint, build đạt; 287 test tự động đạt (thêm `evaluation-hierarchy.test.ts` 9 test, 1 test máy trạng thái).

## Giao việc hằng ngày (14/10/2026)

Theo yêu cầu người dùng (chọn phương án "sổ giao việc theo ngày"); thiết kế: docs/03, docs/04, docs/05, docs/06 §5.7, docs/09 #35.

- DB: bảng `daily_tasks` + 4 enum, migration `20261014161236_daily_tasks` (chỉ thêm bảng; CHECK nhất quán dữ liệu báo cáo/đánh giá). Đã áp dụng cho `web_kpi_dev` và `web_kpi_test`.
- API `/daily-tasks`: xem theo khoảng ngày (≤ 62 ngày), danh sách cán bộ được giao việc, giao một việc cho nhiều cán bộ, sửa/xóa khi chưa báo cáo, cán bộ báo cáo, cấp trên đánh giá (kết quả, chất lượng, tiến độ, nhận xét). Áp dụng nguyên tắc cấp trên; ghi nhật ký `daily_task.*`. Hàm `subordinateEmployeeWhere` chuyển sang `auth/scope.ts` dùng chung.
- Web: trang "Giao việc hằng ngày" (`/giao-viec`) xem theo tuần (Thứ Hai → Chủ nhật), nút giao việc ở từng ngày, lọc theo cán bộ, bảng tổng hợp tuần; hộp thoại giao việc, báo cáo, đánh giá, xóa.
- Kiểm tra: typecheck, lint, build đạt; 299 test tự động đạt (thêm `daily-tasks.test.ts` 9 test, `week.test.ts` 3 test). Kiểm tra giao diện trên DB dev bằng một việc thử, đã xóa sau khi kiểm tra (nhật ký kiểm toán vẫn giữ).

## Danh mục sản phẩm/công việc theo vị trí việc làm (15/10/2026)

Theo yêu cầu người dùng; thiết kế: docs/03, docs/04, docs/05, docs/07, docs/09 #36 (**tạm**).

- DB: bảng `job_position_work_items` (VTVL ↔ mã sản phẩm/công việc), migration `job_position_work_items` (chỉ thêm bảng). Quyền mới `catalog.assign` (Cán bộ tổng hợp).
- Seed `job-position-work-items.ts`: phân mặc định theo tiêu đề nhóm của file nguồn (A → lãnh đạo; B → dùng chung; C → chuyên môn; D → tất cả, trừ D.002/D.004 → dùng chung); chỉ phân cho VTVL chưa có mục. Đã áp dụng cho DB dev (208 dòng; Lãnh đạo Ban, lãnh đạo phòng: 8 mục; chuyên viên chuyên môn: 16; VTVL dùng chung: 28) và bổ sung quyền `catalog.assign`.
- API: danh sách mục mặc định lọc theo VTVL của người dùng; `employeeId` lọc theo VTVL của cán bộ được đánh giá (trong phạm vi); `scope=all` cần `catalog.assign` (hoặc `catalog.approve` khi phiên bản chờ duyệt); `GET /work-catalogs/my-job-position`, `GET/PUT /work-catalogs/job-positions...`.
- Web: trang "Danh mục SP/CV" có các thẻ "Danh mục của tôi", "Toàn bộ danh mục", "Phân theo vị trí việc làm"; phiếu chấm và thẻ giao nhiệm vụ chỉ hiện mục theo VTVL của cán bộ được đánh giá (dòng cũ có mã ngoài danh mục vẫn hiển thị kèm ghi chú).
- Kiểm tra: typecheck, lint, build đạt; 305 test tự động đạt (thêm `work-catalog-job-positions.test.ts` 6 test; sửa 1 test danh mục cũ cho phù hợp quy tắc mới).
