/**
 * Tổng hợp kết quả nhiều kỳ (ví dụ năm từ các quý) theo chiến lược trong cấu hình.
 * Mặc định MANUAL_WITH_REFERENCE: KHÔNG tự tính — chỉ đưa số liệu các kỳ làm căn cứ để cấp có thẩm quyền quyết định.
 */
import type { RuleConfig } from '@kpi/shared';
import { d, fmt, roundBy, sum, toNum } from './decimal.js';

export interface PeriodScore {
  periodCode: string;
  total: number | null;
  rating: string | null;
}

export interface AggregateResult {
  strategy: RuleConfig['annualAggregation']['strategy'];
  value: number | null;
  steps: string[];
}

export function aggregatePeriods(scores: PeriodScore[], rule: RuleConfig): AggregateResult {
  const cfg = rule.annualAggregation;
  const listing = scores.map(
    (s) =>
      `${s.periodCode}: ${s.total === null ? 'chưa có' : fmt(s.total, 2)}${s.rating ? ` (${s.rating})` : ''}`,
  );
  if (cfg.strategy === 'MANUAL_WITH_REFERENCE') {
    return {
      strategy: cfg.strategy,
      value: null,
      steps: [
        'Không tự tính điểm tổng hợp (annualAggregation = MANUAL_WITH_REFERENCE).',
        `Căn cứ: ${listing.join('; ')}`,
      ],
    };
  }
  const weights = cfg.weights ?? {};
  const missing = scores.filter((s) => s.total === null || weights[s.periodCode] === undefined);
  if (missing.length > 0) {
    return {
      strategy: cfg.strategy,
      value: null,
      steps: [`Thiếu điểm hoặc trọng số của kỳ: ${missing.map((m) => m.periodCode).join(', ')}`],
    };
  }
  const w = scores.map((s) => d(weights[s.periodCode]!));
  const value = sum(scores.map((s, i) => d(s.total!).times(w[i]!))).div(sum(w));
  const rounded = roundBy(value, rule.rounding);
  return {
    strategy: cfg.strategy,
    value: toNum(rounded),
    steps: [
      `Bình quân có trọng số = ${scores.map((s, i) => `${fmt(s.total!, 2)}×${fmt(w[i]!)}`).join(' + ')} / ${fmt(sum(w))} = ${fmt(value)} → ${fmt(rounded, rule.rounding.decimals)}`,
    ],
  };
}
