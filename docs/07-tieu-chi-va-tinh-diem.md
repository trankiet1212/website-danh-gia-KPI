# Bộ tiêu chí, phiên bản và quy tắc tính điểm

> Tài liệu thiết kế chuẩn (GĐ1–2, cập nhật theo triển khai GĐ5). Mọi thay đổi kiến trúc phải cập nhật tài liệu trước khi sửa code — xem CLAUDE.md.

## 7.1 Ba lớp cấu hình độc lập, ghép lại khi tạo hồ sơ

```
work_catalog_version  (danh mục SP/CV + hệ số)        ──┐
rule_set_version      (công thức, trừ điểm, xếp loại) ──┼──► criteria_version (bộ tiêu chí cho 1 nhóm đối tượng)
criteria_items        (30 điểm chung + các trục 70)   ──┘          │
                                                                  ▼
                 evaluation_record (GHIM criteria_version + rule_set_version khi tạo hồ sơ)
                                                                  │
                     evaluation_calculations (ảnh chụp: đầu vào + phiên bản + kết quả + checksum)
```

| Lớp                                    | Trạng thái                                                                       | Ai chuyển                                                                                                 | Bất biến khi                                                              |
| -------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `rule_set_versions`                    | DRAFT → PENDING_CONFIRMATION → CONFIRMED → RETIRED (PENDING → DRAFT khi trả lại) | soạn/trình: `ruleset.write`; xác nhận/trả lại/ngừng: `ruleset.confirm` (người soạn **không** tự xác nhận) | CONFIRMED, RETIRED (trigger DB)                                           |
| `criteria_versions` + `criteria_items` | DRAFT → SUBMITTED → APPROVED → RETIRED (SUBMITTED → DRAFT khi trả lại)           | soạn/trình: `criteria.write`; duyệt: `criteria.approve` (người soạn không tự duyệt)                       | mục chỉ sửa được khi DRAFT; phiên bản APPROVED/RETIRED bất biến (trigger) |
| `work_catalog_versions` + items        | SUBMITTED → APPROVED                                                             | `catalog.approve`                                                                                         | APPROVED/RETIRED (trigger)                                                |

- Muốn sửa bản đã xác nhận/phê duyệt: **tạo phiên bản mới** (sao chép toàn bộ cấu hình/cây tiêu chí), sửa, trình lại.
- Hồ sơ đánh giá ghi id phiên bản bộ tiêu chí và bộ quy tắc khi tạo, nên đổi phiên bản sau đó không làm thay đổi hồ sơ cũ.
- Được tạo hồ sơ và **tính thử** với bộ tiêu chí SUBMITTED / quy tắc PENDING (kết quả gắn nhãn "tạm"). **Chỉ được phê duyệt** khi quy tắc CONFIRMED **và** bộ tiêu chí APPROVED **và** kỳ có xếp loại (`isRated`).

**Seed DEMO (GĐ5):**

- `RS-CANHAN` v1 — cấu hình trích [QĐ39] + [HD05], **CHỜ XÁC NHẬN** (`apps/api/prisma/seed/rule-config-qd39-hd05.ts`).
- `DM-BTCTU` v1 — 48 SP/CV từ "Danh mục công việc BTCTU" (sheet 21.7), điểm chuẩn 90, **ĐÃ TRÌNH**. Bỏ 1 dòng không có điểm (A.007).
- `CS-LD` (lãnh đạo) và `CS-CV` (chuyên viên — **tạm áp dụng** khung PL03) v1 **ĐÃ TRÌNH**. Gồm 30 điểm tiêu chí chung nguyên văn [HD05] Phụ lục 03 mục A (nhóm 1: 9 × 2 điểm; nhóm 2: 4 × 1 điểm; nhóm 3: 4 × 2 điểm; chấm đảm bảo/không đảm bảo) và 1 trục `T1` 70 điểm chấm KPI tổng hợp (**trục tạm**, docs/09 #2).
- CS-TT (tập thể phòng): chưa tạo, vì chưa có Phụ lục [QĐ39].

## 7.2 Phương pháp chấm (engine thuần, `apps/api/src/scoring`)

Mỗi mục tiêu chí có một **phương pháp chấm**. Điểm của mục = tỷ lệ đạt × điểm tối đa. Mọi tham số lấy từ cấu hình bộ quy tắc.

| Phương pháp           | Dùng cho                 | Dữ liệu nhập                                                                                                        | Tỷ lệ đạt                                                                                                                                              |
| --------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PASS_FAIL`           | tiêu chí chung, chỉ tiêu | Đảm bảo / không đảm bảo                                                                                             | 1 hoặc `passFail.failRatio`                                                                                                                            |
| `MANUAL_SCORE`        | mọi loại                 | Số điểm (0 … tối đa)                                                                                                | điểm / tối đa (vượt tối đa → lỗi)                                                                                                                      |
| `QUALITATIVE_LEVEL`   | tiêu chí chung, chỉ tiêu | Mức (M1/M2/M3…)                                                                                                     | `qualitativeLevels[].ratio` (**tạm**)                                                                                                                  |
| `TARGET_RATIO`        | chỉ tiêu của trục        | Giá trị thực tế                                                                                                     | Tăng: thực tế / mục tiêu. Giảm: `BASELINE_GAP` = (ban đầu − thực tế)/(ban đầu − mục tiêu), hoặc `TARGET_OVER_ACTUAL`. Kẹp trong [0, `targetRatio.cap`] |
| `KPI_COMPOSITE`       | trục kết quả             | Bảng nhiệm vụ: hệ số, SL kế hoạch, SL hoàn thành, SL/lần làm lại, SL/lần chậm, miễn trừ, vượt mức; D1–D3 (lãnh đạo) | KPI theo [HD05] Phụ lục 2 (dưới đây)                                                                                                                   |
| `WEIGHTED_INDICATORS` | trục kết quả             | Mỗi chỉ tiêu con chấm theo phương pháp riêng                                                                        | Σ (tỷ lệ chỉ tiêu × trọng số) / 100; tổng trọng số phải = 100                                                                                          |

**KPI tổng hợp ([HD05] Phụ lục 2):** với mỗi dòng _i_ (hệ số `k`, kế hoạch `P`, hoàn thành `H`, số lượng sai sót `s` với `n` lần làm lại, số lượng chậm `c` với `m` lần chậm):

```
kế hoạch quy đổi   KH_i = k × P                                  (cột 7)
hoàn thành quy đổi HT_i = k × H                                  (cột 9)
chất lượng         CL_i = k × (H − s) + max(0, k×s − k×s×n×reworkDeductionRate)   (cột 11 bảng 2.2)
tiến độ            TĐ_i = k × (H − c) + max(0, k×c − k×c×m×lateDeductionRate)     (cột 11 bảng 2.3)

A = min(ΣHT / ΣKH, capA)
B = ΣCL / mẫu số   (composite.qualityDenominator: PLANNED = ΣKH | COMPLETED = ΣHT)
C = ΣTĐ / mẫu số   (composite.timelinessDenominator)
D = trung bình D1..D3, mỗi giá trị thuộc leadershipD.allowedLevels (chỉ khi công thức có D)
KPI = kpiFormulas[profile]  (MEAN: trung bình các thành phần | WEIGHTED: trọng số)
Điểm trục = KPI × điểm tối đa trục
```

**Tổng điểm** = Σ tiêu chí chung + Σ điểm các trục, làm tròn theo `rounding` (chỉ làm tròn ở tổng). Toàn bộ tính bằng Decimal (decimal.js, 40 chữ số).

**Kiểm tra dữ liệu (kết quả trả kèm `issues`):**

| Mã                                            | Mức          | Ý nghĩa                                                                                                                  |
| --------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------ |
| thiếu dữ liệu                                 | —            | Mục chưa nhập → `complete = false`, không đề xuất xếp loại, **không nộp/hoàn tất/phê duyệt được**                        |
| `INVALID_ROW`                                 | lỗi          | Hoàn thành/sai sót/chậm vượt quá số lượng hợp lệ                                                                         |
| `NO_PLAN`, `ZERO_COUNT`, `NO_COMPLETION`      | lỗi/cảnh báo | Không có kế hoạch (không chia cho 0, không tự cho 100%); có SL sai sót nhưng số lần = 0…                                 |
| `OUTLIER`                                     | cảnh báo     | Hoàn thành > `outliers.maxCompletedOverPlanned` × kế hoạch                                                               |
| `UNPLANNED`, `EXEMPT_NO_NOTE`                 | cảnh báo     | Việc ngoài kế hoạch; miễn trừ chưa ghi căn cứ                                                                            |
| `MISSING_D`, `INVALID_D`                      | lỗi          | Thiếu/không hợp lệ thành phần D                                                                                          |
| `OVER_MAX`, `INVALID_TARGET`, `INVALID_LEVEL` | lỗi          | Điểm vượt tối đa; mục tiêu/ban đầu sai; mức định tính không có trong cấu hình                                            |
| `NA_NOT_ALLOWED`, `NA_POLICY`, `NA_NO_REASON` | lỗi/cảnh báo | Tiêu chí "không áp dụng" không được phép, hoặc thiếu lý do. `EXCLUDE_AND_RESCALE`: loại khỏi mẫu số và quy đổi lại thang |
| `RULE_NOT_CONFIRMED`, `PROVISIONAL_RULE`      | cảnh báo     | Quy tắc chưa xác nhận / có khóa "tạm"                                                                                    |

Nếu `validation.blockSubmitOnWarnings = true`, cảnh báo (trừ 2 cảnh báo cuối) chặn việc nộp.

**Kiểm tra bộ tiêu chí** (`validate-criteria.ts`, chạy khi xem, trình, duyệt): trùng mã; quan hệ cha–con sai loại; phương pháp không hợp lệ với loại mục; thiếu mục tiêu/chiều/giá trị ban đầu; Σ tiêu chí chung ≠ `generalMax`; Σ mục con ≠ điểm nhóm; không có trục; Σ trục ≠ `resultMax`; thiếu trọng số hoặc Σ trọng số ≠ 100; chung + kết quả ≠ thang của quy tắc; quy tắc gắn kèm đang nháp/ngừng.

**Xếp loại** (`rating.ts`), theo thứ tự:

1. Có cờ thuộc `rating.forced[].anyFlag` → mức bắt buộc (ví dụ KHTNV).
2. Lấy mức theo khoảng điểm (`rating.bands`).
3. Kiểm tra điều kiện kèm theo của mức (`rating.conditions`: chỉ số `completionRate`, `exceededShare`, `lateShare`, `failedShare`, `totalScore` và cờ `noFlag`). Không đạt thì xét mức thấp hơn. Mức có `assignOnlyWithinRange = true` (KHTNV) chỉ xếp khi điểm nằm trong khoảng của mức đó.
4. Không mức nào thỏa → `eligible = null`: "cấp có thẩm quyền xem xét, quyết định" (docs/09 #22).

Kết quả xếp loại là **đề xuất**. Người phê duyệt chọn mức cuối cùng; nếu khác đề xuất thì **bắt buộc nêu lý do** (`ratingOverrideReason`).

**Ba lớp điểm tách biệt** trên hồ sơ:

| Lớp         | Dữ liệu nhập                                                                                         | Kết quả lưu                         | Ảnh chụp                                 |
| ----------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------- |
| Tự đánh giá | `evaluation_items.self_input`                                                                        | `self_total`, `self_rating`         | `SELF` khi nộp                           |
| Thẩm định   | `review_input` (mục chưa chấm lại lấy theo tự đánh giá, có ghi trong giải thích) + cờ `review_flags` | `review_total`, `review_rating`     | `REVIEW` khi hoàn tất thẩm định          |
| Phê duyệt   | tính lại theo dữ liệu thẩm định với quy tắc đã xác nhận                                              | `approved_total`, `approved_rating` | `APPROVAL` khi phê duyệt — hồ sơ bị khóa |

Mỗi ảnh chụp lưu: dữ liệu đầu vào, `engine_version`, `rule_set_checksum` (sha256 cấu hình), `criteria_version_id`, kết quả + giải thích, `checksum` (sha256 của tất cả). Bảng ảnh chụp **chỉ ghi thêm** (trigger).

**Tổng hợp năm** (`aggregate.ts`): `MANUAL_WITH_REFERENCE` (mặc định) — chỉ hiển thị kết quả các kỳ làm căn cứ, **không tự tính**; `WEIGHTED_AVERAGE` khi cơ quan xác nhận. Từ GĐ6, báo cáo "Tổng hợp tháng/quý/năm" dùng cùng chiến lược cho mọi kỳ cha (năm ← quý có xếp loại, 6 tháng ← quý, quý ← tháng); trọng số `weights` khai báo theo mã kỳ con; chỉ dùng điểm **đã phê duyệt** (docs/09 #29).

**OKR:** tiến độ KR (tăng/giảm/đạt-không đạt/mốc) **chỉ để theo dõi**, không quy đổi thành điểm KPI.

**Tập thể phòng:** chưa có công thức cho tới khi có Phụ lục [QĐ39].

## 7.3 Cấu hình `rule_set_versions.config` (schema `packages/shared/src/schemas/rule-config.ts`)

Cấu hình DEMO `RS-CANHAN` v1 (rút gọn, đầy đủ trong seed). Khóa có dấu ⚠ nằm trong `provisionalKeys`: giao diện gắn nhãn "Tạm", kết quả xếp loại gắn `provisional`.

```jsonc
{
  "scale": { "max": 100, "generalMax": 30, "resultMax": 70 },              // [HD05] PL2 §1, IV.1
  "kpiFormulas": {
    "LEADER": { "components": ["A", "B", "C", "D"], "aggregate": "MEAN" }, // [HD05] PL2 §1
    "STAFF":  { "components": ["A", "B", "C"], "aggregate": "MEAN" }       // ⚠ chưa có căn cứ (docs/09 #1)
  },
  "composite": {
    "capA": 1,                                // [HD05] PL2 §2(i)
    "qualityDenominator": "PLANNED",          // ⚠ nhãn (11)/(7); số trong ví dụ lại chia cột (9) — docs/09 #19
    "timelinessDenominator": "PLANNED",       // (11)/(7), khớp ví dụ
    "reworkDeductionRate": 0.25,              // [HD05] PL2 chú thích 1 (NĐ 335/2025 Đ14 k2 b)
    "lateDeductionRate": 0.25                 // [HD05] PL2 chú thích 2 (NĐ 335/2025 Đ14 k2 c)
  },
  "leadershipD": { "subCriteria": [{ "code": "D1", "label": "..." }, { "code": "D2" }, { "code": "D3" }], "allowedLevels": [1, 0.5] },
  "passFail": { "failRatio": 0 },             // [HD05] PL03: "chấm 0 điểm nếu không đảm bảo"
  "targetRatio": { "cap": 1, "decreaseMethod": "BASELINE_GAP" },             // ⚠
  "qualitativeLevels": [{ "code": "M1", "ratio": 1 }, { "code": "M2", "ratio": 0.5 }, { "code": "M3", "ratio": 0 }], // ⚠ tỷ lệ
  "notApplicable": { "policy": "NOT_ALLOWED" },                              // ⚠
  "rounding": { "decimals": 1, "mode": "HALF_UP" },                          // ⚠
  "outliers": { "maxCompletedOverPlanned": 3 },                              // ⚠
  "validation": { "blockSubmitOnWarnings": false },
  "rating": {
    "bands": [                                                               // [QĐ39] Đ11
      { "code": "HTXS",  "min": 90, "maxExclusive": null },
      { "code": "HTTNV", "min": 70, "maxExclusive": 90 },
      { "code": "HTNV",  "min": 50, "maxExclusive": 70 },
      { "code": "KHTNV", "min": null, "maxExclusive": 50, "assignOnlyWithinRange": true }
    ],
    "conditions": [                                                          // ⚠ cách chuyển lời văn thành chỉ số — docs/09 #21
      { "rating": "HTXS",  "all": [completionRate ≥ 1, exceededShare ≥ 0.3, lateShare ≤ 0, noFlag UNRESOLVED_SHORTCOMINGS] },
      { "rating": "HTTNV", "all": [completionRate ≥ 1, lateShare ≤ 0] },
      { "rating": "HTNV",  "all": [completionRate ≥ 1, lateShare ≤ 0.2] }
    ],
    "forced": [{ "rating": "KHTNV", "anyFlag": ["DISCIPLINE", "DEGRADATION", "UNIT_BELOW_70", "LOW_CONFIDENCE", "CORRUPTION_IN_SCOPE", "MAJORITY_TASKS_FAILED"] }],
    "flags": [ /* 7 cờ, mỗi cờ có nhãn tiếng Việt theo [QĐ39] Đ11 */ ]
  },
  "annualAggregation": { "strategy": "MANUAL_WITH_REFERENCE" },             // ⚠
  "provisionalKeys": ["kpiFormulas.STAFF", "composite.qualityDenominator", "targetRatio", "qualitativeLevels.ratio",
                      "notApplicable", "rounding", "outliers", "rating.conditions", "annualAggregation"]
}
```

Schema kiểm tra khi lưu: thang = chung + kết quả; mã mức/cờ không trùng và được tham chiếu đúng; trọng số đủ khi `WEIGHTED`. Mỗi khóa có `sourceRefs` (văn bản, vị trí, ghi chú), hiển thị ở màn hình "Quy tắc tính điểm".

## 7.4 Giải thích bằng ví dụ dữ liệu DEMO và đối chiếu kiểm thử

### Ví dụ 1 — [HD05] Phụ lục 2 (lãnh đạo cấp phó, 6 nhiệm vụ)

Dữ liệu: `apps/api/src/scoring/demo-data.ts`. Hồ sơ DEMO "Phó Trưởng ban phụ trách TCCB — Quý II/2026" dùng đúng dữ liệu này.

| Dòng  | Hệ số | KH  | HT  | Làm lại (SL × lần) | Chậm (SL × lần) | KH quy đổi | HT quy đổi | Chất lượng             | Tiến độ                      |
| ----- | ----- | --- | --- | ------------------ | --------------- | ---------- | ---------- | ---------------------- | ---------------------------- |
| 1     | 1     | 3   | 3   | 1 × 1              | 2 × 2           | 3          | 3          | 2 + (1 − 0,25) = 2,75  | 1 + max(0, 2 − 2×2×0,25) = 2 |
| 2     | 1     | 1   | 0   | —                  | —               | 1          | 0          | 0                      | 0                            |
| 3     | 1,5   | 1   | 1   | —                  | —               | 1,5        | 1,5        | 1,5                    | 1,5                          |
| 4     | 2,5   | 1   | 1   | —                  | 1 × 2           | 2,5        | 2,5        | 2,5                    | 2,5 − 2,5×2×0,25 = 1,25      |
| 5     | 1,8   | 1   | 1   | 1 × 2              | 1 × 1           | 1,8        | 1,8        | 1,8 − 1,8×2×0,25 = 0,9 | 1,35                         |
| 6     | 1     | 3   | 2   | —                  | —               | 3          | 2          | 2                      | 2                            |
| **Σ** |       |     |     |                    |                 | **12,8**   | **10,8**   | **9,65**               | **8,1**                      |

D = trung bình(100%, 100%, 50%) = 83,33%.

| Đại lượng       | Văn bản [HD05]       | Engine — cấu hình DEMO (`PLANNED`)                                                                                         | Engine — `qualityDenominator = COMPLETED` | Nhận xét                                                                                                             |
| --------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| A               | 84,4%                | 10,8/12,8 = **84,375%** ✔                                                                                                  | 84,375%                                   | Khớp                                                                                                                 |
| B               | 90,3% (= 10,65/11,8) | 9,65/12,8 = **75,39%**                                                                                                     | 9,65/10,8 = **89,35%**                    | Văn bản cộng sai cột (9) = 11,8 (đúng 10,8) và cột (11) = 10,65 (đúng 9,65); mẫu số ghi (11)/(7) nhưng tính theo (9) |
| C               | 63,3%                | 8,1/12,8 = **63,28%** ✔                                                                                                    | 63,28%                                    | Khớp                                                                                                                 |
| D               | 83,3%                | **83,33%** ✔                                                                                                               | 83,33%                                    | Khớp                                                                                                                 |
| KPI             | 82,3%                | **76,595%**                                                                                                                | 80,085%                                   | Trung bình 4 số của văn bản = 80,325% (văn bản ghi 82,3%)                                                            |
| Điểm kết quả    | —                    | 53,6165 / 70                                                                                                               | 56,06                                     |                                                                                                                      |
| Tổng            | 80,3                 | **83,6**                                                                                                                   | 86,1                                      | 30 + 82,3% × 70 = 87,61; 30 + 80,325% × 70 = 86,2 — không ra 80,3                                                    |
| Chỉ số xếp loại | —                    | hoàn thành 4/6, chậm 3/6, không hoàn thành 1/6                                                                             |                                           |                                                                                                                      |
| Mức đề xuất     | —                    | **Không xác định** (83,6 thuộc HTTNV nhưng chưa hoàn thành 100% nhiệm vụ; HTNV cũng yêu cầu 100%; KHTNV chỉ khi < 50 điểm) |                                           | docs/09 #22                                                                                                          |

→ Engine **không ép ra 80,3**: số trung gian từng dòng khớp văn bản, sai khác nằm ở các phép cộng trong ví dụ. Đã ghi vào docs/09 #19–20 để cơ quan xác nhận mẫu số B.

### Ví dụ 2 — chuyên viên, kiểm thử tích hợp (`tests/integration/evaluations.test.ts`)

Bộ tiêu chí: 30 điểm chung (3 mục đảm bảo) + trục 70 điểm KPI tổng hợp, công thức STAFF (A+B+C)/3.

| Lớp                                        | Dữ liệu                                         | A / B / C                         | KPI      | Tổng                    | Mức đề xuất                                                         |
| ------------------------------------------ | ----------------------------------------------- | --------------------------------- | -------- | ----------------------- | ------------------------------------------------------------------- |
| Tự đánh giá                                | 1 nhiệm vụ KH 4, HT 4, không sai sót/chậm       | 100 / 100 / 100%                  | 100%     | **100**                 | HTTNV (đủ điểm HTXS nhưng không có ≥ 30% nhiệm vụ vượt mức)         |
| Thẩm định                                  | như trên + 1 sản phẩm phải làm lại 1 lần        | 100 / (3 + 0,75)/4 = 93,75 / 100% | 97,9167% | 30 + 68,5417 = **98,5** | HTTNV                                                               |
| Phê duyệt (lần 1)                          | tính lại dữ liệu thẩm định, quy tắc đã xác nhận |                                   |          | **98,5**                | HTTNV — người duyệt chọn HTXS mà không nêu lý do → bị từ chối (422) |
| Mở lại → thẩm định lại → phê duyệt (lần 2) | bỏ lỗi làm lại                                  |                                   |          | **100**                 | HTTNV; ảnh chụp phê duyệt lần 1 vẫn còn                             |

### Danh sách kiểm thử (đã chạy)

- Unit test engine (`src/scoring/*.test.ts`, 87 test cùng state machine): golden [HD05] từng dòng và từng thành phần; công thức STAFF, WEIGHTED; mức trừ cấu hình; sàn 0; trần A; làm tròn HALF_UP/HALF_EVEN/DOWN; kế hoạch = 0; dữ liệu sai/ngoại lệ; thiếu D/D sai; miễn trừ thiếu căn cứ; NA theo từng chính sách; TARGET_RATIO tăng/giảm; định tính; WEIGHTED_INDICATORS; xếp loại (cờ bắt buộc, điều kiện, `assignOnlyWithinRange`, tạm); kiểm tra bộ tiêu chí; tổng hợp năm; tiến độ KR; checksum.
- Tích hợp (DB kiểm thử): `kpi-config.test.ts` (kỳ, quy tắc, bộ tiêu chí, danh mục — không tự xác nhận/duyệt, bất biến qua API và trigger), `evaluations.test.ts` (luồng đầy đủ, phạm vi, 3 lớp điểm, khóa sau phê duyệt qua API **và** trigger, mở lại), `objectives.test.ts` (OKR, phạm vi, tiến độ, check-in chỉ ghi thêm).

## Danh mục sản phẩm/công việc theo vị trí việc làm (15/10/2026)

Danh mục chuẩn được phân theo VTVL (bảng `job_position_work_items`, docs/03). Phân mặc định dựa trên tiêu đề nhóm của file nguồn "Danh mục công việc của BTCTU":

| Nhóm danh mục (theo tiêu đề nhóm trong file nguồn)                                                              | VTVL được phân mặc định                                                                     |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| A — "Nhóm công việc theo VTVL lãnh đạo, quản lý cấp phòng"                                                      | Lãnh đạo, quản lý cấp phòng; Lãnh đạo Ban (*)                                               |
| B — "Nhóm công việc theo VTVL chuyên môn dùng chung (văn thư; hành chính; tài chính nội bộ)"                    | Mọi VTVL nhóm chuyên môn dùng chung (văn thư – hành chính, kế toán, quản trị công sở, CNTT) |
| C — "Nhóm công việc theo VTVL chuyên môn, nghiệp vụ"                                                            | Mọi VTVL nhóm chuyên môn, nghiệp vụ                                                         |
| D — "Nhóm công việc khác": D.001 (ghi nhật ký công việc), D.003 (duyệt công việc, nhiệm vụ khác được phân công) | Mọi VTVL                                                                                    |
| D.002 (vệ sinh cơ quan), D.004 (đưa đón, lễ tân, tiếp khách) (*)                                                | Mọi VTVL nhóm chuyên môn dùng chung                                                         |

(*) Suy luận, file nguồn không ghi rõ — **tạm**, docs/09 #36. Cán bộ tổng hợp chỉnh lại trên giao diện.

Việc phân danh mục chỉ giới hạn **mục được hiển thị, chọn**; hệ số, điểm, công thức tính không đổi.
