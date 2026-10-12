# Tổng quan tài liệu

Hệ thống quản lý, theo dõi và đánh giá kết quả thực hiện nhiệm vụ KPI/OKR của cán bộ, công chức và các phòng chuyên môn thuộc Ban Tổ chức Tỉnh ủy.

Các tài liệu trong thư mục này là **chuẩn thiết kế** xuyên suốt dự án. Code phải khớp tài liệu; khi cần thay đổi thiết kế, cập nhật tài liệu (và ADR nếu là quyết định lớn) trước rồi mới sửa code.

| Tài liệu                                                   | Nội dung                                                     |
| ---------------------------------------------------------- | ------------------------------------------------------------ |
| [01-moi-truong.md](01-moi-truong.md)                       | Yêu cầu máy, cài đặt Docker/WSL2, các lệnh quan trọng        |
| [02-kien-truc.md](02-kien-truc.md)                         | Cây thư mục monorepo, sơ đồ kiến trúc FE/BE/DB               |
| [03-database.md](03-database.md)                           | ERD, từ điển dữ liệu, ràng buộc                              |
| [04-api.md](04-api.md)                                     | Đặc tả REST API `/api/v1`                                    |
| [05-phan-quyen.md](05-phan-quyen.md)                       | Vai trò, phạm vi dữ liệu, ma trận quyền                      |
| [06-quy-trinh-trang-thai.md](06-quy-trinh-trang-thai.md)   | Sơ đồ trạng thái đánh giá, phê duyệt, nhiệm vụ, kỳ           |
| [07-tieu-chi-va-tinh-diem.md](07-tieu-chi-va-tinh-diem.md) | Phiên bản bộ tiêu chí, engine tính điểm, cấu hình quy tắc    |
| [08-can-cu-nghiep-vu.md](08-can-cu-nghiep-vu.md)           | Văn bản căn cứ ([QĐ39], [HD05], sơ đồ, danh mục)             |
| [09-cau-hoi-mo.md](09-cau-hoi-mo.md)                       | Quyết định nghiệp vụ chờ cơ quan xác nhận                    |
| [10-rui-ro-ky-thuat.md](10-rui-ro-ky-thuat.md)             | Rủi ro kỹ thuật và phương án xử lý                           |
| [11-lo-trinh.md](11-lo-trinh.md)                           | Lộ trình theo giai đoạn và trạng thái hiện tại               |
| [12-qa-bao-cao.md](12-qa-bao-cao.md)                       | Báo cáo QA, rà soát bảo mật, lỗi theo mức độ, rủi ro còn lại |
| [adr/](adr/)                                               | Các quyết định kiến trúc (Architecture Decision Records)     |
| [references/](references/README.md)                        | Nơi đặt văn bản gốc (không commit)                           |

**Nguyên tắc quan trọng nhất:** hệ thống **không tự đặt** ngưỡng xếp loại, công thức hay quy định pháp lý. Mọi con số nghiệp vụ nằm trong cấu hình có phiên bản, kèm căn cứ văn bản, và chỉ được dùng để chốt kết quả khi người có thẩm quyền xác nhận (xem 07 và 09).
