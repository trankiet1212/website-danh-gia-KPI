# Ma trận phân quyền

> Tài liệu thiết kế chuẩn (GĐ1–2, đã duyệt). Mọi thay đổi kiến trúc phải cập nhật tài liệu trước khi sửa code — xem CLAUDE.md.

## 4.1 Vai trò và phạm vi mặc định (gán qua `user_roles`, một người có thể có nhiều vai trò)

| Mã            | Vai trò                              | Ánh xạ thực tế tại Ban                                                               | Phạm vi mặc định                                   |
| ------------- | ------------------------------------ | ------------------------------------------------------------------------------------ | -------------------------------------------------- |
| SUPER_ADMIN   | Quản trị hệ thống                    | Cán bộ CNTT được chỉ định                                                            | Cấu hình; **không có quyền đọc dữ liệu nghiệp vụ** |
| AGENCY_LEADER | Lãnh đạo cơ quan                     | Trưởng ban (ALL); PTB (UNITS = các phòng phụ trách theo `unit_supervisions`)         | ALL / UNITS                                        |
| UNIT_LEADER   | Lãnh đạo phòng                       | Trưởng phòng, Chánh VP (OWN_UNIT); Phó phòng, Phó CVP (MANAGED = cấp dưới trực tiếp) | OWN_UNIT / MANAGED                                 |
| EVAL_OFFICER  | Cán bộ phụ trách đánh giá / tổng hợp | Chuyên viên được giao tổng hợp ĐGXL (theo XLSX-SĐ: VP, Phòng TCĐ-ĐV)                 | ALL (chỉ đọc + thẩm định)                          |
| EMPLOYEE      | Cán bộ, công chức                    | Mọi CBCC                                                                             | SELF                                               |

## 4.2 Ma trận quyền (✔ = có; chữ = phạm vi; — = không)

| Nhóm              | Mã quyền                                                          | SUPER_ADMIN                           | AGENCY_LEADER    | UNIT_LEADER       | EVAL_OFFICER          | EMPLOYEE       |
| ----------------- | ----------------------------------------------------------------- | ------------------------------------- | ---------------- | ----------------- | --------------------- | -------------- |
| Tài khoản         | `user.manage`, `role.manage`                                      | ✔                                     | —                | —                 | —                     | —              |
| Cấu hình          | `setting.manage`, `template.manage`                               | ✔                                     | —                | —                 | —                     | —              |
| Tổ chức           | `org.read`                                                        | ✔                                     | ✔                | ✔                 | ✔                     | ✔              |
| Tổ chức           | `org.manage`                                                      | ✔                                     | —                | —                 | —                     | —              |
| Nhân sự           | `employee.read`                                                   | chỉ trường định danh để gán tài khoản | phạm vi          | phạm vi           | ALL                   | SELF           |
| Nhân sự           | `employee.write`, `employee.import`                               | —                                     | —                | —                 | ✔                     | —              |
| Danh mục SP/CV    | `catalog.read`                                                    | —                                     | ✔                | ✔                 | ✔                     | ✔              |
| Danh mục SP/CV    | `catalog.write`                                                   | —                                     | —                | đề xuất (DRAFT)   | ✔                     | —              |
| Danh mục SP/CV    | `catalog.approve`                                                 | —                                     | ✔                | —                 | —                     | —              |
| Bộ tiêu chí       | `criteria.write`                                                  | —                                     | —                | đề xuất cho phòng | ✔                     | —              |
| Bộ tiêu chí       | `criteria.approve`                                                | —                                     | ✔                | —                 | —                     | —              |
| Quy tắc tính điểm | `ruleset.write`                                                   | —                                     | —                | —                 | ✔ (nhập theo văn bản) | —              |
| Quy tắc tính điểm | `ruleset.confirm` (*)                                             | —                                     | ✔ (Trưởng ban)   | —                 | —                     | —              |
| Kỳ đánh giá       | `period.manage`                                                   | ✔ (tạo kỹ thuật)                      | ✔ (mở/đóng)      | —                 | ✔ (soạn lịch)         | —              |
| Mục tiêu/KR       | `objective.write`                                                 | —                                     | phạm vi          | phạm vi           | —                     | SELF (đề xuất) |
| Nhiệm vụ          | `task.assign`                                                     | —                                     | phạm vi          | phạm vi           | —                     | —              |
| Nhiệm vụ          | `task.update`                                                     | —                                     | —                | phạm vi           | —                     | việc của mình  |
| Nhiệm vụ          | `task.quality.record` (ghi làm lại/chậm)                          | —                                     | phạm vi          | phạm vi           | —                     | —              |
| Nhiệm vụ          | `task.quality.exempt` (*)                                         | —                                     | phạm vi          | —                 | —                     | —              |
| Minh chứng        | `evidence.upload`                                                 | —                                     | —                | phạm vi           | —                     | việc của mình  |
| Minh chứng        | `evidence.read`                                                   | —                                     | phạm vi          | phạm vi           | ALL                   | SELF           |
| Đánh giá          | `evaluation.self`                                                 | —                                     | SELF             | SELF              | SELF                  | SELF           |
| Đánh giá          | `evaluation.review` (chấm, nhận xét, trả lại)                     | —                                     | phạm vi (cho TP) | MANAGED/OWN_UNIT  | —                     | —              |
| Đánh giá          | `evaluation.verify` (thẩm định hồ sơ, không sửa điểm)             | —                                     | —                | —                 | ✔                     | —              |
| Đánh giá          | `evaluation.approve`, `evaluation.reopen` (*)                     | —                                     | phạm vi          | —                 | —                     | —              |
| Đánh giá          | `evaluation.record_external` (ghi quyết định cấp trên cho LĐ Ban) | —                                     | —                | —                 | ✔                     | —              |
| Báo cáo           | `dashboard.read`, `report.read`                                   | thống kê kỹ thuật                     | phạm vi          | phạm vi           | ALL                   | SELF           |
| Báo cáo           | `report.export`                                                   | —                                     | phạm vi          | phạm vi           | ALL                   | SELF           |
| Dự thảo           | `draft.create`                                                    | —                                     | —                | —                 | ✔                     | —              |
| Dự thảo           | `draft.approve`                                                   | —                                     | ✔                | —                 | —                     | —              |
| Kiểm toán         | `audit.read`                                                      | ✔                                     | —                | —                 | —                     | —              |
| Thông báo         | `notification.read`                                               | ✔                                     | ✔                | ✔                 | ✔                     | ✔              |

(*) Cần cơ quan xác nhận (§8).

**Nguyên tắc cứng (enforce ở backend, có test):**

1. Không ai tự phê duyệt hồ sơ của chính mình (người phê duyệt ≠ đối tượng; người chấm ≠ đối tượng).
2. CBCC không sửa được điểm sau khi đã nộp. Bản ghi APPROVED bị khóa, mọi thay đổi phải qua `reopen` có lý do.
3. SUPER_ADMIN không đọc được điểm hay minh chứng (tách bạch nhiệm vụ).
4. Bộ lọc phạm vi áp ở tầng repository cho **mọi** truy vấn, kể cả aggregate của dashboard và export.
5. Mọi lần bị từ chối quyền (403) đều được ghi `audit_logs` với `result=DENIED`.

## Ghi chú triển khai (GĐ4)

- Thêm phạm vi `NONE` (không có dữ liệu nghiệp vụ) — dùng cho Quản trị hệ thống.
- Phạm vi `MANAGED` gồm bản thân và cán bộ có cấp quản lý trực tiếp là mình (theo phân công chính đang hiệu lực).
- `OWN_UNIT`, `MANAGED`, `SELF` yêu cầu tài khoản gắn hồ sơ cán bộ; không gắn → không mở dữ liệu nào.
- Quyền mặc định của từng vai trò: `packages/shared/src/permissions.ts`; test đảm bảo chỉ Lãnh đạo cơ quan có `evaluation.approve`, `evaluation.reopen`, `ruleset.confirm` và Quản trị hệ thống không có quyền đọc dữ liệu nghiệp vụ.

## Thông tin cá nhân và vòng đời tài khoản (12/10/2026)

**Nguồn dữ liệu duy nhất:** thông tin cá nhân nằm ở hồ sơ cán bộ (`employees`); tài khoản (`users`) chỉ liên kết tới hồ sơ. Trang "Tài khoản của tôi" đọc trực tiếp từ hồ sơ nên mọi thay đổi (do cán bộ tự sửa hoặc do cán bộ tổng hợp sửa) hiển thị ngay, mỗi thay đổi đều ghi nhật ký kiểm toán.

| Nhóm thông tin                      | Trường                                                  | Cán bộ tự sửa (`PATCH /profile`) | Cán bộ tổng hợp (`employee.write`)       |
| ----------------------------------- | ------------------------------------------------------- | ------------------------------------- | ---------------------------------------- |
| Liên hệ                             | Số điện thoại, email                                    | ✔                                     | ✔                                        |
| Lý lịch                             | Họ tên, giới tính, ngày sinh                            | —                                     | ✔                                        |
| Chức vụ Đảng, chính quyền, đoàn thể | `party_position`, `gov_position`, `union_position`      | —                                     | ✔                                        |
| Công tác                            | Mã cán bộ, đơn vị, chức vụ, VTVL, cấp quản lý trực tiếp | —                                     | ✔ (qua điều chuyển, có lịch sử)          |
| Tài khoản                           | Tên đăng nhập, trạng thái, vai trò, phạm vi             | —                                     | — (chỉ Quản trị hệ thống, `user.manage`) |

**Nghỉ việc / chuyển công tác:** thao tác "Kết thúc công tác" (`POST /employees/:id/end-employment`) trong **một giao dịch**: đổi trạng thái hồ sơ, đóng phân công, **vô hiệu hóa tài khoản liên kết (`DISABLED`) và thu hồi mọi phiên đăng nhập**, ghi nhật ký. Tài khoản và hồ sơ **không bị xóa vật lý** (giữ lịch sử đánh giá, nhật ký). Không được mở khóa (`unlock`) hoặc tạo mới tài khoản gắn với hồ sơ không còn công tác.
