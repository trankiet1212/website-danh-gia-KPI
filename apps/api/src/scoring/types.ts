import type {
  CriteriaItemKind,
  ItemInput,
  KpiProfile,
  MeasureDirection,
  RatingSubject,
  RuleConfig,
  ScoringMethod,
} from '@kpi/shared';

/** Mục tiêu chí ở dạng engine cần (không phụ thuộc Prisma). */
export interface EngineCriteriaItem {
  id: string;
  parentId: string | null;
  kind: CriteriaItemKind;
  code: string;
  name: string;
  maxPoints: number;
  weight: number | null;
  scoringMethod: ScoringMethod | null;
  direction: MeasureDirection | null;
  target: number | null;
  baseline: number | null;
  allowNotApplicable: boolean;
  sortOrder: number;
}

export interface EngineInput {
  profile: KpiProfile;
  ratingSubject: RatingSubject;
  generalMax: number;
  resultMax: number;
  items: EngineCriteriaItem[];
  /** Dữ liệu chấm theo id mục tiêu chí. */
  inputs: Record<string, ItemInput | undefined>;
  /** Cờ điều kiện xếp loại do người thẩm định ghi nhận. */
  flags: string[];
  rule: RuleConfig;
  /** Bộ quy tắc đã được xác nhận áp dụng chưa (ảnh hưởng nhãn "tạm"). */
  ruleConfirmed: boolean;
}
