/**
 * Cấu hình bộ quy tắc DEMO trích từ [QĐ39] (39-QĐ/TU ngày 28/11/2025) và [HD05] (05-HD/TU ngày 16/6/2026).
 * Seed ở trạng thái CHỜ XÁC NHẬN — chỉ người có quyền `ruleset.confirm` mới xác nhận áp dụng.
 *
 * Giá trị KHÔNG có trong văn bản hoặc là cách diễn giải văn bản thành điều kiện máy tính được
 * liệt kê trong `provisionalKeys` và docs/09-cau-hoi-mo.md.
 */
import type { RuleConfig, SourceRef } from '@kpi/shared';

export const QD39_HD05_LEGAL_BASIS =
  'Quy định số 39-QĐ/TU ngày 28/11/2025 của Ban Thường vụ Tỉnh ủy (Điều 10, 11); Hướng dẫn số 05-HD/TU ngày 16/6/2026 của Ban Thường vụ Tỉnh ủy (Mục IV, Phụ lục 2, Phụ lục 3).';

export const QD39_HD05_CONFIG: RuleConfig = {
  scale: { max: 100, generalMax: 30, resultMax: 70 },
  kpiFormulas: {
    LEADER: { components: ['A', 'B', 'C', 'D'], aggregate: 'MEAN' },
    STAFF: { components: ['A', 'B', 'C'], aggregate: 'MEAN' },
  },
  composite: {
    capA: 1,
    qualityDenominator: 'PLANNED',
    timelinessDenominator: 'PLANNED',
    reworkDeductionRate: 0.25,
    lateDeductionRate: 0.25,
  },
  leadershipD: {
    subCriteria: [
      { code: 'D1', label: 'Kết quả hoạt động của cơ quan, tổ chức, đơn vị' },
      { code: 'D2', label: 'Khả năng tổ chức triển khai thực hiện nhiệm vụ' },
      { code: 'D3', label: 'Năng lực tập hợp, đoàn kết công chức thuộc phạm vi quản lý' },
    ],
    allowedLevels: [1, 0.5],
  },
  passFail: { failRatio: 0 },
  targetRatio: { cap: 1, decreaseMethod: 'BASELINE_GAP' },
  qualitativeLevels: [
    {
      code: 'M1',
      label: 'Chủ động tiếp cận, giải quyết hiệu quả vấn đề, có kết quả cụ thể',
      ratio: 1,
    },
    {
      code: 'M2',
      label: 'Cơ bản đáp ứng yêu cầu nhưng còn hạn chế, cần tiếp tục hoàn thiện',
      ratio: 0.5,
    },
    { code: 'M3', label: 'Không đáp ứng yêu cầu nhiệm vụ', ratio: 0 },
  ],
  notApplicable: { policy: 'NOT_ALLOWED' },
  rounding: { decimals: 1, mode: 'HALF_UP' },
  outliers: { maxCompletedOverPlanned: 3 },
  validation: { blockSubmitOnWarnings: false },
  rating: {
    bands: [
      {
        code: 'HTXS',
        label: 'Hoàn thành xuất sắc nhiệm vụ',
        min: 90,
        maxExclusive: null,
        assignOnlyWithinRange: false,
      },
      {
        code: 'HTTNV',
        label: 'Hoàn thành tốt nhiệm vụ',
        min: 70,
        maxExclusive: 90,
        assignOnlyWithinRange: false,
      },
      {
        code: 'HTNV',
        label: 'Hoàn thành nhiệm vụ',
        min: 50,
        maxExclusive: 70,
        assignOnlyWithinRange: false,
      },
      {
        code: 'KHTNV',
        label: 'Không hoàn thành nhiệm vụ',
        min: null,
        maxExclusive: 50,
        assignOnlyWithinRange: true,
      },
    ],
    conditions: [
      {
        rating: 'HTXS',
        appliesTo: ['LEADER', 'STAFF'],
        all: [
          { type: 'metric', metric: 'completionRate', op: '>=', value: 1 },
          { type: 'metric', metric: 'exceededShare', op: '>=', value: 0.3 },
          { type: 'metric', metric: 'lateShare', op: '<=', value: 0 },
          { type: 'noFlag', flag: 'UNRESOLVED_SHORTCOMINGS' },
        ],
        note: '[QĐ39] Đ11 k1 (1.2, 1.3, 1.4): hoàn thành 100% nhiệm vụ, đúng hạn, ít nhất 30% vượt mức; khắc phục 100% hạn chế.',
      },
      {
        rating: 'HTTNV',
        appliesTo: ['LEADER', 'STAFF'],
        all: [
          { type: 'metric', metric: 'completionRate', op: '>=', value: 1 },
          { type: 'metric', metric: 'lateShare', op: '<=', value: 0 },
        ],
        note: '[QĐ39] Đ11 k2 (2.2, 2.3): hoàn thành 100% nhiệm vụ, đúng thời hạn.',
      },
      {
        rating: 'HTNV',
        appliesTo: ['LEADER', 'STAFF'],
        all: [
          { type: 'metric', metric: 'completionRate', op: '>=', value: 1 },
          { type: 'metric', metric: 'lateShare', op: '<=', value: 0.2 },
        ],
        note: '[QĐ39] Đ11 k3 (3.2, 3.3): hoàn thành 100% nhiệm vụ; nhiệm vụ chưa bảo đảm tiến độ không quá 20%.',
      },
    ],
    forced: [
      {
        rating: 'KHTNV',
        anyFlag: [
          'DISCIPLINE',
          'DEGRADATION',
          'UNIT_BELOW_70',
          'LOW_CONFIDENCE',
          'CORRUPTION_IN_SCOPE',
          'MAJORITY_TASKS_FAILED',
        ],
        note: '[QĐ39] Đ11 k4 — trừ trường hợp bất khả kháng / tự phát hiện, khắc phục: cấp có thẩm quyền xem xét.',
      },
    ],
    flags: [
      {
        code: 'DISCIPLINE',
        label: 'Bị xử lý kỷ luật từ khiển trách trở lên do vi phạm liên quan chức trách, nhiệm vụ',
      },
      {
        code: 'DEGRADATION',
        label:
          'Bị kết luận có biểu hiện suy thoái tư tưởng chính trị, đạo đức, lối sống, "tự diễn biến", "tự chuyển hóa"',
      },
      {
        code: 'UNIT_BELOW_70',
        label:
          'Lĩnh vực, đơn vị trực tiếp phụ trách hoàn thành dưới 70% nhiệm vụ (lãnh đạo, quản lý)',
      },
      {
        code: 'LOW_CONFIDENCE',
        label: 'Có trên 50% phiếu tín nhiệm thấp tại kỳ lấy phiếu trong năm (lãnh đạo, quản lý)',
      },
      {
        code: 'CORRUPTION_IN_SCOPE',
        label:
          'Trong phạm vi quản lý trực tiếp xảy ra tham nhũng, lãng phí, tiêu cực bị xử lý kỷ luật',
      },
      {
        code: 'MAJORITY_TASKS_FAILED',
        label: 'Có trên 50% số nhiệm vụ trong năm bị đánh giá không hoàn thành',
      },
      {
        code: 'UNRESOLVED_SHORTCOMINGS',
        label: 'Chưa khắc phục 100% hạn chế, khuyết điểm đã được chỉ ra',
      },
    ],
  },
  annualAggregation: { strategy: 'MANUAL_WITH_REFERENCE' },
  provisionalKeys: [
    'kpiFormulas.STAFF',
    'composite.qualityDenominator',
    'targetRatio',
    'qualitativeLevels.ratio',
    'notApplicable',
    'rounding',
    'outliers',
    'rating.conditions',
    'annualAggregation',
  ],
};

export const QD39_HD05_SOURCE_REFS: SourceRef[] = [
  {
    key: 'scale',
    document: '05-HD/TU',
    location: 'Phụ lục 2 mục 1; Mục IV.1.1, IV.1.2',
    note: 'Tiêu chí chung tối đa 30 điểm, kết quả nhiệm vụ tối đa 70 điểm, thang 100',
  },
  {
    key: 'kpiFormulas.LEADER',
    document: '05-HD/TU',
    location: 'Phụ lục 2 mục 1',
    note: 'Điểm KPI = (A+B+C+D)/4',
  },
  {
    key: 'kpiFormulas.STAFF',
    document: '—',
    note: 'CHƯA CÓ CĂN CỨ: văn bản chỉ nêu công thức cho cán bộ lãnh đạo; tạm dùng (A+B+C)/3 theo quyết định của người dùng (docs/09 #1)',
  },
  {
    key: 'composite.reworkDeductionRate',
    document: '05-HD/TU',
    location: 'Phụ lục 2 chú thích 1',
    note: 'Mỗi lần đánh giá chưa đạt trừ 25% điểm chất lượng (dẫn điểm b khoản 2 Điều 14 NĐ 335/2025/NĐ-CP)',
  },
  {
    key: 'composite.lateDeductionRate',
    document: '05-HD/TU',
    location: 'Phụ lục 2 chú thích 2',
    note: 'Mỗi lần chậm trừ 25% điểm tiến độ (dẫn điểm c khoản 2 Điều 14 NĐ 335/2025/NĐ-CP)',
  },
  {
    key: 'composite.capA',
    document: '05-HD/TU',
    location: 'Phụ lục 2 mục 2 (i)',
    note: 'Hoàn thành 100% → điểm số lượng đạt 100%; vượt mục tiêu ghi nhận ở tiến độ, chất lượng',
  },
  {
    key: 'composite.qualityDenominator',
    document: '05-HD/TU',
    location: 'Phụ lục 2 bảng 2.2',
    note: 'CẦN XÁC NHẬN: công thức ghi (11)/(7) nhưng số trong ví dụ (90,3% = 10,65/11,8) là chia cho cột (9); tổng cột (9), (11) trong ví dụ lệch 1,0 so với các dòng (docs/09)',
  },
  {
    key: 'composite.timelinessDenominator',
    document: '05-HD/TU',
    location: 'Phụ lục 2 bảng 2.3',
    note: '(11)/(7) — số liệu ví dụ khớp (8,1/12,8 = 63,3%)',
  },
  {
    key: 'leadershipD',
    document: '05-HD/TU',
    location: 'Phụ lục 2 mục 2.4',
    note: '3 tiêu chí, mỗi tiêu chí 100% hoặc 50% (theo khoản 3, 4 Điều 16 NĐ 335/2025/NĐ-CP)',
  },
  {
    key: 'passFail',
    document: '05-HD/TU',
    location: 'Phụ lục 3 mục A',
    note: 'Chấm tối đa nếu đảm bảo, 0 điểm nếu không đảm bảo',
  },
  {
    key: 'qualitativeLevels',
    document: '05-HD/TU',
    location: 'Mục IV.1.2',
    note: '03 mức đáp ứng yêu cầu — TỶ LỆ điểm từng mức CHƯA CÓ CĂN CỨ',
  },
  {
    key: 'rating.bands',
    document: '39-QĐ/TU',
    location: 'Điều 11 (tr. 10–12)',
    note: '≥90 HTXS; 70–<90 HTTNV; 50–<70 HTNV; <50 KHTNV',
  },
  {
    key: 'rating.conditions',
    document: '39-QĐ/TU',
    location: 'Điều 11 khoản 1–3',
    note: 'CẦN XÁC NHẬN cách chuyển điều kiện bằng lời thành chỉ số (tỷ lệ hoàn thành, vượt mức, chậm tiến độ)',
  },
  {
    key: 'rating.bands.assignOnlyWithinRange',
    document: '39-QĐ/TU',
    location: 'Điều 11 khoản 4',
    note: '"Không hoàn thành nhiệm vụ" chỉ khi dưới 50 điểm hoặc thuộc các trường hợp tại khoản 4 — không dùng làm mức rơi xuống khi thiếu điều kiện mức trên',
  },
  {
    key: 'rating.forced',
    document: '39-QĐ/TU',
    location: 'Điều 11 khoản 4 (tr. 12–13)',
    note: 'Các trường hợp xếp "Không hoàn thành nhiệm vụ"',
  },
];
