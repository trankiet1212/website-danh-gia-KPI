# Đặc tả API

> Tài liệu thiết kế chuẩn (GĐ1–2, đã duyệt). Mọi thay đổi kiến trúc phải cập nhật tài liệu trước khi sửa code — xem CLAUDE.md.

## 6.1 Quy ước chung

- **Xác thực:** cookie `sid`. Mọi request thay đổi dữ liệu phải có `X-CSRF-Token` (lấy từ `GET /auth/csrf`).
- **Thành công:** `{ "data": ..., "meta"?: {page, pageSize, total} }`.
- **Lỗi:** `{ "error": { "code", "message" (tiếng Việt), "details"?, "requestId" } }`. Các mã:

| Code                                      | HTTP      | Ý nghĩa                                                                                                             |
| ----------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------- |
| `VALIDATION_ERROR`                        | 400       | dữ liệu không hợp lệ (details = lỗi từng trường)                                                                    |
| `UNAUTHENTICATED`                         | 401       | chưa đăng nhập / phiên hết hạn                                                                                      |
| `CSRF_INVALID`                            | 403       | thiếu/sai CSRF                                                                                                      |
| `FORBIDDEN`                               | 403       | không có quyền / ngoài phạm vi (không tiết lộ đối tượng có tồn tại hay không với tài nguyên ngoài phạm vi: trả 404) |
| `NOT_FOUND`                               | 404       |                                                                                                                     |
| `CONFLICT_VERSION`                        | 409       | `version` cũ — người khác đã cập nhật                                                                               |
| `INVALID_TRANSITION`                      | 409       | chuyển trạng thái không hợp lệ                                                                                      |
| `BUSINESS_RULE`                           | 422       | vi phạm quy tắc nghiệp vụ (tổng trọng số ≠ 70, kỳ đã đóng, quy tắc chưa CONFIRMED…)                                 |
| `PAYLOAD_TOO_LARGE` / `UNSUPPORTED_MEDIA` | 413 / 415 | upload                                                                                                              |
| `RATE_LIMITED`                            | 429       |                                                                                                                     |
| `INTERNAL`                                | 500       | không lộ stack trace                                                                                                |

- **Danh sách:** `page` (≥1), `pageSize` (≤100, mặc định 20), `sort=field:asc|desc` (whitelist theo resource), `q` (tìm theo tên/mã), bộ lọc riêng từng resource.
- **Cập nhật:** `PATCH` kèm `version` trong body, sai thì trả 409.
- **Thao tác nghiệp vụ:** `POST /resource/:id/<action>`.
- **Ghi log:** mọi `POST/PATCH/DELETE` thành công hoặc bị từ chối đều được ghi `audit_logs`.

## 6.2 Endpoint theo module

Cột "Quyền" là mã ở §4. "Phạm vi" nghĩa là kết quả bị lọc theo scope.

**Auth / session**

| Method     | Path                                   | Mục đích                                                                         | Quyền                                                       | Validation / lỗi                                                                         |
| ---------- | -------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| GET        | `/auth/csrf`                           | lấy CSRF token                                                                   | công khai                                                   |                                                                                          |
| POST       | `/auth/login`                          | đăng nhập `{username,password}`                                                  | công khai, rate limit 5/phút/IP+user                        | sai → 401 chung chung; khóa tạm sau N lần (cấu hình)                                     |
| POST       | `/auth/logout`                         | thu hồi phiên                                                                    | đã đăng nhập                                                |                                                                                          |
| GET        | `/auth/me`                             | user + vai trò + quyền + phạm vi                                                 | đã đăng nhập                                                |                                                                                          |
| POST       | `/auth/change-password`                | `{currentPassword,newPassword}`                                                  | đã đăng nhập                                                | chính sách độ mạnh; thu hồi các phiên khác                                               |
| GET/DELETE | `/auth/sessions`, `/auth/sessions/:id` | xem/thu hồi phiên của mình                                                       | đã đăng nhập                                                |                                                                                          |
| GET        | `/profile`                             | hồ sơ cá nhân của chính mình (thông tin cá nhân, phân công hiện hành, tài khoản) | đã đăng nhập; tài khoản không gắn cán bộ → `employee: null` |                                                                                          |
| PATCH      | `/profile`                             | `{phone?, email?, version}` — tự cập nhật thông tin liên hệ                      | đã đăng nhập, gắn hồ sơ cán bộ **đang công tác**            | chỉ 2 trường này; email trùng → 409; sai version → 409; ghi audit `employee.self_update` |

**Users / roles / permissions**

| Method            | Path                                                      | Quyền                                          |
| ----------------- | --------------------------------------------------------- | ---------------------------------------------- |
| GET, POST         | `/users`                                                  | `user.manage` (tạo: mật khẩu tạm + bắt đổi)    |
| GET, PATCH        | `/users/:id`                                              | `user.manage`                                  |
| POST              | `/users/:id/{lock,unlock,reset-password,revoke-sessions}` | `user.manage`                                  |
| GET               | `/roles`, `/permissions`                                  | `role.manage`                                  |
| POST, PATCH       | `/roles`, `/roles/:id`, `/roles/:id/permissions`          | `role.manage`; vai trò hệ thống không xóa được |
| GET, POST, DELETE | `/users/:id/roles` (kèm scope_type, units)                | `role.manage`; ghi audit "thay đổi quyền"      |

**Tổ chức và nhân sự**

| Method            | Path                                                                            | Quyền / ghi chú                                                  |
| ----------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| GET               | `/org-units?tree=true`                                                          | `org.read`                                                       |
| POST, PATCH       | `/org-units`, `/org-units/:id`                                                  | `org.manage`; không lưu trữ khi còn nhân sự đang công tác        |
| GET, POST, PATCH  | `/positions`, `/job-positions` (+`/:id`)                                        | đọc: `org.read`; ghi: `org.manage`                               |
| GET               | `/employees?unitId&positionId&jobPositionId&status&q`                           | `employee.read` + phạm vi                                        |
| POST              | `/employees`                                                                    | `employee.write`; trùng mã → 409                                 |
| GET, PATCH        | `/employees/:id`                                                                | đọc theo phạm vi; ghi `employee.write` + version                 |
| POST              | `/employees/:id/archive`                                                        | `employee.write`; lý do bắt buộc                                 |
| GET, POST         | `/employees/:id/assignments`                                                    | điều chuyển: tự đóng phân công cũ (`end_date`) trong transaction |
| POST              | `/imports/employees` (multipart xlsx) → `import_jobs` VALIDATED + lỗi từng dòng | `employee.import`                                                |
| GET               | `/imports/:id`                                                                  | xem trước                                                        |
| POST              | `/imports/:id/commit`                                                           | ghi trong 1 transaction; lỗi → rollback toàn bộ                  |
| GET               | `/imports/templates/employees.xlsx`                                             | file mẫu                                                         |
| GET, POST, DELETE | `/unit-supervisions`                                                            | `org.manage`                                                     |

**Kỳ đánh giá**

| Method | Path                                | Quyền / ghi chú                                                                  |
| ------ | ----------------------------------- | -------------------------------------------------------------------------------- |
| GET    | `/periods?type&year&status`         | đã đăng nhập                                                                     |
| POST   | `/periods`                          | `period.manage`; sinh kỳ con tùy chọn (năm → quý → tháng)                        |
| PATCH  | `/periods/:id`                      |                                                                                  |
| POST   | `/periods/:id/transition {to}`      | `period.manage`; mở kỳ yêu cầu có rule_set CONFIRMED (hoặc cờ "chạy thử" ghi rõ) |
| POST   | `/periods/:id/generate-evaluations` | tạo hồ sơ DRAFT cho đối tượng thuộc diện                                         |

**Quy tắc tính điểm, danh mục, bộ tiêu chí**

| Method           | Path                                                                            | Quyền / ghi chú                                              |
| ---------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| GET, POST        | `/rule-sets`, `/rule-sets/:id/versions`                                         | `ruleset.write`; config validate bằng `rule-config.schema`   |
| PATCH            | `/rule-set-versions/:id`                                                        | chỉ khi DRAFT                                                |
| POST             | `/rule-set-versions/:id/{submit,confirm,retire}`                                | confirm: `ruleset.confirm`, bắt buộc `legal_basis` + ghi chú |
| GET, POST        | `/catalogs`, `/catalogs/:id/versions`                                           | `catalog.write`                                              |
| GET, POST, PATCH | `/catalog-versions/:id/items`                                                   | hệ số tự tính = điểm / điểm chuẩn                            |
| POST             | `/catalog-versions/:id/import` (xlsx), `/catalog-versions/:id/{submit,approve}` | approve: `catalog.approve`                                   |
| GET, POST        | `/criteria-sets`, `/criteria-sets/:id/versions`                                 | `criteria.write`                                             |
| GET, PUT         | `/criteria-versions/:id/items` (thay toàn bộ cây trong 1 transaction)           | kiểm tra tổng 30/70 → 422                                    |
| POST             | `/criteria-versions/:id/{validate,submit,approve,retire}`                       | approve: `criteria.approve`                                  |
| GET              | `/criteria-versions/:id/diff/:otherId`                                          | so sánh phiên bản                                            |

**KPI/OKR**

| Method                 | Path                                     | Quyền                         |
| ---------------------- | ---------------------------------------- | ----------------------------- |
| GET, POST              | `/objectives?periodId&ownerKind&ownerId` | `objective.write` + phạm vi   |
| PATCH, DELETE(archive) | `/objectives/:id`                        |                               |
| GET, POST              | `/objectives/:id/key-results`            |                               |
| PATCH                  | `/key-results/:id`                       |                               |
| POST                   | `/key-results/:id/checkins`              | chủ sở hữu KR hoặc LĐ phạm vi |

**Nhiệm vụ và minh chứng**

| Method     | Path                                                                                                                       | Quyền / ghi chú                                                                           |
| ---------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| GET        | `/tasks?periodId&unitId&assigneeId&status&overdue&dueWithinDays&q`                                                         | phạm vi                                                                                   |
| POST       | `/tasks`                                                                                                                   | `task.assign`; bắt buộc đúng 1 MAIN; catalog_item phải thuộc phiên bản đã APPROVED của kỳ |
| GET, PATCH | `/tasks/:id`                                                                                                               | version                                                                                   |
| POST       | `/tasks/:id/{start,complete,request-rework,cancel}`                                                                        | complete: người MAIN; rework: người giao (tạo REWORK event)                               |
| GET, POST  | `/tasks/:id/updates`                                                                                                       | `task.update`                                                                             |
| GET, POST  | `/tasks/:id/quality-events`                                                                                                | `task.quality.record`                                                                     |
| POST       | `/quality-events/:id/exempt`                                                                                               | `task.quality.exempt`, lý do bắt buộc                                                     |
| POST       | `/tasks/:id/evidence` (multipart, ≤ N MB, whitelist PDF/DOCX/XLSX/PNG/JPG, kiểm tra magic bytes, `classificationAck=true`) | `evidence.upload`                                                                         |
| GET        | `/evidence/:id/download`                                                                                                   | `evidence.read` + phạm vi; `Content-Disposition: attachment`; ghi audit                   |
| DELETE     | `/evidence/:id`                                                                                                            | soft delete, chỉ khi hồ sơ chưa nộp                                                       |

**Đánh giá và tính điểm**

| Method | Path                                                                                                 | Quyền / ghi chú                                                                                              |
| ------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| GET    | `/evaluations?periodId&unitId&status&subjectKind&q`                                                  | phạm vi                                                                                                      |
| GET    | `/evaluations/:id`                                                                                   | gồm items, tasks tổng hợp, flags, lịch sử                                                                    |
| PATCH  | `/evaluations/:id/self` (điểm tiêu chí chung, D tự chấm, ghi chú, bảng nổi trội, mức tự đề xuất)     | `evaluation.self`; chỉ ở DRAFT                                                                               |
| PATCH  | `/evaluations/:id/review` (điểm cấp trên, nhận xét, mức đề xuất, rating_flags)                       | `evaluation.review`; chỉ ở UNDER_REVIEW và đúng bước                                                         |
| POST   | `/evaluations/:id/calculate?mode=self                                                                | reviewer`                                                                                                    | tính thử, trả `outputs` + `explanation` + `warnings`, lưu TRIAL |
| POST   | `/evaluations/:id/{submit,start-review,forward,return,verify,approve,record-external,reopen,cancel}` | quyền theo §4 + bước; `return`/`reopen`/`cancel` bắt buộc `reason`; `approve` nhận `finalRating` + `comment` |
| GET    | `/evaluations/:id/history`                                                                           |                                                                                                              |
| GET    | `/evaluations/:id/calculations/:calcId`                                                              | xem snapshot                                                                                                 |
| POST   | `/periods/:id/rating-quota-check?unitId`                                                             | kiểm tra hạn mức HTXS theo rule_set (cảnh báo, không tự sửa)                                                 |

**Dashboard, báo cáo, xuất**

| Method | Path                                                                                       | Ghi chú                                                                                                                                                                                                                          |
| ------ | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/dashboard/summary?periodId&unitId&employeeId&status`                                     | Số CBCC, số phòng, nhiệm vụ theo trạng thái/quá hạn, tỷ lệ hoàn thành, tiến độ đánh giá, KPI trung bình, phân bố mức xếp loại (chỉ hồ sơ APPROVED), sắp đến hạn, chờ duyệt, cảnh báo thiếu dữ liệu — **tất cả lọc theo phạm vi** |
| GET    | `/dashboard/trends?from&to&groupBy=period                                                  | unit`                                                                                                                                                                                                                            | so sánh kỳ, phòng                                                          |
| GET    | `/reports/{personal,unit,agency,task-progress,kpi-okr,pending,evaluation-history}?filters` | xem trước (JSON)                                                                                                                                                                                                                 |
| POST   | `/exports` `{report, filters, format: xlsx                                                 | pdf}`                                                                                                                                                                                                                            | `report.export` + phạm vi; trả file stream; ghi audit (ai xuất gì, bộ lọc) |

**Mẫu văn bản và dự thảo**

| Method           | Path                                       | Quyền                                                                               |
| ---------------- | ------------------------------------------ | ----------------------------------------------------------------------------------- |
| GET, POST, PATCH | `/templates` (upload .docx + field_schema) | `template.manage`                                                                   |
| POST             | `/drafts` `{templateId, periodId, unitId}` | `draft.create`: lấy dữ liệu **chỉ từ hồ sơ APPROVED**, trả `missing_fields`         |
| GET              | `/drafts/:id/preview`                      |                                                                                     |
| POST             | `/drafts/:id/{review,approve,cancel}`      | approve: `draft.approve` → `APPROVED_FOR_SIGNING` (vẫn không phải văn bản ban hành) |
| GET              | `/drafts/:id/download?format=docx          | pdf`                                                                                |     |

**Hệ thống**

| Method     | Path                                                                   | Quyền                                                                   |
| ---------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| GET        | `/audit-logs?actorId&entityType&entityId&action&from&to`               | `audit.read`                                                            |
| GET        | `/audit-logs/verify-chain`                                             | kiểm tra toàn vẹn chuỗi băm                                             |
| GET, POST  | `/notifications`, `/notifications/:id/read`, `/notifications/read-all` |                                                                         |
| GET, PATCH | `/settings`                                                            | `setting.manage` (giới hạn upload, timeout phiên, chính sách mật khẩu…) |
| GET        | `/health`                                                              | công khai: trạng thái app + DB (không lộ chi tiết)                      |

Đặc tả đầy đủ payload/response từng endpoint sẽ có trong `docs/04-api.md`, sinh từ zod schema của `packages/shared`.

## Trạng thái triển khai (GĐ4) và điều chỉnh so với thiết kế

**Mã lỗi bổ sung:** `ACCOUNT_LOCKED` (423 — tài khoản bị khóa/tạm khóa), `PASSWORD_CHANGE_REQUIRED` (403 — mật khẩu tạm, phải đổi trước), `DUPLICATE` (409 — trùng mã/tên đăng nhập/email; `details.fields`).

**Quy tắc chung đã áp dụng:**

- Mọi đường dẫn trong `/api/v1` (trừ `/health`, `/auth/login`) yêu cầu đăng nhập — kể cả đường dẫn không tồn tại (trả 401 thay vì 404 khi chưa đăng nhập, tránh dò endpoint).
- Request thay đổi dữ liệu phải có `X-CSRF-Token` (lấy từ phản hồi `/auth/login`, `/auth/me` hoặc `/auth/csrf`) và Origin hợp lệ (nếu trình duyệt gửi Origin).

**Endpoint đã triển khai:**

| Nhóm          | Endpoint                                                                                                                                                                                                        |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Xác thực      | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `GET /auth/csrf`, `POST /auth/change-password`, `GET /auth/sessions`, `DELETE /auth/sessions/:id`, `GET/PATCH /profile`                                |
| Tài khoản     | `GET/POST /users`, `GET /users/employee-options?q`, `GET/PATCH /users/:id`, `POST /users/:id/{lock,disable,unlock,reset-password,revoke-sessions}`, `POST /users/:id/roles`, `DELETE /users/:id/roles/:grantId` |
| Vai trò       | `GET/POST /roles`, `PUT/DELETE /roles/:id`, `GET /permissions`                                                                                                                                                  |
| Đơn vị        | `GET/POST /org-units`, `GET/PATCH /org-units/:id`, `POST /org-units/:id/{archive,restore}`                                                                                                                      |
| Chức vụ, VTVL | `GET/POST /positions`, `PATCH /positions/:id`, `POST /positions/:id/{archive,restore}`; tương tự `/job-positions`                                                                                               |
| Hồ sơ cán bộ  | `GET/POST /employees`, `GET/PATCH /employees/:id`, `POST /employees/:id/transfer`, `POST /employees/:id/end-employment`                                                                                         |

**Điều chỉnh tên so với bản thiết kế §6.2:** điều chuyển dùng `POST /employees/:id/transfer` (thay cho `POST /employees/:id/assignments`); lưu trữ hồ sơ dùng `POST /employees/:id/end-employment` với `status` = `TRANSFERRED | RETIRED | ARCHIVED` (thay cho `/archive`); khóa tài khoản tách thành `lock` (khóa) và `disable` (ngừng sử dụng). Import Excel (`/imports/employees`) chuyển sang GĐ5.

## Trạng thái triển khai (GĐ5)

| Nhóm           | Endpoint                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Quyền                                                                                                                                                                                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kỳ đánh giá    | `GET /periods?year&type`, `POST /periods/generate-year`, `PATCH /periods/:id`, `POST /periods/:id/transition`                                                                                                                                                                                                                                                                                                                                                                                          | đọc: đăng nhập; ghi: `period.manage`                                                                                                                                                                                                                                            |
| Bộ quy tắc     | `GET/POST /rule-sets`, `POST /rule-sets/:id/versions` (`cloneFromVersionId` — có thể lấy phiên bản của bộ khác làm mẫu), `GET/PUT /rule-set-versions/:id`, `POST /rule-set-versions/:id/{submit,confirm,return,retire}`                                                                                                                                                                                                                                                                                | `ruleset.read/write/confirm`                                                                                                                                                                                                                                                    |
| Danh mục SP/CV | `GET /work-catalogs/versions`, `GET /work-catalogs/versions/:id/items?q&groupCode`, `POST /work-catalogs/versions/:id/approve`                                                                                                                                                                                                                                                                                                                                                                         | `catalog.read/approve`                                                                                                                                                                                                                                                          |
| Bộ tiêu chí    | `GET/POST /criteria-sets`, `POST /criteria-sets/:id/versions`, `GET /criteria-versions/:id` (kèm `issues` kiểm tra), `PUT /criteria-versions/:id/items` (thay cả cây, `key/parentKey`), `POST /criteria-versions/:id/{submit,approve,return,retire}`                                                                                                                                                                                                                                                   | `criteria.read/write/approve`                                                                                                                                                                                                                                                   |
| OKR            | `GET/POST /objectives`, `GET/PATCH /objectives/:id`, `POST /objectives/:id/key-results`, `PATCH /key-results/:id`, `POST /key-results/:id/checkins`                                                                                                                                                                                                                                                                                                                                                    | `objective.read/write` + phạm vi                                                                                                                                                                                                                                                |
| Hồ sơ đánh giá | `GET /evaluations?periodId&unitId&status&q&page&pageSize`, `POST /evaluations`, `POST /evaluations/generate`, `GET /evaluations/:id`, `POST /evaluations/:id/calculate {layer}` (tính thử, không lưu), `PUT /evaluations/:id/self`, `POST /evaluations/:id/submit`, `PUT /evaluations/:id/review`, `POST /evaluations/:id/complete-review`, `POST /evaluations/:id/return {reason}`, `POST /evaluations/:id/approve {finalRating, overrideReason?, comment?}`, `POST /evaluations/:id/reopen {reason}` | đọc `evaluation.read`; tạo `period.manage`+`evaluation.read`; tự đánh giá `evaluation.self` (chỉ chính đối tượng); thẩm định/trả lại `evaluation.review`; duyệt `evaluation.approve`; mở lại `evaluation.reopen` — tất cả kèm phạm vi, không thao tác trên hồ sơ của chính mình |

Mọi thao tác ghi đều kiểm tra `version` (409 khi cũ), ghi `audit_logs` trong cùng transaction. Chi tiết hồ sơ trả `can{...}` (giao diện ẩn/hiện nút) và `approvalBlockers` (lý do chưa thể phê duyệt). Lỗi thiếu dữ liệu khi nộp/hoàn tất: `422 BUSINESS_RULE` với `details.missing`, `details.errors`.

Thay đổi so với §6.2: dùng `PUT .../self`, `PUT .../review` (thay cho PATCH); chưa có `start-review/forward/verify/record-external/cancel`, `GET /evaluations/:id/history` (lịch sử nằm trong chi tiết hồ sơ), `/criteria-versions/:id/diff`, import danh mục từ Excel, `/rating-quota-check`.

## Thiết kế triển khai GĐ6 — Dashboard, báo cáo, xuất dữ liệu, dự thảo

Nguyên tắc phân quyền dữ liệu: mọi số liệu lấy từ PostgreSQL qua repository, lọc bằng phạm vi của **chính quyền đang dùng**
(`dashboard.read` cho dashboard, `report.read` cho xem/in, `report.export` cho xuất file, `draft.create` cho dự thảo).
Đơn vị/cá nhân ngoài phạm vi → 404. Mọi lần xuất file và tạo dự thảo ghi `audit_logs` (loại báo cáo, bộ lọc, số dòng).

| Method | Path                                                                    | Quyền            | Mô tả                                                                                                                                                                                                                                                    |
| ------ | ----------------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/dashboard/summary?periodId&unitId&employeeId&status`                  | `dashboard.read` | Số cán bộ/đơn vị/hồ sơ trong phạm vi; hồ sơ theo trạng thái; tiến độ đánh giá; điểm trung bình 3 lớp; phân bố xếp loại (**chỉ hồ sơ đã phê duyệt**); số liệu theo đơn vị; cán bộ chưa có hồ sơ trong kỳ; hồ sơ chờ tôi xử lý; tiến độ OKR (chỉ theo dõi) |
| GET    | `/reports/individual?employeeId&year`                                   | `report.read`    | Kết quả các kỳ trong năm của một cán bộ + tổng hợp năm theo `annualAggregation` của bộ quy tắc                                                                                                                                                           |
| GET    | `/reports/unit?periodId&unitId`                                         | `report.read`    | Danh sách hồ sơ của đơn vị trong kỳ + phần tổng hợp                                                                                                                                                                                                      |
| GET    | `/reports/agency?periodId`                                              | `report.read`    | Tổng hợp theo từng đơn vị và toàn cơ quan (trong phạm vi)                                                                                                                                                                                                |
| GET    | `/reports/aggregate?periodId&unitId?`                                   | `report.read`    | Tổng hợp kỳ cha (năm/6 tháng/quý) từ các kỳ con (quý/tháng) theo chiến lược cấu hình; MANUAL_WITH_REFERENCE → không tự tính                                                                                                                              |
| GET    | `/reports/{individual,unit,agency,aggregate}/export?format=xlsx\|pdf&…` | `report.export`  | Tải file Excel (tiêu đề, bộ lọc, thời gian xuất, người xuất, phạm vi, bảng dữ liệu, sheet "Tổng hợp") hoặc PDF; chống chèn công thức Excel                                                                                                               |
| GET    | `/drafts/templates`                                                     | `draft.create`   | Danh sách mẫu dự thảo (mẫu TẠM, chưa có mẫu chính thức — docs/09 #16)                                                                                                                                                                                    |
| POST   | `/drafts/preview` `{templateCode, periodId, unitId?, evaluationId?}`    | `draft.create`   | Dựng nội dung dự thảo từ dữ liệu (chỉ số liệu hồ sơ ĐÃ PHÊ DUYỆT được tính là kết quả chính thức), trả `missingFields`; trạng thái luôn "DỰ THẢO"                                                                                                        |
| POST   | `/drafts/pdf` (cùng body)                                               | `draft.create`   | PDF dự thảo có chữ chìm "DỰ THẢO"                                                                                                                                                                                                                        |

Không lưu file xuất trên máy chủ (sinh theo yêu cầu, trả trực tiếp). Bảng `generated_documents`/duyệt dự thảo (`draft.approve`) để giai đoạn sau.
