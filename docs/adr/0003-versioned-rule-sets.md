# ADR-0003: Quy tắc tính điểm, xếp loại là cấu hình có phiên bản

- **Trạng thái:** Chấp nhận (GĐ2), triển khai ở GĐ5
- **Bối cảnh:** Ngưỡng xếp loại, mức trừ điểm, công thức KPI... do văn bản của cơ quan quy định và có thể thay đổi; nhiều điểm chưa có căn cứ (docs/09). Phần mềm không được tự đặt quy định.
- **Quyết định:** Mọi con số nghiệp vụ nằm trong `rule_set_versions.config` (JSON, kiểm tra bằng zod) kèm `legal_basis`, `source_refs`; trạng thái DRAFT → PENDING_CONFIRMATION → CONFIRMED → RETIRED. Chỉ bản CONFIRMED được dùng để chốt điểm; bản đã CONFIRMED bất biến; kỳ đánh giá ghim phiên bản khi mở. Giá trị không có trong văn bản gắn `provisional: true` và luôn hiện cảnh báo.
- **Hệ quả:** Đổi quy định không cần sửa code; kết quả cũ tái hiện được; cần màn hình quản trị quy tắc và quy trình xác nhận.
