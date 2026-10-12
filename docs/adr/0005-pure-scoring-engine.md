# ADR-0005: Engine tính điểm và state machine là hàm thuần

- **Trạng thái:** Chấp nhận (GĐ2), triển khai ở GĐ5–6
- **Bối cảnh:** Điểm số ảnh hưởng trực tiếp tới xếp loại cán bộ; phải kiểm chứng và giải thích được.
- **Quyết định:** `apps/api/src/scoring` và `src/workflow` không truy cập DB: nhận dữ liệu đầu vào + cấu hình, trả kết quả + bảng giải thích. Dùng Decimal, làm tròn một chỗ theo cấu hình. Bắt buộc golden test tái hiện ví dụ [HD05] (84,4 / 90,3 / 63,3 / 83,3 → 82,3% → 80,3 điểm).
- **Hệ quả:** Test nhanh, độc lập DB; snapshot đầu vào/đầu ra được lưu khi phê duyệt để đối chiếu về sau.
