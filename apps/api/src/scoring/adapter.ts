/**
 * Chuyển dữ liệu từ DB (Prisma) sang dạng engine cần, chạy engine và đóng gói ảnh chụp kết quả (snapshot).
 * Dùng chung cho service đánh giá và seed DEMO.
 */
import type { ItemInput, KpiProfile, RuleConfig, ScoreResult } from '@kpi/shared';
import { itemInputSchema, ruleConfigSchema } from '@kpi/shared';
import { checksumOf } from './checksum.js';
import { ENGINE_VERSION, calculateScore } from './engine.js';
import type { EngineCriteriaItem } from './types.js';

/** Dạng tối thiểu của bản ghi criteria_items (Prisma Decimal có toNumber()). */
interface DecimalLike {
  toNumber(): number;
}
export interface CriteriaItemRow {
  id: string;
  parentId: string | null;
  kind: EngineCriteriaItem['kind'];
  code: string;
  name: string;
  maxPoints: DecimalLike;
  weight: DecimalLike | null;
  scoringMethod: EngineCriteriaItem['scoringMethod'];
  direction: EngineCriteriaItem['direction'];
  target: DecimalLike | null;
  baseline: DecimalLike | null;
  allowNotApplicable: boolean;
  sortOrder: number;
}

const num = (v: DecimalLike | null) => (v === null ? null : v.toNumber());

export function toEngineItems(rows: CriteriaItemRow[]): EngineCriteriaItem[] {
  return rows.map((r) => ({
    id: r.id,
    parentId: r.parentId,
    kind: r.kind,
    code: r.code,
    name: r.name,
    maxPoints: r.maxPoints.toNumber(),
    weight: num(r.weight),
    scoringMethod: r.scoringMethod,
    direction: r.direction,
    target: num(r.target),
    baseline: num(r.baseline),
    allowNotApplicable: r.allowNotApplicable,
    sortOrder: r.sortOrder,
  }));
}

/** Đọc cấu hình bộ quy tắc đã lưu (kiểm tra lại schema để phát hiện dữ liệu hỏng). */
export function parseRuleConfig(config: unknown): RuleConfig {
  const parsed = ruleConfigSchema.safeParse(config);
  if (!parsed.success) throw new Error('Cấu hình bộ quy tắc đã lưu không hợp lệ');
  return parsed.data;
}

/** Đọc dữ liệu chấm đã lưu của một mục (bỏ qua dữ liệu không hợp lệ). */
export function parseItemInput(value: unknown): ItemInput | undefined {
  if (value === null || value === undefined) return undefined;
  const parsed = itemInputSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export interface CalculationSnapshot {
  inputs: { profile: KpiProfile; flags: string[]; items: Record<string, ItemInput | undefined> };
  result: ScoreResult;
  engineVersion: string;
  ruleSetChecksum: string;
  checksum: string;
}

export function runCalculation(args: {
  profile: KpiProfile;
  generalMax: number;
  resultMax: number;
  items: CriteriaItemRow[];
  inputs: Record<string, ItemInput | undefined>;
  flags: string[];
  ruleConfig: unknown;
  ruleChecksum: string;
  ruleConfirmed: boolean;
  criteriaVersionId: string;
  /** Ghi chú bổ sung vào phần giải thích (ví dụ mục kế thừa dữ liệu tự đánh giá). */
  notes?: string[];
}): CalculationSnapshot {
  const rule = parseRuleConfig(args.ruleConfig);
  const result = calculateScore({
    profile: args.profile,
    ratingSubject: args.profile === 'LEADER' ? 'LEADER' : 'STAFF',
    generalMax: args.generalMax,
    resultMax: args.resultMax,
    items: toEngineItems(args.items),
    inputs: args.inputs,
    flags: args.flags,
    rule,
    ruleConfirmed: args.ruleConfirmed,
  });
  if (args.notes?.length) result.explanation.unshift(...args.notes);
  const inputs = { profile: args.profile, flags: args.flags, items: args.inputs };
  return {
    inputs,
    result,
    engineVersion: ENGINE_VERSION,
    ruleSetChecksum: args.ruleChecksum,
    checksum: checksumOf({
      inputs,
      result,
      engineVersion: ENGINE_VERSION,
      ruleSetChecksum: args.ruleChecksum,
      criteriaVersionId: args.criteriaVersionId,
    }),
  };
}
