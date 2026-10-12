# Quy trình và sơ đồ trạng thái

> Tài liệu thiết kế chuẩn (GĐ1–2, đã duyệt). Mọi thay đổi kiến trúc phải cập nhật tài liệu trước khi sửa code — xem CLAUDE.md.

## 5.1 Hồ sơ đánh giá (`evaluation_records.status`)

```mermaid
stateDiagram-v2
  [*] --> DRAFT : tạo hồ sơ khi kỳ mở (tự động/ thủ công)
  DRAFT --> SUBMITTED : submit (đối tượng) — tính điểm tự chấm, snapshot SUBMIT
  SUBMITTED --> UNDER_REVIEW : startReview (bước duyệt kế tiếp)
  UNDER_REVIEW --> RETURNED : return (bắt buộc lý do)
  RETURNED --> DRAFT : reopenDraft (đối tượng sửa)
  UNDER_REVIEW --> UNDER_REVIEW : forward (sang bước kế tiếp trong flow)
  UNDER_REVIEW --> REVIEWED : review hoàn tất các bước chấm/thẩm định
  REVIEWED --> APPROVED : approve (người có thẩm quyền, chốt mức xếp loại) — snapshot APPROVAL, khóa
  REVIEWED --> RETURNED : return
  REVIEWED --> PENDING_EXTERNAL : chờ quyết định cấp ngoài (LĐ Ban diện BTVTU)
  PENDING_EXTERNAL --> APPROVED : recordExternalDecision (số/ngày văn bản)
  APPROVED --> REOPENED : reopen (quyền reopen + lý do) — tạo revision mới
  REOPENED --> UNDER_REVIEW
  DRAFT --> CANCELLED : cancel (đối tượng hết thuộc diện / tạo nhầm, có lý do)
  APPROVED --> [*]
```

**Bất biến:**

- Mỗi chuyển trạng thái chạy trong **một transaction** gồm: kiểm tra `version`, kiểm tra quyền/bước, cập nhật record, ghi `approval_history`, ghi `evaluation_calculations` (nếu có), ghi `audit_logs`, tạo `notifications`.
- Chuyển trạng thái không hợp lệ trả về `409 INVALID_TRANSITION`. Sai quyền trả về `403`.
- Chỉ được nộp khi kỳ ở trạng thái `SELF_ASSESSMENT`, hoặc `REVIEW` nếu hồ sơ bị trả lại.
- `APPROVED` → `REOPENED` sinh `revision_no + 1`. Bản đã duyệt cũ giữ nguyên để tra cứu.

## 5.2 Nhiệm vụ (`tasks.work_status`), tách khỏi phê duyệt

```mermaid
stateDiagram-v2
  [*] --> NOT_STARTED
  NOT_STARTED --> IN_PROGRESS
  IN_PROGRESS --> COMPLETED : báo cáo kết quả (SL hoàn thành, minh chứng)
  COMPLETED --> IN_PROGRESS : người giao yêu cầu làm lại → ghi task_quality_events(REWORK)
  NOT_STARTED --> CANCELLED
  IN_PROGRESS --> CANCELLED
```

"Quá hạn" và "Sắp đến hạn" là cờ suy ra từ `due_date` và trạng thái; không phải trạng thái lưu. Hoàn thành sau `due_date` sẽ tự tạo `LATE` event, người giao có quyền miễn trừ kèm lý do.

## 5.3 Phiên bản cấu hình

- `rule_set_versions`: DRAFT → PENDING_CONFIRMATION → CONFIRMED → RETIRED.
- `criteria_versions`, `work_catalog_versions`: DRAFT → SUBMITTED → APPROVED → RETIRED.
- Phiên bản đã CONFIRMED/APPROVED là **bất biến**; muốn sửa thì tạo phiên bản mới.
- Kỳ đánh giá **ghim** phiên bản tại thời điểm mở kỳ.

## 5.4 Kỳ đánh giá

PLANNING → OPEN → SELF_ASSESSMENT → REVIEW → CLOSED. Quý IV có `is_rated=false` (theo [QĐ39] Điều 14, [HD05] III.6): vẫn theo dõi kết quả nhưng không xếp loại riêng.

**Ràng buộc theo trạng thái kỳ (triển khai GĐ6):**

| Thao tác hồ sơ                                    | Kỳ phải ở trạng thái                                                              |
| ------------------------------------------------- | --------------------------------------------------------------------------------- |
| Tạo hồ sơ                                         | khác CLOSED (và kỳ có xếp loại)                                                   |
| Tự đánh giá, nộp                                  | OPEN, SELF_ASSESSMENT; hoặc REVIEW nếu hồ sơ đang bị trả lại                      |
| Thẩm định, hoàn tất thẩm định, trả lại, phê duyệt | OPEN, SELF_ASSESSMENT, REVIEW                                                     |
| Mở lại                                            | mọi trạng thái trừ PLANNING (mở lại sau khi đóng kỳ vẫn được — cần quyền + lý do) |

Kỳ PLANNING chỉ để chuẩn bị (tạo hồ sơ, chưa chấm). Vi phạm → `422 BUSINESS_RULE`.

## 5.5 Chuỗi phê duyệt seed (PENDING — cần xác nhận)

| Đối tượng                 | Bước 1           | Bước 2                                                    | Bước 3                                   | Quyết định                                   |
| ------------------------- | ---------------- | --------------------------------------------------------- | ---------------------------------------- | -------------------------------------------- |
| Chuyên viên/nhân viên     | Tự chấm          | DIRECT_MANAGER (Phó/Trưởng phòng) chấm, nhận xét, đề xuất | EVAL_OFFICER thẩm định hồ sơ             | SUPERVISING_LEADER (PTB phụ trách) phê duyệt |
| Phó phòng                 | Tự chấm          | UNIT_HEAD chấm                                            | EVAL_OFFICER thẩm định                   | SUPERVISING_LEADER                           |
| Trưởng phòng / Chánh VP   | Tự chấm          | SUPERVISING_LEADER chấm                                   | EVAL_OFFICER thẩm định                   | HEAD_OF_AGENCY                               |
| Lãnh đạo Ban (diện BTVTU) | Tự chấm          | Tập thể LĐ Ban (HEAD_OF_AGENCY ghi nhận)                  | EVAL_OFFICER lập hồ sơ, tờ trình dự thảo | EXTERNAL_AUTHORITY: ghi số/ngày văn bản      |
| Tập thể phòng             | Trưởng phòng lập | EVAL_OFFICER thẩm định                                    | —                                        | HEAD_OF_AGENCY                               |

## Trạng thái triển khai (GĐ5)

Máy trạng thái thực tế (`apps/api/src/workflow/evaluation-state.ts`, hàm thuần có unit test):

```mermaid
stateDiagram-v2
  [*] --> DRAFT : tạo hồ sơ (period.manage)
  DRAFT --> DRAFT : saveSelf
  DRAFT --> SUBMITTED : submit — đủ dữ liệu, ảnh chụp SELF
  RETURNED --> DRAFT : saveSelf (đối tượng sửa)
  RETURNED --> SUBMITTED : submit
  SUBMITTED --> UNDER_REVIEW : saveReview
  SUBMITTED --> REVIEWED : completeReview — ảnh chụp REVIEW
  UNDER_REVIEW --> REVIEWED : completeReview
  SUBMITTED --> RETURNED : return (lý do)
  UNDER_REVIEW --> RETURNED : return (lý do)
  REVIEWED --> RETURNED : return (lý do)
  REVIEWED --> APPROVED : approve — quy tắc CONFIRMED + bộ tiêu chí APPROVED + kỳ có xếp loại; ảnh chụp APPROVAL; khóa
  APPROVED --> REOPENED : reopen (evaluation.reopen + lý do) — revision + 1
  REOPENED --> UNDER_REVIEW : saveReview
  REOPENED --> REVIEWED : completeReview
```

- Khóa sau phê duyệt được bảo đảm 2 lớp: service trả `409 INVALID_TRANSITION` ("phải thực hiện quy trình mở lại"); trigger DB chặn mọi UPDATE hồ sơ APPROVED (trừ chuyển REOPENED + revision + 1) và mọi ghi `evaluation_items` của hồ sơ APPROVED.
- Không ai thẩm định/phê duyệt/mở lại hồ sơ của chính mình (403). Phê duyệt chọn mức khác mức đề xuất → bắt buộc lý do.
- **Điều chỉnh tạm so với §5.1:** chưa ràng buộc trạng thái kỳ khi nộp (chỉ chặn khi kỳ CLOSED); chưa có chuỗi duyệt nhiều bước (`forward`), bước chờ quyết định cấp ngoài, hủy hồ sơ, thông báo — để GĐ6 cùng approval_flows. Kỳ không xếp loại riêng (Quý IV) không tạo được hồ sơ.
- Bộ quy tắc: DRAFT → PENDING_CONFIRMATION → CONFIRMED → RETIRED; PENDING → DRAFT (trả lại). Bộ tiêu chí: DRAFT → SUBMITTED → APPROVED → RETIRED; SUBMITTED → DRAFT. Danh mục: SUBMITTED → APPROVED. Kỳ: chỉ chuyển sang trạng thái liền kề.
