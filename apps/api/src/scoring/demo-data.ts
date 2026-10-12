/**
 * Dữ liệu ví dụ của [HD05] Phụ lục 2 (lãnh đạo cấp phó tại Ban Tổ chức Tỉnh ủy, Quý II/2026)
 * — dùng chung cho golden test và seed DEMO. Mỗi dòng ghi lại đúng số liệu các bảng 1, 2.2, 2.3.
 */
import type { CompositeRow } from '@kpi/shared';

export const HD05_EXAMPLE_ROWS: CompositeRow[] = [
  {
    label: 'Chỉ đạo xây dựng kế hoạch công tác hằng tháng của Ban Tổ chức Tỉnh ủy',
    catalogItemCode: null,
    coefficient: 1,
    plannedQty: 3,
    completedQty: 3,
    reworkQty: 1, // bảng 2.2: 1 nhiệm vụ có sai sót, 1 lần làm lại
    reworkCount: 1,
    lateQty: 2, // bảng 2.3: 2 việc chậm tiến độ, 2 lần chậm
    lateCount: 2,
    exemptCount: 0,
    exemptNote: null,
    exceeded: false,
  },
  {
    label: 'Thực hiện công tác cán bộ tại xã A',
    catalogItemCode: null,
    coefficient: 1,
    plannedQty: 1,
    completedQty: 0,
    reworkQty: 0,
    reworkCount: 0,
    lateQty: 0,
    lateCount: 0,
    exemptCount: 0,
    exemptNote: null,
    exceeded: false,
  },
  {
    label: 'Điều hành Hội nghị quán triệt văn bản',
    catalogItemCode: null,
    coefficient: 1.5,
    plannedQty: 1,
    completedQty: 1,
    reworkQty: 0,
    reworkCount: 0,
    lateQty: 0,
    lateCount: 0,
    exemptCount: 0,
    exemptNote: null,
    exceeded: false,
  },
  {
    label: 'Chỉ đạo, tham mưu đề án về tổ chức bộ máy',
    catalogItemCode: null,
    coefficient: 2.5,
    plannedQty: 1,
    completedQty: 1,
    reworkQty: 0,
    reworkCount: 0,
    lateQty: 1, // bảng 2.3: chậm 1 việc, 2 lần chậm
    lateCount: 2,
    exemptCount: 0,
    exemptNote: null,
    exceeded: false,
  },
  {
    label:
      'Hướng dẫn triển khai thực hiện Quy định đánh giá, xếp loại hằng tháng đối với CBCCVC gắn với KPI',
    catalogItemCode: null,
    coefficient: 1.8,
    plannedQty: 1,
    completedQty: 1,
    reworkQty: 1, // bảng 2.2: 1 nhiệm vụ có sai sót, 2 lần làm lại
    reworkCount: 2,
    lateQty: 1, // bảng 2.3: chậm 1 việc, 1 lần chậm
    lateCount: 1,
    exemptCount: 0,
    exemptNote: null,
    exceeded: false,
  },
  {
    label: 'Phát triển đảng viên theo chỉ tiêu',
    catalogItemCode: null,
    coefficient: 1,
    plannedQty: 3,
    completedQty: 2,
    reworkQty: 0,
    reworkCount: 0,
    lateQty: 0,
    lateCount: 0,
    exemptCount: 0,
    exemptNote: null,
    exceeded: false,
  },
];

/** Thành phần D trong ví dụ: 83,3% = trung bình (100%, 100%, 50%). */
export const HD05_EXAMPLE_D = { D1: 1, D2: 1, D3: 0.5 };
