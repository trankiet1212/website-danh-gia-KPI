# ADR-0002: Phiên đăng nhập lưu phía server + CSRF token

- **Trạng thái:** Đã triển khai (GĐ4)
- **Bối cảnh:** Hệ thống cơ quan nhà nước cần thu hồi phiên ngay khi khóa tài khoản/đổi quyền, không để token sống ngoài tầm kiểm soát.
- **Quyết định:** Bảng `sessions` lưu SHA-256 của token ngẫu nhiên 256 bit; cookie `httpOnly; SameSite=Strict; Secure (prod)`; đổi session id khi đăng nhập; idle + absolute timeout; CSRF token = HMAC-SHA256(`SESSION_SECRET`, session id) gửi qua header `X-CSRF-Token` (ổn định trong phiên nên dùng được nhiều tab; DB lưu băm token để đối chiếu), kèm kiểm tra Origin cho request thay đổi dữ liệu; mật khẩu băm argon2id. Không dùng JWT lưu trình duyệt.
- **Hệ quả:** Mỗi request đọc DB để kiểm tra phiên (chấp nhận được với quy mô vài chục người dùng); thu hồi phiên tức thì.

- **Ghi chú triển khai:** cookie `kpi_sid` (dev) / `__Host-kpi_sid` (production, Secure); phiên hết hạn khi không hoạt động `SESSION_IDLE_MINUTES` (mặc định 30) hoặc quá `SESSION_ABSOLUTE_HOURS` (mặc định 8); khóa tạm sau `LOGIN_MAX_ATTEMPTS` lần sai trong `LOGIN_LOCK_MINUTES` phút; giới hạn `LOGIN_RATE_LIMIT` lần gọi đăng nhập/15 phút/IP.
