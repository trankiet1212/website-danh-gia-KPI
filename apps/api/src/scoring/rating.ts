/**
 * Đề xuất mức xếp loại từ tổng điểm + điều kiện kèm theo + cờ vi phạm (mọi giá trị lấy từ cấu hình).
 * Kết quả chỉ là ĐỀ XUẤT; mức cuối cùng do người có thẩm quyền quyết định khi phê duyệt.
 */
import type {
  RatingCondition,
  RatingMetric,
  RatingResult,
  RatingSubject,
  RuleConfig,
} from '@kpi/shared';
import { RATING_METRIC_LABELS } from '@kpi/shared';
import { fmt } from './decimal.js';

export type RatingMetrics = Partial<Record<RatingMetric, number>>;

function describe(c: RatingCondition, rule: RuleConfig): string {
  if (c.type === 'noFlag') {
    const flag = rule.rating.flags.find((f) => f.code === c.flag);
    return `không có "${flag?.label ?? c.flag}"`;
  }
  const isRatio = c.metric !== 'totalScore';
  const value = isRatio ? `${fmt(c.value * 100, 1)}%` : fmt(c.value, 2);
  return `${RATING_METRIC_LABELS[c.metric]} ${c.op} ${value}`;
}

function check(c: RatingCondition, metrics: RatingMetrics, flags: Set<string>): boolean | null {
  if (c.type === 'noFlag') return !flags.has(c.flag);
  const v = metrics[c.metric];
  if (v === undefined) return null;
  switch (c.op) {
    case '>=':
      return v >= c.value;
    case '>':
      return v > c.value;
    case '<=':
      return v <= c.value;
    case '<':
      return v < c.value;
    case '==':
      return Math.abs(v - c.value) < 1e-9;
  }
}

export function suggestRating(
  totalRounded: number,
  metrics: RatingMetrics,
  flagList: string[],
  rule: RuleConfig,
  subject: RatingSubject,
  ruleConfirmed: boolean,
): RatingResult {
  const flags = new Set(flagList);
  const steps: string[] = [];
  const provisional =
    !ruleConfirmed || rule.provisionalKeys.some((k) => k === 'rating' || k.startsWith('rating.'));
  const bands = rule.rating.bands;
  const label = (code: string | null) => bands.find((b) => b.code === code)?.label ?? null;
  const done = (eligible: string | null): RatingResult => ({
    eligible,
    eligibleLabel: label(eligible),
    provisional,
    steps,
  });

  if (!ruleConfirmed)
    steps.push('Bộ quy tắc CHƯA được xác nhận áp dụng → mức xếp loại dưới đây chỉ để tham khảo.');

  for (const f of rule.rating.forced) {
    const hit = f.anyFlag.filter((x) => flags.has(x));
    if (hit.length > 0) {
      const names = hit.map((x) => rule.rating.flags.find((ff) => ff.code === x)?.label ?? x);
      steps.push(
        `Có trường hợp: ${names.join('; ')} → xếp mức "${label(f.rating)}" (rating.forced)${f.note ? ` — ${f.note}` : ''}.`,
      );
      return done(f.rating);
    }
  }

  const scoreIndex = bands.findIndex(
    (b) =>
      (b.min === null || totalRounded >= b.min) &&
      (b.maxExclusive === null || totalRounded < b.maxExclusive),
  );
  if (scoreIndex === -1) {
    steps.push(`Tổng điểm ${fmt(totalRounded, 2)} không thuộc khoảng điểm nào của cấu hình.`);
    return done(null);
  }
  steps.push(
    `Tổng điểm ${fmt(totalRounded, 2)} thuộc khoảng của mức "${bands[scoreIndex]!.label}".`,
  );

  for (let i = scoreIndex; i < bands.length; i++) {
    const band = bands[i]!;
    if (i !== scoreIndex && band.assignOnlyWithinRange) {
      steps.push(
        `Mức "${band.label}" chỉ áp dụng khi tổng điểm thuộc khoảng của mức hoặc có trường hợp bắt buộc → không xét.`,
      );
      continue;
    }
    const rules = rule.rating.conditions.filter(
      (c) => c.rating === band.code && c.appliesTo.includes(subject),
    );
    const failed: string[] = [];
    const unknown: string[] = [];
    for (const r of rules) {
      for (const c of r.all) {
        const ok = check(c, metrics, flags);
        if (ok === null) unknown.push(describe(c, rule));
        else if (!ok) failed.push(describe(c, rule));
      }
    }
    if (failed.length === 0 && unknown.length === 0) {
      steps.push(
        rules.length === 0
          ? `Mức "${band.label}": không có điều kiện kèm theo cho nhóm đối tượng này → đạt.`
          : `Mức "${band.label}": đáp ứng đủ điều kiện kèm theo.`,
      );
      return done(band.code);
    }
    const reasons = [
      failed.length ? `chưa đạt: ${failed.join('; ')}` : '',
      unknown.length ? `thiếu dữ liệu để xác định: ${unknown.join('; ')}` : '',
    ]
      .filter(Boolean)
      .join(' — ');
    steps.push(`Mức "${band.label}": ${reasons} → xét mức thấp hơn.`);
  }
  steps.push(
    'Không xác định được mức đáp ứng đủ điều kiện — cấp có thẩm quyền xem xét, quyết định.',
  );
  return done(null);
}
