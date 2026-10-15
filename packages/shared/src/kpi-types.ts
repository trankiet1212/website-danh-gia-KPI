/** DTO cho module KPI/OKR và kết quả engine tính điểm. Số liệu thập phân trả về dạng number. */
import type { KpiProfile, PeriodStatus, PeriodType } from './enums.js';
import type { RuleConfig, SourceRef } from './schemas/rule-config.js';
import type {
  ApprovalStatus,
  ConfigStatus,
  CriteriaItemKind,
  MeasureDirection,
  MeasureType,
  ObjectiveStatus,
  ScoringMethod,
  SubjectKind,
} from './schemas/kpi.js';

export interface PeriodDto {
  id: string;
  code: string;
  name: string;
  type: PeriodType;
  year: number;
  seq: number;
  startDate: string;
  endDate: string;
  parentId: string | null;
  status: PeriodStatus;
  isRated: boolean;
  selfDeadline: string | null;
  reviewDeadline: string | null;
  submitDeadline: string | null;
  isDemo: boolean;
  evaluationCount: number;
  version: number;
}

export interface RuleSetVersionDto {
  id: string;
  ruleSetId: string;
  versionNo: number;
  status: ConfigStatus;
  config: RuleConfig;
  legalBasis: string;
  sourceRefs: SourceRef[];
  effectiveFrom: string | null;
  checksum: string;
  createdBy: string | null;
  confirmedBy: string | null;
  confirmedAt: string | null;
  confirmNote: string | null;
  createdAt: string;
  version: number;
}

export interface RuleSetDto {
  id: string;
  code: string;
  name: string;
  description: string | null;
  versions: Omit<RuleSetVersionDto, 'config' | 'sourceRefs'>[];
}

export interface CatalogItemDto {
  id: string;
  code: string;
  groupCode: string;
  name: string;
  product: string | null;
  complexityLevel: number;
  maxHoursText: string | null;
  points: number;
  coefficient: number;
  note: string | null;
}

/** Vị trí việc làm và các mã sản phẩm/công việc được phân (docs/05 "Danh mục theo vị trí việc làm"). */
export interface JobPositionWorkItemsDto {
  jobPosition: { id: string; code: string; name: string; group: string };
  itemCodes: string[];
  employeeCount: number;
}

export interface MyJobPositionDto {
  jobPosition: { id: string; code: string; name: string; group: string } | null;
}

export interface CatalogVersionDto {
  id: string;
  catalogCode: string;
  catalogName: string;
  versionNo: number;
  status: ApprovalStatus;
  standardPoints: number;
  legalBasis: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  itemCount: number;
  version: number;
}

export interface CriteriaItemDto {
  id: string;
  parentId: string | null;
  kind: CriteriaItemKind;
  code: string;
  name: string;
  description: string | null;
  maxPoints: number;
  weight: number | null;
  scoringMethod: ScoringMethod | null;
  measureUnit: string | null;
  direction: MeasureDirection | null;
  target: number | null;
  baseline: number | null;
  allowNotApplicable: boolean;
  evidenceRequired: boolean;
  dataSource: string | null;
  sortOrder: number;
}

export interface ValidationIssue {
  level: 'error' | 'warning';
  code: string;
  message: string;
  itemCode?: string;
}

export interface CriteriaVersionDto {
  id: string;
  criteriaSetId: string;
  criteriaSetCode: string;
  criteriaSetName: string;
  kpiProfile: KpiProfile;
  versionNo: number;
  status: ApprovalStatus;
  periodTypes: PeriodType[];
  generalMax: number;
  resultMax: number;
  ruleSetVersionId: string | null;
  ruleSetVersionLabel: string | null;
  workCatalogVersionId: string | null;
  changeNote: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  version: number;
  items: CriteriaItemDto[];
  issues: ValidationIssue[];
}

export interface CriteriaSetDto {
  id: string;
  code: string;
  name: string;
  kpiProfile: KpiProfile;
  jobPosition: { id: string; name: string } | null;
  description: string | null;
  versions: Omit<CriteriaVersionDto, 'items' | 'issues'>[];
}

// ------------------------------------------------------------------ Kết quả engine tính điểm
export interface ExplainedNumber {
  value: number | null;
  formula: string;
}

export interface CompositeRowResult {
  label: string;
  coefficient: number;
  plannedConverted: number;
  completedConverted: number;
  qualityConverted: number;
  timelinessConverted: number;
}

export interface ItemScore {
  criteriaItemId: string;
  code: string;
  name: string;
  kind: CriteriaItemKind;
  method: ScoringMethod | null;
  maxPoints: number;
  /** Tỷ lệ đạt (0..cap); null nếu thiếu dữ liệu hoặc không áp dụng. */
  ratio: number | null;
  points: number | null;
  notApplicable: boolean;
  steps: string[];
  components?: Partial<Record<'A' | 'B' | 'C' | 'D', ExplainedNumber>>;
  rows?: CompositeRowResult[];
  children?: ItemScore[];
}

export interface ScoreIssue {
  level: 'error' | 'warning';
  code: string;
  message: string;
  itemCode?: string;
}

export interface RatingResult {
  /** Mức đề xuất theo điểm + điều kiện; null nếu không xác định được. */
  eligible: string | null;
  eligibleLabel: string | null;
  /** true nếu bộ quy tắc chưa được xác nhận hoặc điều kiện có giá trị tạm. */
  provisional: boolean;
  steps: string[];
}

export interface ScoreResult {
  engineVersion: string;
  complete: boolean;
  profile: KpiProfile;
  general: { score: number; max: number; items: ItemScore[] };
  result: { score: number; max: number; items: ItemScore[] };
  total: number;
  totalRounded: number;
  metrics: Partial<
    Record<'completionRate' | 'exceededShare' | 'lateShare' | 'failedShare', number>
  > & {
    rowCount: number;
  };
  rating: RatingResult;
  issues: ScoreIssue[];
  explanation: string[];
}

// ------------------------------------------------------------------ Hồ sơ đánh giá
export const EVALUATION_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'REVIEWED',
  'APPROVED',
  'RETURNED',
  'REOPENED',
  'CANCELLED',
] as const;
export type EvaluationStatus = (typeof EVALUATION_STATUSES)[number];
export const EVALUATION_STATUS_LABELS: Record<EvaluationStatus, string> = {
  DRAFT: 'Đang tự đánh giá',
  SUBMITTED: 'Đã nộp, chờ thẩm định',
  UNDER_REVIEW: 'Đang thẩm định',
  REVIEWED: 'Đã thẩm định, chờ phê duyệt',
  APPROVED: 'Đã phê duyệt',
  RETURNED: 'Bị trả lại',
  REOPENED: 'Đã mở lại',
  CANCELLED: 'Đã hủy',
};

export interface EvaluationListItem {
  id: string;
  period: { id: string; code: string; name: string };
  subjectKind: SubjectKind;
  employee: { id: string; employeeCode: string; fullName: string } | null;
  unitName: string | null;
  kpiProfile: KpiProfile;
  status: EvaluationStatus;
  revisionNo: number;
  selfTotal: number | null;
  reviewTotal: number | null;
  approvedTotal: number | null;
  selfRating: string | null;
  reviewRating: string | null;
  approvedRating: string | null;
  isDemo: boolean;
  updatedAt: string;
  version: number;
}

export interface CalculationDto {
  id: string;
  kind: 'TRIAL' | 'SELF' | 'REVIEW' | 'APPROVAL';
  revisionNo: number;
  engineVersion: string;
  ruleSetVersionId: string;
  criteriaVersionId: string;
  checksum: string;
  createdAt: string;
  createdBy: string | null;
  result: ScoreResult;
}

export interface EvaluationHistoryDto {
  id: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  actor: string | null;
  comment: string | null;
  createdAt: string;
}

export interface EvaluationDetail extends EvaluationListItem {
  criteriaVersion: CriteriaVersionDto;
  ruleSetVersion: { id: string; label: string; status: ConfigStatus; config: RuleConfig };
  items: {
    criteriaItemId: string;
    selfInput: unknown;
    reviewInput: unknown;
    selfNote: string | null;
    reviewNote: string | null;
  }[];
  reviewFlags: string[];
  ratingOverrideReason: string | null;
  lockedAt: string | null;
  latest: Partial<Record<'SELF' | 'REVIEW' | 'APPROVAL', CalculationDto>>;
  approvals: CalculationDto[];
  history: EvaluationHistoryDto[];
  /** Hành động người đang xem được phép thực hiện (giao diện ẩn/hiện nút). */
  can: {
    editSelf: boolean;
    submit: boolean;
    editReview: boolean;
    completeReview: boolean;
    return: boolean;
    approve: boolean;
    reopen: boolean;
    /** Cấp trên giao danh sách nhiệm vụ (docs/06 §5.6). */
    assignTasks: boolean;
  };
  /** Lý do chưa thể phê duyệt (quy tắc chưa xác nhận, bộ tiêu chí chưa duyệt...). */
  approvalBlockers: string[];
}

// ------------------------------------------------------------------ OKR
export interface KeyResultDto {
  id: string;
  code: string;
  title: string;
  kind: 'KR' | 'KPI';
  measureType: MeasureType;
  direction: MeasureDirection;
  measureUnit: string | null;
  baseline: number | null;
  target: number;
  currentValue: number | null;
  weight: number | null;
  dueDate: string | null;
  /** Tiến độ CHỈ để theo dõi (không phải điểm KPI). */
  progress: { ratio: number | null; explanation: string };
  checkins: {
    id: string;
    value: number;
    note: string | null;
    checkedBy: string | null;
    checkedAt: string;
  }[];
  version: number;
}

export interface ObjectiveDto {
  id: string;
  period: { id: string; code: string; name: string };
  ownerKind: SubjectKind;
  ownerEmployee: { id: string; fullName: string; employeeCode: string } | null;
  ownerUnit: { id: string; name: string } | null;
  parentObjectiveId: string | null;
  code: string;
  title: string;
  description: string | null;
  status: ObjectiveStatus;
  keyResults: KeyResultDto[];
  /** Tiến độ tổng hợp theo trọng số KR (chỉ theo dõi). */
  progress: number | null;
  canEdit: boolean;
  version: number;
}
