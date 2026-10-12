# Bối cảnh và căn cứ nghiệp vụ

> Tài liệu thiết kế chuẩn (GĐ1–2, đã duyệt). Mọi thay đổi kiến trúc phải cập nhật tài liệu trước khi sửa code — xem CLAUDE.md.

**Đề bài** (Đề kiểm tra năng lực BTCTU) gồm 3 phần:

1. Bộ tiêu chí KPI/OKR cho cá nhân và tập thể phòng theo tháng/quý/năm.
2. Phần mềm (9 nhóm chức năng tối thiểu).
3. Cấp độ ATTT và giải pháp bảo đảm.

Master prompt bổ sung Modules A–J, 5 vai trò, 8 giai đoạn và 15 tiêu chí nghiệm thu.

**Môi trường:**

- `D:\Web_KPI` đang trống.
- Có Node 24.14, npm 11.9, Git 2.47, Python 3.11.
- **Chưa có Docker/WSL.** Bạn cần cài trước GĐ3.

**Căn cứ đã đọc và đối chiếu nguyên văn:**

| Mã            | Văn bản                                                                   | Điểm dùng cho thiết kế                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **[QĐ39]**    | 39-QĐ/TU ngày 28/11/2025 của BTV Tỉnh ủy về kiểm điểm, đánh giá, xếp loại | **Điều 10:** khung tiêu chí lượng hóa trên **thang 100**. Tập thể và cán bộ diện BTVTU theo các Phụ lục của QĐ (**Phụ lục không có trong file Drive**). **Điều 11:** 4 mức xếp loại theo tổng điểm, **kèm điều kiện** riêng cho tập thể / cá nhân lãnh đạo / cá nhân không lãnh đạo (tr.10–13). **Khoản 1.5:** HTXS ≤20% số HTTNV, có thể ≤25% khi có thành tích nổi trội; nơi dưới 5 đối tượng được chọn 1. **Điều 13–14:** thẩm quyền; đánh giá quý I–III, quý IV gộp vào cuối năm, hồ sơ trước ngày 15 tháng cuối quý. **Điều 17:** bảo lưu, khiếu nại. **Điều 18:** hồ sơ.                                                                                                                                                                                                                                                                                                                                                                                       |
| **[HD05]**    | 05-HD/TU ngày 16/6/2026, đánh giá hằng quý cán bộ lãnh đạo, quản lý       | **Tiêu chí chung tối đa 30** (Phụ lục 03: nhóm 1 = 18, nhóm 2 = 4, nhóm 3 = 8; chấm theo đảm bảo/không đảm bảo). **Kết quả nhiệm vụ tối đa 70**, chia theo các trục, nhóm chính có tỷ trọng cao hơn. **Phụ lục 1:** danh mục SP/CV chuẩn, **hệ số quy đổi = điểm SP / điểm SP chuẩn**, 5 nhóm độ khó với khung tối đa 100–500. **Phụ lục 2:** KPI = (A+B+C+D)/4; điểm nhiệm vụ = Σ KPI trục × điểm tối đa trục; mỗi lần làm lại / chậm **trừ 25%** (dẫn điểm b, c khoản 2 Điều 14 NĐ 335/2025), trừ trường hợp khách quan được xác nhận; D = 3 tiêu chí, mỗi tiêu chí 100% hoặc 50%; **ví dụ số: 84,4 / 90,3 / 63,3 / 83,3 → 82,3% → 80,3 điểm** — ví dụ có sai số học ở các phép cộng; tính đúng từ số liệu từng dòng ra 83,6 điểm (đối chiếu: docs/07 §7.4, docs/09 #19–20). **Phụ lục 03 mục A:** nguyên văn 17 tiêu chí chung (nạp vào bộ tiêu chí DEMO). Quy trình 5 bước, xếp loại theo 4 mức, mẫu số 5. Khuyến khích đánh giá tuần/tháng bằng KPI cho CBCCVC. |
| **[XLSX-SĐ]** | Cây sơ đồ phân công BTCTU (T9/2026)                                       | 39 vị trí ở 5 cấp (1 Trưởng ban, 5 PTB, 4 phòng: TCCB, Văn phòng, TCĐ-ĐV, BVCTNB), quan hệ cấp quản lý trực tiếp, lĩnh vực phụ trách, O/KR từng vị trí.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **[XLSX-DM]** | Danh mục công việc BTCTU                                                  | 49 dòng SP/CV (sheet 21.7, ghi chú "Ví dụ danh mục sản phẩm"), nhóm A/B/C/D, mức độ, giờ tối đa, điểm, **hệ số = điểm/90**. 1 dòng (A.007) không có điểm → seed nạp **48** mục.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

**Chưa đọc hoặc chưa có:**

- NĐ 335/2025/NĐ-CP (không có trong Drive).
- Phụ lục của 39-QĐ/TU.
- NĐ 85/2016 (dùng cho phần 3 ATTT).
- 63/2026/NĐ-CP, 165/2025, 278/2025, 11-NQ/TU, 1638-CV/TU, các văn bản A15/A80/A81, QĐ chức năng nhiệm vụ BTCTU.

Các văn bản này sẽ được đọc ở bước tài liệu tiếp theo và cập nhật vào `docs/08`.

**Quyết định bạn đã chốt:**

- Seed dùng **tên giả trên cấu trúc thật**.
- KPI chuyên viên tạm dùng **(A+B+C)/3**, gắn nhãn CHƯA XÁC NHẬN.
- **Trục điểm cấu hình theo VTVL**, tổng = 70.

## Nguyên tắc "không tự đặt quy định"

1. Mọi con số nghiệp vụ (ngưỡng, tỷ lệ, mức trừ, trục, công thức) nằm trong **cấu hình có phiên bản** (`rule_set_versions`), **không viết cứng trong mã**.
2. Mỗi phiên bản có `legal_basis` + `source_refs` (văn bản, điều, trang) và trạng thái. **Chỉ phiên bản `CONFIRMED`** (do người có quyền `ruleset.confirm` xác nhận) mới được dùng để chốt điểm và xếp loại.
3. Seed demo chứa các giá trị **trích nguyên văn [QĐ39]/[HD05]** ở trạng thái `PENDING_CONFIRMATION`. Riêng các giá trị **không có trong văn bản** (KPI chuyên viên, trục theo VTVL, tổng hợp năm) có cờ `provisional: true` và luôn hiện cảnh báo.
4. Hệ thống **đề xuất** mức xếp loại kèm giải thích. **Quyết định cuối cùng do người có thẩm quyền**, có ghi vết.

## Căn cứ an toàn thông tin (đã đọc bản gốc trong bộ tài liệu, 12/10/2026)

| Văn bản                                 | Nội dung dùng cho phần 3 (cấp độ ATTT)                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NĐ 85/2016/NĐ-CP                        | Điều 5 k2: cấp độ hệ thống = cấp cao nhất của thành phần; Điều 6: phân loại thông tin (công cộng, riêng, cá nhân, BMNN) và hệ thống (nội bộ / phục vụ người dân…); **Điều 8 k1**: nội bộ + thông tin riêng, cá nhân, không BMNN → **cấp độ 2**; **Điều 9 k1**: xử lý BMNN → cấp độ 3; Điều 12 k2: cấp độ 3 do đơn vị chuyên trách ATTT của chủ quản thẩm định, chủ quản phê duyệt; Điều 14–15: trình tự, hồ sơ |
| 07-HD/VPTW (29/5/2026)                  | Cấp độ ATTT trong cơ quan đảng áp dụng theo NĐ 85/2016; hệ thống kết nối LGSP của Đảng phải **từ cấp độ 3**; dữ liệu Mật/Tối mật dùng giải pháp mã hóa Ban Cơ yếu, Tuyệt mật không qua mạng; chứng thư số chuyên dùng; cam kết SSO/MFA, RBAC; báo cáo sự cố trong 24 giờ                                                                                                                                       |
| 308-QĐ/VPTW (01/6/2026)                 | Từ điển dữ liệu dùng chung: trường dữ liệu cán bộ (họ tên, giới tính, ngày sinh…) là dữ liệu cá nhân; mức độ mật do chủ quản quyết định theo Luật BVBMNN                                                                                                                                                                                                                                                       |
| 342-QĐ/BTCTW (20/6/2026)                | HTTT lĩnh vực Tổ chức xây dựng Đảng: tài khoản quản trị, khai thác dữ liệu nhạy cảm/BMNN phải **xác thực đa yếu tố**; nhật ký truy cập lưu tập trung, chống thay đổi; không dùng AI công cộng xử lý dữ liệu chưa được phép                                                                                                                                                                                     |
| NĐ 63/2026/NĐ-CP (28/02/2026)           | Hướng dẫn Luật BVBMNN 117/2025/QH15; Điều 6 k5 điểm c, k7: máy tính gửi, nhận, đăng ký văn bản điện tử BMNN không kết nối LAN (trừ LAN độc lập), Internet, viễn thông (trừ theo quy định cơ yếu)                                                                                                                                                                                                               |
| Khác (trích dẫn trong các văn bản trên) | Luật An ninh mạng 116/2025/QH15; Luật BVDLCN 91/2025/QH15; Luật Dữ liệu 60/2024/QH15, NĐ 165/2025; NĐ 278/2025; Chỉ thị 57-CT/TW; Quy chế 07-QC/TW                                                                                                                                                                                                                                                             |

Đề xuất trình bày trong slide: tiêu chí tối thiểu cấp độ 2 (Điều 8 k1); đề xuất **cấp độ 3** khi vận hành chính thức (dữ liệu có thể được xác định BMNN, liên thông LGSP/HTTT ngành Tổ chức). Chưa được thẩm định, phê duyệt.
