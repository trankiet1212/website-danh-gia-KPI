/**
 * Engine tính điểm (hàm thuần, không truy cập DB — ADR-0005).
 *
 *   Tổng = Điểm tiêu chí chung (≤ generalMax) + Σ điểm các trục kết quả (≤ resultMax)
 *   Điểm một mục = tỷ lệ đạt × điểm tối đa; tỷ lệ đạt tính theo phương pháp của mục (methods.ts).
 *
 * Mọi tham số (mức trừ, mẫu số, trần, công thức KPI, làm tròn, xếp loại...) lấy từ cấu hình bộ quy tắc.
 * Kết quả kèm giải thích từng bước để kiểm chứng; số trung gian giữ nguyên độ chính xác, chỉ làm tròn tổng.
 */
import type { ItemInput, ItemScore, ScoreIssue, ScoreResult } from '@kpi/shared';
import type { Dec } from './decimal.js';
import { ZERO, d, fmt, pct, roundBy, sum, toNum } from './decimal.js';
import {
  compositeKpi,
  manualScore,
  passFail,
  qualitativeLevel,
  targetRatio,
  type MethodResult,
} from './methods.js';
import { suggestRating, type RatingMetrics } from './rating.js';
import type { EngineCriteriaItem, EngineInput } from './types.js';

export const ENGINE_VERSION = '1.0.0';

interface Scored {
  score: ItemScore;
  points: Dec | null;
  na: boolean;
}

export function calculateScore(input: EngineInput): ScoreResult {
  const { rule, items } = input;
  const issues: ScoreIssue[] = [];
  const explanation: string[] = [];
  const metricsAcc = { rowCount: 0, plannedRows: 0, completed: 0, exceeded: 0, late: 0, failed: 0 };
  const allowNa = rule.notApplicable.policy === 'EXCLUDE_AND_RESCALE';

  const childrenOf = (parentId: string | null) =>
    items
      .filter((i) => i.parentId === parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));

  const baseScore = (item: EngineCriteriaItem, extra: Partial<ItemScore> = {}): ItemScore => ({
    criteriaItemId: item.id,
    code: item.code,
    name: item.name,
    kind: item.kind,
    method: item.scoringMethod,
    maxPoints: item.maxPoints,
    ratio: null,
    points: null,
    notApplicable: false,
    steps: [],
    ...extra,
  });

  /** Mục được đánh dấu "không áp dụng" có hợp lệ không. */
  function notApplicable(item: EngineCriteriaItem, inp: ItemInput): boolean {
    if (!inp.notApplicable) return false;
    if (!item.allowNotApplicable) {
      issues.push({
        level: 'error',
        code: 'NA_NOT_ALLOWED',
        message: `"${item.name}" không được phép đánh dấu "không áp dụng"`,
        itemCode: item.code,
      });
      return false;
    }
    if (!allowNa) {
      issues.push({
        level: 'error',
        code: 'NA_POLICY',
        message: `Bộ quy tắc không cho phép loại trừ tiêu chí (notApplicable.policy = NOT_ALLOWED): "${item.name}"`,
        itemCode: item.code,
      });
      return false;
    }
    if (!inp.naReason) {
      issues.push({
        level: 'warning',
        code: 'NA_NO_REASON',
        message: `"${item.name}" không áp dụng nhưng chưa ghi lý do`,
        itemCode: item.code,
      });
    }
    return true;
  }

  function runMethod(item: EngineCriteriaItem, inp: ItemInput): MethodResult {
    switch (item.scoringMethod) {
      case 'PASS_FAIL':
        return passFail(item, inp, rule);
      case 'MANUAL_SCORE':
        return manualScore(item, inp);
      case 'QUALITATIVE_LEVEL':
        return qualitativeLevel(item, inp, rule);
      case 'TARGET_RATIO':
        return targetRatio(item, inp, rule);
      case 'KPI_COMPOSITE':
        return compositeKpi(item, inp, rule, input.profile);
      default:
        return {
          ratio: null,
          steps: [],
          issues: [
            {
              level: 'error',
              code: 'INVALID_METHOD',
              message: `"${item.name}" chưa có phương pháp chấm hợp lệ`,
              itemCode: item.code,
            },
          ],
        };
    }
  }

  /** Cộng điểm các mục con; loại trừ mục "không áp dụng" và quy đổi về thang điểm của mục cha. */
  function combine(
    parentMax: number,
    parts: Scored[],
    label: string,
  ): { points: Dec | null; steps: string[] } {
    const applicable = parts.filter((p) => !p.na);
    const steps: string[] = [];
    if (applicable.length === 0)
      return { points: null, steps: [`${label}: mọi mục đều không áp dụng`] };
    const raw = sum(applicable.map((p) => p.points ?? ZERO));
    const applicableMax = sum(applicable.map((p) => d(p.score.maxPoints)));
    if (applicable.length === parts.length || applicableMax.lte(0)) return { points: raw, steps };
    const scaled = raw.times(parentMax).div(applicableMax);
    steps.push(
      `${label}: loại ${parts.length - applicable.length} mục không áp dụng, quy đổi ${fmt(raw)} / ${fmt(applicableMax)} × ${fmt(parentMax)} = ${fmt(scaled)}`,
    );
    return { points: scaled, steps };
  }

  function scoreLeaf(item: EngineCriteriaItem): Scored {
    const inp = input.inputs[item.id] ?? {};
    if (notApplicable(item, inp)) {
      return {
        score: baseScore(item, { notApplicable: true, steps: ['Không áp dụng'] }),
        points: null,
        na: true,
      };
    }
    const r = runMethod(item, inp);
    issues.push(...r.issues);
    if (r.metrics) {
      metricsAcc.rowCount += r.metrics.rowCount;
      metricsAcc.completed += r.metrics.completed;
      metricsAcc.exceeded += r.metrics.exceeded;
      metricsAcc.late += r.metrics.late;
      metricsAcc.failed += r.metrics.failed;
      metricsAcc.plannedRows += (inp.rows ?? []).filter((x) => x.plannedQty > 0).length;
    }
    const points = r.ratio === null ? null : r.ratio.times(item.maxPoints);
    const steps = [...r.steps];
    if (points !== null)
      steps.push(`Điểm = ${pct(r.ratio!)} × ${fmt(item.maxPoints)} = ${fmt(points)}`);
    return {
      score: baseScore(item, {
        ratio: r.ratio === null ? null : toNum(r.ratio),
        points: points === null ? null : toNum(points),
        steps,
        components: r.components,
        rows: r.rows,
      }),
      points,
      na: false,
    };
  }

  function scoreWeightedAxis(item: EngineCriteriaItem): Scored {
    const inp = input.inputs[item.id] ?? {};
    if (notApplicable(item, inp)) {
      return {
        score: baseScore(item, { notApplicable: true, steps: ['Không áp dụng'] }),
        points: null,
        na: true,
      };
    }
    // Chỉ dùng TỶ LỆ đạt của chỉ tiêu con; điểm của trục = tỷ lệ trục × điểm tối đa của trục.
    const kids = childrenOf(item.id).map((k) => ({ item: k, scored: scoreLeaf(k) }));
    const applicable = kids.filter((k) => !k.scored.na);
    const steps: string[] = [];
    let ratio: Dec | null = null;
    if (applicable.length === 0) {
      steps.push('Mọi chỉ tiêu con đều không áp dụng');
    } else if (applicable.some((k) => k.scored.score.ratio === null)) {
      steps.push('Còn chỉ tiêu con thiếu dữ liệu');
    } else {
      const weights = applicable.map((k) => d(k.item.weight ?? 0));
      const wSum = sum(weights);
      if (wSum.lte(0)) {
        issues.push({
          level: 'error',
          code: 'MISSING_WEIGHT',
          message: `Trục "${item.name}" chưa có trọng số`,
          itemCode: item.code,
        });
      } else {
        ratio = sum(applicable.map((k, i) => d(k.scored.score.ratio!).times(weights[i]!))).div(
          wSum,
        );
        steps.push(
          `Tỷ lệ trục = Σ(tỷ lệ chỉ tiêu × trọng số) / Σ trọng số = ${applicable
            .map((k, i) => `${pct(d(k.scored.score.ratio!), 2)}×${fmt(weights[i]!)}`)
            .join(' + ')} / ${fmt(wSum)} = ${pct(ratio)}`,
        );
        if (applicable.length < kids.length)
          steps.push(
            `Đã loại ${kids.length - applicable.length} chỉ tiêu không áp dụng khỏi mẫu số trọng số`,
          );
      }
    }
    const points = ratio === null ? null : ratio.times(item.maxPoints);
    if (points !== null)
      steps.push(`Điểm trục = ${pct(ratio!)} × ${fmt(item.maxPoints)} = ${fmt(points)}`);
    return {
      score: baseScore(item, {
        ratio: ratio === null ? null : toNum(ratio),
        points: points === null ? null : toNum(points),
        steps,
        children: kids.map((k) => ({
          ...k.scored.score,
          maxPoints: k.item.maxPoints,
          points: null,
        })),
      }),
      points,
      na: false,
    };
  }

  function scoreNode(item: EngineCriteriaItem): Scored {
    if (item.kind === 'GENERAL_GROUP') {
      const kids = childrenOf(item.id).map(scoreNode);
      const { points, steps } = combine(item.maxPoints, kids, `Nhóm "${item.name}"`);
      const all = kids.every((k) => k.na);
      const missing = kids.some((k) => !k.na && k.points === null);
      const final = missing ? null : points;
      if (final !== null) steps.push(`Điểm nhóm = ${fmt(final)} / ${fmt(item.maxPoints)}`);
      return {
        score: baseScore(item, {
          ratio: final === null || item.maxPoints === 0 ? null : toNum(final.div(item.maxPoints)),
          points: final === null ? null : toNum(final),
          notApplicable: all,
          steps,
          children: kids.map((k) => k.score),
        }),
        points: final,
        na: all,
      };
    }
    if (item.kind === 'AXIS' && item.scoringMethod === 'WEIGHTED_INDICATORS')
      return scoreWeightedAxis(item);
    return scoreLeaf(item);
  }

  // ---- Tiêu chí chung
  const generalNodes = childrenOf(null)
    .filter((i) => i.kind === 'GENERAL_GROUP' || i.kind === 'GENERAL_ITEM')
    .map(scoreNode);
  const general = combine(input.generalMax, generalNodes, 'Tiêu chí chung');
  const generalScore = general.points ?? ZERO;
  explanation.push(
    `I. Tiêu chí chung: ${fmt(generalScore)} / ${fmt(input.generalMax)} điểm`,
    ...general.steps,
  );

  // ---- Kết quả thực hiện nhiệm vụ
  const axisNodes = childrenOf(null)
    .filter((i) => i.kind === 'AXIS')
    .map(scoreNode);
  const result = combine(input.resultMax, axisNodes, 'Kết quả thực hiện nhiệm vụ');
  const resultScore = result.points ?? ZERO;
  explanation.push(
    `II. Kết quả thực hiện nhiệm vụ: ${fmt(resultScore)} / ${fmt(input.resultMax)} điểm`,
  );
  for (const a of axisNodes) {
    explanation.push(
      a.na
        ? `   - ${a.score.name}: không áp dụng`
        : `   - ${a.score.name}: ${a.score.ratio === null ? 'thiếu dữ liệu' : `${pct(d(a.score.ratio))} × ${fmt(a.score.maxPoints)} = ${fmt(a.score.points ?? 0)}`}`,
    );
  }
  explanation.push(...result.steps);

  const total = generalScore.plus(resultScore);
  const totalRounded = roundBy(total, rule.rounding);
  explanation.push(
    `Tổng điểm = ${fmt(generalScore)} + ${fmt(resultScore)} = ${fmt(total)} → làm tròn ${rule.rounding.decimals} chữ số (${rule.rounding.mode}) = ${fmt(totalRounded, rule.rounding.decimals)}`,
  );

  const missingItems = [...generalNodes, ...axisNodes].filter((n) => !n.na && n.points === null);
  if (missingItems.length > 0) {
    explanation.push(
      `CHƯA ĐỦ DỮ LIỆU: ${missingItems.map((m) => m.score.name).join('; ')} — tổng điểm tạm tính với các mục thiếu = 0.`,
    );
  }
  if (total.gt(rule.scale.max)) {
    issues.push({
      level: 'warning',
      code: 'OVER_SCALE',
      message: `Tổng điểm vượt thang ${fmt(rule.scale.max)} (do cấu hình cho phép vượt mục tiêu)`,
    });
  }
  if (!input.ruleConfirmed) {
    issues.push({
      level: 'warning',
      code: 'RULE_NOT_CONFIRMED',
      message: 'Bộ quy tắc tính điểm chưa được xác nhận áp dụng — kết quả chỉ để tham khảo',
    });
  }
  if (rule.provisionalKeys.length > 0) {
    issues.push({
      level: 'warning',
      code: 'PROVISIONAL_RULE',
      message: `Cấu hình có giá trị chưa có căn cứ xác nhận: ${rule.provisionalKeys.join(', ')}`,
    });
  }

  const metrics: ScoreResult['metrics'] = { rowCount: metricsAcc.rowCount };
  const ratingMetrics: RatingMetrics = { totalScore: toNum(totalRounded) };
  if (metricsAcc.rowCount > 0) {
    metrics.exceededShare = metricsAcc.exceeded / metricsAcc.rowCount;
    metrics.lateShare = metricsAcc.late / metricsAcc.rowCount;
    if (metricsAcc.plannedRows > 0) {
      metrics.completionRate = metricsAcc.completed / metricsAcc.plannedRows;
      metrics.failedShare = metricsAcc.failed / metricsAcc.plannedRows;
    }
    Object.assign(ratingMetrics, metrics);
    delete (ratingMetrics as Record<string, unknown>)['rowCount'];
  }

  const complete = missingItems.length === 0 && !issues.some((i) => i.level === 'error');
  const rating = complete
    ? suggestRating(
        toNum(totalRounded),
        ratingMetrics,
        input.flags,
        rule,
        input.ratingSubject,
        input.ruleConfirmed,
      )
    : {
        eligible: null,
        eligibleLabel: null,
        provisional: true,
        steps: ['Chưa đủ dữ liệu hợp lệ để đề xuất mức xếp loại.'],
      };

  return {
    engineVersion: ENGINE_VERSION,
    complete,
    profile: input.profile,
    general: {
      score: toNum(generalScore),
      max: input.generalMax,
      items: generalNodes.map((n) => n.score),
    },
    result: {
      score: toNum(resultScore),
      max: input.resultMax,
      items: axisNodes.map((n) => n.score),
    },
    total: toNum(total),
    totalRounded: toNum(totalRounded),
    metrics,
    rating,
    issues,
    explanation,
  };
}
