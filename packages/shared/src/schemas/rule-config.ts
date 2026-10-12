/**
 * Cấu hình bộ quy tắc tính điểm, xếp loại (rule_set_versions.config) — docs/07-tieu-chi-va-tinh-diem.md.
 *
 * NGUYÊN TẮC: mọi con số nghiệp vụ nằm ở đây, KHÔNG viết cứng trong engine.
 * Giá trị không có căn cứ văn bản phải được liệt kê trong `provisionalKeys` để giao diện cảnh báo.
 */
import { z } from 'zod';

export const KPI_COMPONENTS = ['A', 'B', 'C', 'D'] as const;
export type KpiComponent = (typeof KPI_COMPONENTS)[number];

export const KPI_COMPONENT_LABELS: Record<KpiComponent, string> = {
  A: 'Số lượng',
  B: 'Chất lượng',
  C: 'Tiến độ',
  D: 'Lãnh đạo, chỉ đạo, điều hành',
};

/** Nhóm đối tượng áp dụng điều kiện xếp loại ([QĐ39] Điều 11 phân biệt 3 nhóm). */
export const RATING_SUBJECTS = ['LEADER', 'STAFF', 'COLLECTIVE'] as const;
export type RatingSubject = (typeof RATING_SUBJECTS)[number];

/** Chỉ số tính được từ dữ liệu nhiệm vụ (dòng KPI tổng hợp) — dùng trong điều kiện xếp loại. */
export const RATING_METRICS = [
  'totalScore',
  'completionRate',
  'exceededShare',
  'lateShare',
  'failedShare',
] as const;
export type RatingMetric = (typeof RATING_METRICS)[number];

export const RATING_METRIC_LABELS: Record<RatingMetric, string> = {
  totalScore: 'Tổng điểm',
  completionRate: 'Tỷ lệ nhiệm vụ hoàn thành',
  exceededShare: 'Tỷ lệ nhiệm vụ vượt mức yêu cầu',
  lateShare: 'Tỷ lệ nhiệm vụ chậm tiến độ',
  failedShare: 'Tỷ lệ nhiệm vụ không hoàn thành',
};

const ratio = z.number().min(0).max(10);
const code = z.string().trim().min(1).max(50);

const kpiFormula = z
  .object({
    components: z.array(z.enum(KPI_COMPONENTS)).min(1, 'Công thức KPI cần ít nhất 1 thành phần'),
    aggregate: z.enum(['MEAN', 'WEIGHTED']),
    weights: z.partialRecord(z.enum(KPI_COMPONENTS), z.number().positive()).optional(),
  })
  .superRefine((f, ctx) => {
    if (new Set(f.components).size !== f.components.length) {
      ctx.addIssue({ code: 'custom', message: 'Thành phần KPI bị trùng' });
    }
    if (f.aggregate === 'WEIGHTED') {
      for (const c of f.components) {
        if (!f.weights?.[c]) {
          ctx.addIssue({
            code: 'custom',
            path: ['weights', c],
            message: `Thiếu trọng số cho thành phần ${c}`,
          });
        }
      }
    }
  });

const ratingCondition = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('metric'),
    metric: z.enum(RATING_METRICS),
    op: z.enum(['>=', '>', '<=', '<', '==']),
    value: z.number(),
  }),
  z.object({ type: z.literal('noFlag'), flag: code }),
]);
export type RatingCondition = z.infer<typeof ratingCondition>;

const ratingBand = z.object({
  code,
  label: z.string().min(1).max(200),
  /** Điểm tối thiểu (bao gồm); null = không giới hạn dưới. */
  min: z.number().nullable(),
  /** Điểm tối đa (không bao gồm); null = không giới hạn trên. */
  maxExclusive: z.number().nullable(),
  /**
   * true = chỉ xếp mức này khi tổng điểm nằm trong khoảng của mức (hoặc do trường hợp bắt buộc),
   * KHÔNG dùng làm mức "rơi xuống" khi không đạt điều kiện mức cao hơn.
   */
  assignOnlyWithinRange: z.boolean(),
});

export const ruleConfigSchema = z
  .object({
    scale: z.object({
      max: z.number().positive(),
      generalMax: z.number().min(0),
      resultMax: z.number().min(0),
    }),
    /** Công thức KPI của trục kết quả theo nhóm đối tượng. */
    kpiFormulas: z.object({ LEADER: kpiFormula, STAFF: kpiFormula }),
    /** Phương pháp KPI tổng hợp theo danh mục sản phẩm/công việc ([HD05] Phụ lục 2). */
    composite: z.object({
      /** Trần của A (tỷ lệ số lượng); null = không giới hạn. */
      capA: z.number().positive().nullable(),
      /** Mẫu số của B: PLANNED = Σ số lượng quy đổi theo kế hoạch (cột 7); COMPLETED = Σ thực tế quy đổi (cột 9). */
      qualityDenominator: z.enum(['PLANNED', 'COMPLETED']),
      timelinessDenominator: z.enum(['PLANNED', 'COMPLETED']),
      /** Mức trừ mỗi lần làm lại / chậm tiến độ (0,25 = 25%). */
      reworkDeductionRate: ratio,
      lateDeductionRate: ratio,
    }),
    /** Thành phần D — năng lực lãnh đạo, chỉ đạo, điều hành. */
    leadershipD: z.object({
      subCriteria: z.array(z.object({ code, label: z.string().min(1) })).min(1),
      allowedLevels: z.array(ratio).min(1),
    }),
    /** Tiêu chí "đảm bảo / không đảm bảo": tỷ lệ điểm khi không đảm bảo. */
    passFail: z.object({ failRatio: ratio }),
    /** Chỉ tiêu định lượng so với mục tiêu. */
    targetRatio: z.object({
      /** Trần tỷ lệ đạt; null = không giới hạn (vượt mục tiêu được tính thêm). */
      cap: z.number().positive().nullable(),
      decreaseMethod: z.enum(['TARGET_OVER_ACTUAL', 'BASELINE_GAP']),
    }),
    /** Đánh giá định tính theo mức (ví dụ 3 mức đáp ứng yêu cầu của [HD05]). */
    qualitativeLevels: z.array(z.object({ code, label: z.string().min(1), ratio })).min(1),
    notApplicable: z.object({ policy: z.enum(['NOT_ALLOWED', 'EXCLUDE_AND_RESCALE']) }),
    rounding: z.object({
      decimals: z.number().int().min(0).max(4),
      mode: z.enum(['HALF_UP', 'HALF_EVEN', 'DOWN']),
    }),
    outliers: z.object({
      /** Cảnh báo khi số lượng hoàn thành vượt N lần kế hoạch. */
      maxCompletedOverPlanned: z.number().positive(),
    }),
    validation: z.object({ blockSubmitOnWarnings: z.boolean() }),
    rating: z.object({
      /** Các mức xếp loại, sắp xếp từ CAO xuống THẤP. */
      bands: z.array(ratingBand).min(1),
      /** Điều kiện kèm theo của từng mức, theo nhóm đối tượng. */
      conditions: z.array(
        z.object({
          rating: code,
          appliesTo: z.array(z.enum(RATING_SUBJECTS)).min(1),
          all: z.array(ratingCondition),
          note: z.string().max(500).optional(),
        }),
      ),
      /** Mức bắt buộc khi có cờ vi phạm (ví dụ bị kỷ luật). */
      forced: z.array(
        z.object({
          rating: code,
          anyFlag: z.array(code).min(1),
          note: z.string().max(500).optional(),
        }),
      ),
      /** Danh mục cờ do người thẩm định ghi nhận. */
      flags: z.array(z.object({ code, label: z.string().min(1) })),
    }),
    annualAggregation: z.object({
      strategy: z.enum(['MANUAL_WITH_REFERENCE', 'WEIGHTED_AVERAGE']),
      weights: z.record(z.string(), z.number().positive()).optional(),
    }),
    /** Đường dẫn các khóa cấu hình CHƯA có căn cứ văn bản (hiển thị cảnh báo "chờ xác nhận"). */
    provisionalKeys: z.array(z.string()),
  })
  .superRefine((c, ctx) => {
    if (Math.abs(c.scale.generalMax + c.scale.resultMax - c.scale.max) > 1e-9) {
      ctx.addIssue({
        code: 'custom',
        path: ['scale'],
        message: 'Điểm tiêu chí chung + điểm kết quả nhiệm vụ phải bằng thang điểm tối đa',
      });
    }
    const bandCodes = new Set(c.rating.bands.map((b) => b.code));
    if (bandCodes.size !== c.rating.bands.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['rating', 'bands'],
        message: 'Mã mức xếp loại bị trùng',
      });
    }
    const flagCodes = new Set(c.rating.flags.map((f) => f.code));
    c.rating.conditions.forEach((cond, i) => {
      if (!bandCodes.has(cond.rating)) {
        ctx.addIssue({
          code: 'custom',
          path: ['rating', 'conditions', i, 'rating'],
          message: `Mức "${cond.rating}" không có trong danh sách mức xếp loại`,
        });
      }
      cond.all.forEach((x, j) => {
        if (x.type === 'noFlag' && !flagCodes.has(x.flag)) {
          ctx.addIssue({
            code: 'custom',
            path: ['rating', 'conditions', i, 'all', j],
            message: `Cờ "${x.flag}" chưa khai báo`,
          });
        }
      });
    });
    c.rating.forced.forEach((f, i) => {
      if (!bandCodes.has(f.rating)) {
        ctx.addIssue({
          code: 'custom',
          path: ['rating', 'forced', i],
          message: `Mức "${f.rating}" không tồn tại`,
        });
      }
      for (const flag of f.anyFlag) {
        if (!flagCodes.has(flag)) {
          ctx.addIssue({
            code: 'custom',
            path: ['rating', 'forced', i],
            message: `Cờ "${flag}" chưa khai báo`,
          });
        }
      }
    });
    if (c.annualAggregation.strategy === 'WEIGHTED_AVERAGE' && !c.annualAggregation.weights) {
      ctx.addIssue({
        code: 'custom',
        path: ['annualAggregation', 'weights'],
        message: 'Cần khai báo trọng số các kỳ',
      });
    }
  });

export type RuleConfig = z.infer<typeof ruleConfigSchema>;

/** Nguồn căn cứ cho từng khóa cấu hình (hiển thị cạnh giá trị). */
export const sourceRefsSchema = z.array(
  z.object({
    key: z.string().min(1).max(200),
    document: z.string().min(1).max(200),
    location: z.string().max(200).optional(),
    note: z.string().max(1000).optional(),
  }),
);
export type SourceRef = z.infer<typeof sourceRefsSchema>[number];
