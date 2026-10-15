/**
 * Schema KPI/OKR: kỳ đánh giá, bộ quy tắc, bộ tiêu chí (có phiên bản), dữ liệu chấm điểm, mục tiêu/kết quả then chốt.
 * Thiết kế: docs/03-database.md, docs/07-tieu-chi-va-tinh-diem.md.
 */
import { z } from 'zod';
import { KPI_PROFILES, PERIOD_STATUSES, PERIOD_TYPES } from '../enums.js';
import {
  codeField,
  dateOnly,
  optionalText,
  optionalUuid,
  requiredText,
  uuid,
  versionField,
} from './common.js';
import { ruleConfigSchema, sourceRefsSchema } from './rule-config.js';

// ------------------------------------------------------------------ Danh mục enum
export const CONFIG_STATUSES = ['DRAFT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'RETIRED'] as const;
export type ConfigStatus = (typeof CONFIG_STATUSES)[number];
export const CONFIG_STATUS_LABELS: Record<ConfigStatus, string> = {
  DRAFT: 'Bản nháp',
  PENDING_CONFIRMATION: 'Chờ xác nhận',
  CONFIRMED: 'Đã xác nhận áp dụng',
  RETIRED: 'Ngừng áp dụng',
};

export const APPROVAL_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'RETIRED'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];
export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  DRAFT: 'Bản nháp',
  SUBMITTED: 'Chờ phê duyệt',
  APPROVED: 'Đã phê duyệt',
  RETIRED: 'Ngừng áp dụng',
};

export const CRITERIA_ITEM_KINDS = [
  'GENERAL_GROUP',
  'GENERAL_ITEM',
  'AXIS',
  'AXIS_INDICATOR',
] as const;
export type CriteriaItemKind = (typeof CRITERIA_ITEM_KINDS)[number];
export const CRITERIA_ITEM_KIND_LABELS: Record<CriteriaItemKind, string> = {
  GENERAL_GROUP: 'Nhóm tiêu chí chung',
  GENERAL_ITEM: 'Tiêu chí chung',
  AXIS: 'Trục kết quả nhiệm vụ',
  AXIS_INDICATOR: 'Chỉ tiêu thuộc trục (KPI/KR)',
};

export const SCORING_METHODS = [
  'PASS_FAIL',
  'MANUAL_SCORE',
  'QUALITATIVE_LEVEL',
  'TARGET_RATIO',
  'KPI_COMPOSITE',
  'WEIGHTED_INDICATORS',
] as const;
export type ScoringMethod = (typeof SCORING_METHODS)[number];
export const SCORING_METHOD_LABELS: Record<ScoringMethod, string> = {
  PASS_FAIL: 'Đảm bảo / không đảm bảo',
  MANUAL_SCORE: 'Chấm điểm trực tiếp',
  QUALITATIVE_LEVEL: 'Định tính theo mức',
  TARGET_RATIO: 'So với mục tiêu (định lượng)',
  KPI_COMPOSITE: 'KPI tổng hợp (số lượng, chất lượng, tiến độ, lãnh đạo)',
  WEIGHTED_INDICATORS: 'Trọng số các chỉ tiêu con',
};

/** Phương pháp hợp lệ theo loại mục. */
export const METHODS_BY_KIND: Record<CriteriaItemKind, readonly ScoringMethod[]> = {
  GENERAL_GROUP: [],
  GENERAL_ITEM: ['PASS_FAIL', 'MANUAL_SCORE', 'QUALITATIVE_LEVEL'],
  AXIS: ['KPI_COMPOSITE', 'WEIGHTED_INDICATORS', 'MANUAL_SCORE'],
  AXIS_INDICATOR: ['TARGET_RATIO', 'PASS_FAIL', 'QUALITATIVE_LEVEL', 'MANUAL_SCORE'],
};

export const MEASURE_DIRECTIONS = ['INCREASE', 'DECREASE'] as const;
export type MeasureDirection = (typeof MEASURE_DIRECTIONS)[number];
export const MEASURE_DIRECTION_LABELS: Record<MeasureDirection, string> = {
  INCREASE: 'Càng cao càng tốt',
  DECREASE: 'Càng thấp càng tốt',
};

export const SUBJECT_KINDS = ['EMPLOYEE', 'UNIT'] as const;
export type SubjectKind = (typeof SUBJECT_KINDS)[number];

// ------------------------------------------------------------------ Kỳ đánh giá
export const generateYearSchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
});

export const updatePeriodSchema = z.object({
  name: requiredText('Tên kỳ', 100),
  isRated: z.boolean(),
  selfDeadline: dateOnly.nullish().or(z.literal('').transform(() => null)),
  reviewDeadline: dateOnly.nullish().or(z.literal('').transform(() => null)),
  submitDeadline: dateOnly.nullish().or(z.literal('').transform(() => null)),
  version: versionField,
});
export type UpdatePeriodInput = z.infer<typeof updatePeriodSchema>;

export const periodTransitionSchema = z.object({
  to: z.enum(PERIOD_STATUSES),
  version: versionField,
});

export const periodListQuerySchema = z.object({
  year: z.coerce.number().int().optional(),
  type: z.enum(PERIOD_TYPES).optional(),
});

// ------------------------------------------------------------------ Bộ quy tắc
export const createRuleSetSchema = z.object({
  code: codeField('Mã bộ quy tắc'),
  name: requiredText('Tên bộ quy tắc', 200),
  description: optionalText('Mô tả', 2000),
});
export type CreateRuleSetInput = z.infer<typeof createRuleSetSchema>;

export const createRuleSetVersionSchema = z.object({ cloneFromVersionId: optionalUuid });

export const updateRuleSetVersionSchema = z.object({
  config: ruleConfigSchema,
  legalBasis: requiredText('Căn cứ văn bản', 2000),
  sourceRefs: sourceRefsSchema.default([]),
  effectiveFrom: dateOnly.nullish(),
  version: versionField,
});
export type UpdateRuleSetVersionInput = z.infer<typeof updateRuleSetVersionSchema>;

export const decisionSchema = z.object({
  note: requiredText('Ý kiến / căn cứ quyết định', 2000),
  version: versionField,
});
export type DecisionInput = z.infer<typeof decisionSchema>;

// ------------------------------------------------------------------ Bộ tiêu chí
export const createCriteriaSetSchema = z.object({
  code: codeField('Mã bộ tiêu chí'),
  name: requiredText('Tên bộ tiêu chí', 300),
  kpiProfile: z.enum(KPI_PROFILES, { error: 'Nhóm đối tượng không hợp lệ' }),
  jobPositionId: optionalUuid,
  description: optionalText('Mô tả', 2000),
});
export type CreateCriteriaSetInput = z.infer<typeof createCriteriaSetSchema>;

export const catalogItemsQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  groupCode: z.string().max(10).optional(),
  /** Danh mục theo VTVL của cán bộ này (phiếu chấm, giao nhiệm vụ). */
  employeeId: uuid.optional(),
  /** mine (mặc định): theo VTVL của người dùng; all: toàn bộ (cần quyền). */
  scope: z.enum(['mine', 'all']).default('mine'),
});
export type CatalogItemsQuery = z.infer<typeof catalogItemsQuerySchema>;

export const assignJobPositionItemsSchema = z.object({
  itemCodes: z.array(z.string().trim().min(1).max(50)).max(500),
});
export type AssignJobPositionItemsInput = z.infer<typeof assignJobPositionItemsSchema>;

export const createCriteriaVersionSchema = z.object({ cloneFromVersionId: optionalUuid });

const optionalNumber = z
  .union([z.number(), z.string().trim()])
  .transform((v, ctx) => {
    if (v === '' || v === null) return null;
    const n = typeof v === 'number' ? v : Number(v.replace(',', '.'));
    if (!Number.isFinite(n)) {
      ctx.addIssue({ code: 'custom', message: 'Phải là số' });
      return z.NEVER;
    }
    return n;
  })
  .nullish();

export const criteriaItemInputSchema = z.object({
  /** Mã tạm phía giao diện để tham chiếu cha–con khi lưu cả cây. */
  key: z.string().min(1).max(60),
  parentKey: z.string().max(60).nullish(),
  kind: z.enum(CRITERIA_ITEM_KINDS),
  code: codeField('Mã mục', 50),
  name: requiredText('Tên tiêu chí', 1000),
  description: optionalText('Mô tả', 4000),
  maxPoints: z.coerce
    .number({ error: 'Điểm tối đa phải là số' })
    .min(0, 'Điểm tối đa không âm')
    .max(1000),
  weight: optionalNumber,
  scoringMethod: z.enum(SCORING_METHODS).nullish(),
  measureUnit: optionalText('Đơn vị đo', 100),
  direction: z.enum(MEASURE_DIRECTIONS).nullish(),
  target: optionalNumber,
  baseline: optionalNumber,
  allowNotApplicable: z.boolean().default(false),
  evidenceRequired: z.boolean().default(false),
  dataSource: optionalText('Nguồn dữ liệu', 500),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});
export type CriteriaItemInput = z.infer<typeof criteriaItemInputSchema>;

export const saveCriteriaItemsSchema = z.object({
  generalMax: z.coerce.number().min(0).max(1000),
  resultMax: z.coerce.number().min(0).max(1000),
  periodTypes: z.array(z.enum(PERIOD_TYPES)).min(1, 'Chọn ít nhất một loại kỳ áp dụng'),
  ruleSetVersionId: optionalUuid,
  workCatalogVersionId: optionalUuid,
  changeNote: optionalText('Ghi chú thay đổi', 2000),
  items: z.array(criteriaItemInputSchema).max(500),
  version: versionField,
});
export type SaveCriteriaItemsInput = z.infer<typeof saveCriteriaItemsSchema>;

// ------------------------------------------------------------------ Dữ liệu chấm điểm (input của từng mục)
const nonNegative = z.coerce.number({ error: 'Phải là số' }).min(0, 'Không được âm');

/** Một dòng sản phẩm/công việc trong phương pháp KPI tổng hợp ([HD05] PL2 bảng 1, 2.2, 2.3). */
export const compositeRowSchema = z.object({
  label: requiredText('Tên nhiệm vụ', 500),
  catalogItemCode: z.string().max(50).nullish(),
  coefficient: z.coerce
    .number({ error: 'Hệ số phải là số' })
    .positive('Hệ số phải lớn hơn 0')
    .max(100),
  plannedQty: nonNegative,
  completedQty: nonNegative,
  /** Số lượng hoàn thành có sai sót phải làm lại và số lần làm lại (không tính lần được miễn trừ). */
  reworkQty: nonNegative.default(0),
  reworkCount: nonNegative.default(0),
  /** Số lượng hoàn thành chậm tiến độ và số lần chậm (không tính lần được miễn trừ). */
  lateQty: nonNegative.default(0),
  lateCount: nonNegative.default(0),
  /** Số lần được miễn trừ do nguyên nhân khách quan (chỉ lưu vết, không trừ điểm). */
  exemptCount: nonNegative.default(0),
  exemptNote: optionalText('Căn cứ miễn trừ', 1000),
  exceeded: z.boolean().default(false),
  /** Dòng do cấp trên giao (docs/06 §5.6): cán bộ không sửa tên, mã danh mục, hệ số, số lượng kế hoạch. */
  assigned: z.boolean().optional(),
});
export type CompositeRow = z.infer<typeof compositeRowSchema>;

export const itemInputSchema = z.object({
  notApplicable: z.boolean().optional(),
  naReason: optionalText('Lý do không áp dụng', 1000),
  passed: z.boolean().optional(),
  points: z.coerce.number().min(0).optional(),
  level: z.string().max(50).optional(),
  actual: z.coerce.number().optional(),
  rows: z.array(compositeRowSchema).max(200).optional(),
  /** Thành phần D: mã tiêu chí con → tỷ lệ (ví dụ 1 hoặc 0,5). */
  dScores: z.record(z.string(), z.coerce.number().min(0).max(10)).optional(),
});
export type ItemInput = z.infer<typeof itemInputSchema>;

export const saveEvaluationInputsSchema = z.object({
  items: z
    .array(
      z.object({
        criteriaItemId: uuid,
        input: itemInputSchema,
        note: optionalText('Ghi chú', 4000),
      }),
    )
    .max(500),
  /** Cờ điều kiện xếp loại (chỉ người thẩm định ghi nhận). */
  flags: z.array(z.string().max(50)).max(50).optional(),
  version: versionField,
});
export type SaveEvaluationInputs = z.infer<typeof saveEvaluationInputsSchema>;

export const createEvaluationSchema = z.object({
  periodId: uuid,
  employeeId: uuid,
  criteriaVersionId: optionalUuid,
});
export type CreateEvaluationInput = z.infer<typeof createEvaluationSchema>;

export const generateEvaluationsSchema = z.object({ periodId: uuid, unitId: optionalUuid });

/** Một dòng nhiệm vụ cấp trên giao: chỉ phần kế hoạch (cán bộ tự nhập phần thực hiện). */
export const assignedTaskRowSchema = compositeRowSchema.pick({
  label: true,
  catalogItemCode: true,
  coefficient: true,
  plannedQty: true,
});
export type AssignedTaskRow = z.infer<typeof assignedTaskRowSchema>;

export const assignTasksSchema = z.object({
  items: z
    .array(
      z.object({
        criteriaItemId: uuid,
        rows: z.array(assignedTaskRowSchema).max(200),
      }),
    )
    .min(1, 'Chưa có mục nào để giao nhiệm vụ')
    .max(50),
  version: versionField,
});
export type AssignTasksInput = z.infer<typeof assignTasksSchema>;

export const evaluationActionSchema = z.object({
  comment: optionalText('Ý kiến', 4000),
  version: versionField,
});
export const evaluationReasonSchema = z.object({
  reason: requiredText('Lý do', 4000),
  version: versionField,
});
export const approveEvaluationSchema = z.object({
  finalRating: z.string().min(1, 'Chọn mức xếp loại').max(50),
  overrideReason: optionalText('Lý do chọn mức khác đề xuất', 4000),
  comment: optionalText('Ý kiến phê duyệt', 4000),
  version: versionField,
});
export type ApproveEvaluationInput = z.infer<typeof approveEvaluationSchema>;

export const calculateSchema = z.object({ layer: z.enum(['self', 'review']) });

export const evaluationListQuerySchema = z.object({
  periodId: uuid.optional(),
  unitId: uuid.optional(),
  status: z.string().max(30).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => v || undefined),
});
export type EvaluationListQuery = z.infer<typeof evaluationListQuerySchema>;

// ------------------------------------------------------------------ OKR / KPI chỉ tiêu
export const OBJECTIVE_STATUSES = ['DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED'] as const;
export type ObjectiveStatus = (typeof OBJECTIVE_STATUSES)[number];
export const OBJECTIVE_STATUS_LABELS: Record<ObjectiveStatus, string> = {
  DRAFT: 'Bản nháp',
  ACTIVE: 'Đang thực hiện',
  COMPLETED: 'Hoàn thành',
  CANCELLED: 'Đã hủy',
};

export const KEY_RESULT_KINDS = ['KR', 'KPI'] as const;
export const MEASURE_TYPES = ['NUMBER', 'PERCENT', 'BOOLEAN', 'MILESTONE'] as const;
export type MeasureType = (typeof MEASURE_TYPES)[number];
export const MEASURE_TYPE_LABELS: Record<MeasureType, string> = {
  NUMBER: 'Số lượng',
  PERCENT: 'Tỷ lệ %',
  BOOLEAN: 'Đạt / không đạt',
  MILESTONE: 'Mốc tiến độ',
};

export const createObjectiveSchema = z
  .object({
    periodId: uuid,
    ownerKind: z.enum(SUBJECT_KINDS),
    ownerEmployeeId: optionalUuid,
    ownerUnitId: optionalUuid,
    parentObjectiveId: optionalUuid,
    code: codeField('Mã mục tiêu', 50),
    title: requiredText('Mục tiêu', 1000),
    description: optionalText('Mô tả', 4000),
  })
  .superRefine((v, ctx) => {
    if (v.ownerKind === 'EMPLOYEE' && !v.ownerEmployeeId) {
      ctx.addIssue({ code: 'custom', path: ['ownerEmployeeId'], message: 'Chọn cán bộ phụ trách' });
    }
    if (v.ownerKind === 'UNIT' && !v.ownerUnitId) {
      ctx.addIssue({ code: 'custom', path: ['ownerUnitId'], message: 'Chọn đơn vị phụ trách' });
    }
  });
export type CreateObjectiveInput = z.infer<typeof createObjectiveSchema>;

export const updateObjectiveSchema = z.object({
  title: requiredText('Mục tiêu', 1000),
  description: optionalText('Mô tả', 4000),
  status: z.enum(OBJECTIVE_STATUSES),
  version: versionField,
});
export type UpdateObjectiveInput = z.infer<typeof updateObjectiveSchema>;

export const keyResultSchema = z
  .object({
    code: codeField('Mã KR', 50),
    title: requiredText('Kết quả then chốt', 1000),
    kind: z.enum(KEY_RESULT_KINDS).default('KR'),
    measureType: z.enum(MEASURE_TYPES),
    direction: z.enum(MEASURE_DIRECTIONS).default('INCREASE'),
    measureUnit: optionalText('Đơn vị đo', 100),
    baseline: optionalNumber,
    target: z.coerce.number({ error: 'Mục tiêu phải là số' }),
    weight: optionalNumber,
    dueDate: dateOnly.nullish().or(z.literal('').transform(() => null)),
  })
  .superRefine((v, ctx) => {
    if (v.direction === 'DECREASE' && v.measureType !== 'BOOLEAN' && v.baseline == null) {
      ctx.addIssue({
        code: 'custom',
        path: ['baseline'],
        message: 'Chỉ tiêu giảm cần giá trị ban đầu (baseline)',
      });
    }
    if (v.weight != null && (v.weight <= 0 || v.weight > 100)) {
      ctx.addIssue({ code: 'custom', path: ['weight'], message: 'Trọng số trong khoảng (0, 100]' });
    }
  });
export type KeyResultInput = z.infer<typeof keyResultSchema>;
export const updateKeyResultSchema = keyResultSchema.safeExtend({ version: versionField });

export const checkinSchema = z.object({
  value: z.coerce.number({ error: 'Giá trị phải là số' }),
  note: optionalText('Ghi chú', 2000),
});

export const objectiveListQuerySchema = z.object({
  periodId: uuid.optional(),
  ownerEmployeeId: uuid.optional(),
  ownerUnitId: uuid.optional(),
});
