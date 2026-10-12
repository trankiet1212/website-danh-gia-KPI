# ADR-0004: Lọc phạm vi dữ liệu ở tầng repository

- **Trạng thái:** Chấp nhận (GĐ2), triển khai ở GĐ4
- **Bối cảnh:** Rủi ro lớn nhất về phân quyền là rò dữ liệu ngoài phạm vi qua danh sách, thống kê, dashboard, export (docs/10 R3).
- **Quyết định:** Chỉ `modules/**/repository.ts` được gọi Prisma (ESLint `no-restricted-imports` chặn nơi khác). Mọi hàm repository truy vấn dữ liệu nghiệp vụ nhận `scopeWhere` sinh từ quyền của người dùng (ALL/UNITS/OWN_UNIT/MANAGED/SELF). Tài nguyên ngoài phạm vi trả 404.
- **Hệ quả:** Một điểm kiểm soát duy nhất, dễ test truy cập chéo; mã repository dài hơn một chút.
