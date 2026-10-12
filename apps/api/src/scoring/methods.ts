/**
 * Các phương pháp tính tỷ lệ đạt của một mục tiêu chí. Hàm thuần — mọi tham số lấy từ cấu hình bộ quy tắc.
 * Mỗi hàm trả về tỷ lệ (Dec) hoặc null nếu thiếu dữ liệu, kèm các bước giải thích bằng tiếng Việt.
 */
import type {
  CompositeRow,
  CompositeRowResult,
  ExplainedNumber,
  ItemInput,
  KpiComponent,
  KpiProfile,
  RuleConfig,
  ScoreIssue,
} from '@kpi/shared';
import { KPI_COMPONENT_LABELS } from '@kpi/shared';
import { Dec, ONE, ZERO, d, fmt, pct, sum, toNum } from './decimal.js';
import type { EngineCriteriaItem } from './types.js';

export interface MethodResult {
  ratio: Dec | null;
  steps: string[];
  issues: ScoreIssue[];
  components?: Partial<Record<KpiComponent, ExplainedNumber>>;
  rows?: CompositeRowResult[];
  /** Chỉ số dùng cho điều kiện xếp loại (chỉ phương pháp KPI tổng hợp). */
  metrics?: { rowCount: number; completed: number; exceeded: number; late: number; failed: number };
}

const issue = (
  level: 'error' | 'warning',
  code: string,
  message: string,
  itemCode?: string,
): ScoreIssue => ({
  level,
  code,
  message,
  itemCode,
});

/** Áp trần (nếu có) và sàn 0. */
function clamp(ratio: Dec, cap: number | null): Dec {
  const floored = Dec.max(ratio, ZERO);
  return cap === null ? floored : Dec.min(floored, d(cap));
}

// ----------------------------------------------------------------------------- Đảm bảo / không đảm bảo
export function passFail(
  item: EngineCriteriaItem,
  input: ItemInput,
  rule: RuleConfig,
): MethodResult {
  if (input.passed === undefined) {
    return {
      ratio: null,
      steps: [],
      issues: [issue('error', 'MISSING_INPUT', `Chưa chọn "đảm bảo / không đảm bảo"`, item.code)],
    };
  }
  const ratio = input.passed ? ONE : d(rule.passFail.failRatio);
  return {
    ratio,
    steps: [
      input.passed
        ? `Đảm bảo → đạt 100% điểm tối đa`
        : `Không đảm bảo → đạt ${pct(ratio, 1)} điểm tối đa (passFail.failRatio = ${fmt(ratio)})`,
    ],
    issues: [],
  };
}

// ----------------------------------------------------------------------------- Chấm điểm trực tiếp
export function manualScore(item: EngineCriteriaItem, input: ItemInput): MethodResult {
  if (input.points === undefined) {
    return {
      ratio: null,
      steps: [],
      issues: [issue('error', 'MISSING_INPUT', 'Chưa nhập điểm', item.code)],
    };
  }
  if (item.maxPoints <= 0) return { ratio: ZERO, steps: ['Điểm tối đa bằng 0'], issues: [] };
  if (input.points > item.maxPoints) {
    return {
      ratio: null,
      steps: [],
      issues: [
        issue(
          'error',
          'OVER_MAX',
          `Điểm nhập (${fmt(input.points)}) vượt điểm tối đa ${fmt(item.maxPoints)}`,
          item.code,
        ),
      ],
    };
  }
  const ratio = d(input.points).div(item.maxPoints);
  return {
    ratio,
    steps: [`Chấm trực tiếp ${fmt(input.points)} / ${fmt(item.maxPoints)} điểm`],
    issues: [],
  };
}

// ----------------------------------------------------------------------------- Định tính theo mức
export function qualitativeLevel(
  item: EngineCriteriaItem,
  input: ItemInput,
  rule: RuleConfig,
): MethodResult {
  if (!input.level) {
    return {
      ratio: null,
      steps: [],
      issues: [issue('error', 'MISSING_INPUT', 'Chưa chọn mức đánh giá', item.code)],
    };
  }
  const level = rule.qualitativeLevels.find((l) => l.code === input.level);
  if (!level) {
    return {
      ratio: null,
      steps: [],
      issues: [
        issue('error', 'INVALID_LEVEL', `Mức "${input.level}" không có trong cấu hình`, item.code),
      ],
    };
  }
  const ratio = d(level.ratio);
  return {
    ratio,
    steps: [`Mức "${level.label}" → tỷ lệ ${pct(ratio, 1)} (qualitativeLevels)`],
    issues: [],
  };
}

// ----------------------------------------------------------------------------- So với mục tiêu
export function targetRatio(
  item: EngineCriteriaItem,
  input: ItemInput,
  rule: RuleConfig,
): MethodResult {
  const cfg = rule.targetRatio;
  if (input.actual === undefined) {
    return {
      ratio: null,
      steps: [],
      issues: [issue('error', 'MISSING_INPUT', 'Chưa nhập kết quả thực tế', item.code)],
    };
  }
  if (item.target === null) {
    return {
      ratio: null,
      steps: [],
      issues: [issue('error', 'MISSING_TARGET', 'Chỉ tiêu chưa có giá trị mục tiêu', item.code)],
    };
  }
  const actual = d(input.actual);
  const target = d(item.target);
  const capText = cfg.cap === null ? 'không giới hạn trần' : `trần ${pct(d(cfg.cap), 1)}`;
  let raw: Dec;
  let formula: string;
  if ((item.direction ?? 'INCREASE') === 'INCREASE') {
    if (target.lte(0)) {
      return {
        ratio: null,
        steps: [],
        issues: [issue('error', 'INVALID_TARGET', 'Mục tiêu (tăng) phải lớn hơn 0', item.code)],
      };
    }
    raw = actual.div(target);
    formula = `Thực tế / Mục tiêu = ${fmt(actual)} / ${fmt(target)} = ${pct(raw)}`;
  } else if (cfg.decreaseMethod === 'BASELINE_GAP') {
    if (item.baseline === null || d(item.baseline).lte(target)) {
      return {
        ratio: null,
        steps: [],
        issues: [
          issue(
            'error',
            'INVALID_BASELINE',
            'Chỉ tiêu giảm cần giá trị ban đầu lớn hơn mục tiêu',
            item.code,
          ),
        ],
      };
    }
    const baseline = d(item.baseline);
    raw = baseline.minus(actual).div(baseline.minus(target));
    formula = `(Ban đầu − Thực tế) / (Ban đầu − Mục tiêu) = (${fmt(baseline)} − ${fmt(actual)}) / (${fmt(baseline)} − ${fmt(target)}) = ${pct(raw)}`;
  } else {
    if (actual.lte(0)) {
      raw = cfg.cap === null ? ONE : d(cfg.cap);
      formula = `Thực tế = 0 (chỉ tiêu giảm) → đạt mức tối đa cho phép ${pct(raw, 1)}`;
    } else {
      raw = target.div(actual);
      formula = `Mục tiêu / Thực tế = ${fmt(target)} / ${fmt(actual)} = ${pct(raw)}`;
    }
  }
  const ratio = clamp(raw, cfg.cap);
  const steps = [formula];
  if (!ratio.eq(raw)) steps.push(`Áp ${capText}, sàn 0% → ${pct(ratio)}`);
  return { ratio, steps, issues: [] };
}

// ----------------------------------------------------------------------------- KPI tổng hợp ([HD05] PL2)
function rowCheck(
  row: CompositeRow,
  index: number,
  itemCode: string,
  rule: RuleConfig,
): ScoreIssue[] {
  const out: ScoreIssue[] = [];
  const where = `Dòng ${index + 1} "${row.label}"`;
  if (row.reworkQty > row.completedQty) {
    out.push(
      issue(
        'error',
        'INVALID_ROW',
        `${where}: số lượng làm lại lớn hơn số lượng hoàn thành`,
        itemCode,
      ),
    );
  }
  if (row.lateQty > row.completedQty) {
    out.push(
      issue(
        'error',
        'INVALID_ROW',
        `${where}: số lượng chậm tiến độ lớn hơn số lượng hoàn thành`,
        itemCode,
      ),
    );
  }
  if (row.reworkQty > 0 && row.reworkCount === 0) {
    out.push(
      issue(
        'warning',
        'ZERO_COUNT',
        `${where}: có số lượng làm lại nhưng số lần làm lại = 0`,
        itemCode,
      ),
    );
  }
  if (row.plannedQty === 0 && row.completedQty > 0) {
    out.push(
      issue(
        'warning',
        'UNPLANNED',
        `${where}: có kết quả nhưng không có kế hoạch (không được tính vào mẫu số)`,
        itemCode,
      ),
    );
  }
  if (
    row.plannedQty > 0 &&
    row.completedQty > row.plannedQty * rule.outliers.maxCompletedOverPlanned
  ) {
    out.push(
      issue(
        'warning',
        'OUTLIER',
        `${where}: số lượng hoàn thành (${fmt(row.completedQty)}) vượt ${fmt(rule.outliers.maxCompletedOverPlanned)} lần kế hoạch — cần kiểm tra`,
        itemCode,
      ),
    );
  }
  if (row.exemptCount > 0 && !row.exemptNote) {
    out.push(
      issue('warning', 'EXEMPT_NO_NOTE', `${where}: có miễn trừ nhưng chưa ghi căn cứ`, itemCode),
    );
  }
  return out;
}

/** Số lượng quy đổi đạt sau khi trừ: phần không vi phạm + max(0, phần vi phạm × (1 − số lần × mức trừ)). */
function deducted(coef: Dec, completed: number, badQty: number, count: number, rate: number): Dec {
  const good = coef.times(Math.max(completed - badQty, 0));
  const bad = coef.times(badQty);
  const after = Dec.max(bad.minus(bad.times(count).times(rate)), ZERO);
  return good.plus(after);
}

export function compositeKpi(
  item: EngineCriteriaItem,
  input: ItemInput,
  rule: RuleConfig,
  profile: KpiProfile,
): MethodResult {
  const cfg = rule.composite;
  const formula = rule.kpiFormulas[profile];
  const rows = input.rows ?? [];
  const issues: ScoreIssue[] = rows.flatMap((r, i) => rowCheck(r, i, item.code, rule));
  if (rows.length === 0) {
    issues.push(
      issue('error', 'MISSING_INPUT', 'Chưa khai báo nhiệm vụ / sản phẩm của trục', item.code),
    );
    return { ratio: null, steps: [], issues };
  }

  const rowResults: CompositeRowResult[] = rows.map((r) => {
    const coef = d(r.coefficient);
    return {
      label: r.label,
      coefficient: r.coefficient,
      plannedConverted: toNum(coef.times(r.plannedQty)),
      completedConverted: toNum(coef.times(r.completedQty)),
      qualityConverted: toNum(
        deducted(coef, r.completedQty, r.reworkQty, r.reworkCount, cfg.reworkDeductionRate),
      ),
      timelinessConverted: toNum(
        deducted(coef, r.completedQty, r.lateQty, r.lateCount, cfg.lateDeductionRate),
      ),
    };
  });
  const planned = sum(rows.map((r) => d(r.coefficient).times(r.plannedQty)));
  const completed = sum(rows.map((r) => d(r.coefficient).times(r.completedQty)));
  const quality = sum(
    rows.map((r) =>
      deducted(
        d(r.coefficient),
        r.completedQty,
        r.reworkQty,
        r.reworkCount,
        cfg.reworkDeductionRate,
      ),
    ),
  );
  const timeliness = sum(
    rows.map((r) =>
      deducted(d(r.coefficient), r.completedQty, r.lateQty, r.lateCount, cfg.lateDeductionRate),
    ),
  );

  const steps: string[] = [
    `Σ số lượng quy đổi theo kế hoạch (cột 7) = Σ(hệ số × SL kế hoạch) = ${fmt(planned)}`,
    `Σ thực tế hoàn thành quy đổi (cột 9) = Σ(hệ số × SL hoàn thành) = ${fmt(completed)}`,
    `Σ đạt chất lượng quy đổi (cột 11, bảng 2.2) = ${fmt(quality)} — trừ ${pct(d(cfg.reworkDeductionRate), 0)} cho mỗi lần làm lại`,
    `Σ đạt tiến độ quy đổi (cột 11, bảng 2.3) = ${fmt(timeliness)} — trừ ${pct(d(cfg.lateDeductionRate), 0)} cho mỗi lần chậm`,
  ];

  const components: Partial<Record<KpiComponent, ExplainedNumber>> = {};
  const values: Partial<Record<KpiComponent, Dec>> = {};

  if (planned.lte(0)) {
    issues.push(
      issue(
        'error',
        'NO_PLAN',
        'Tổng số lượng kế hoạch quy đổi bằng 0 — không tính được A, B, C',
        item.code,
      ),
    );
  } else {
    const rawA = completed.div(planned);
    const a = cfg.capA === null ? rawA : Dec.min(rawA, d(cfg.capA));
    values.A = a;
    components.A = {
      value: toNum(a),
      formula: `A = ${fmt(completed)} / ${fmt(planned)} = ${pct(rawA)}${a.eq(rawA) ? '' : ` → áp trần ${pct(d(cfg.capA!), 0)} = ${pct(a)}`}`,
    };
    const denom = (kind: 'PLANNED' | 'COMPLETED') => (kind === 'PLANNED' ? planned : completed);
    const denomName = (kind: 'PLANNED' | 'COMPLETED') =>
      kind === 'PLANNED' ? 'kế hoạch quy đổi (cột 7)' : 'thực tế quy đổi (cột 9)';
    for (const [key, numerator, kind] of [
      ['B', quality, cfg.qualityDenominator],
      ['C', timeliness, cfg.timelinessDenominator],
    ] as const) {
      const den = denom(kind);
      if (den.lte(0)) {
        values[key] = ZERO;
        components[key] = { value: 0, formula: `${key} = 0 (chưa có sản phẩm hoàn thành)` };
        issues.push(
          issue(
            'warning',
            'NO_COMPLETION',
            `${KPI_COMPONENT_LABELS[key]}: chưa có sản phẩm hoàn thành`,
            item.code,
          ),
        );
      } else {
        const v = numerator.div(den);
        values[key] = v;
        components[key] = {
          value: toNum(v),
          formula: `${key} = ${fmt(numerator)} / ${fmt(den)} [mẫu số: ${denomName(kind)}] = ${pct(v)}`,
        };
      }
    }
  }

  if (formula.components.includes('D')) {
    const dScores = input.dScores ?? {};
    const missing = rule.leadershipD.subCriteria.filter((s) => dScores[s.code] === undefined);
    const invalid = rule.leadershipD.subCriteria.filter(
      (s) =>
        dScores[s.code] !== undefined && !rule.leadershipD.allowedLevels.includes(dScores[s.code]!),
    );
    if (missing.length > 0) {
      issues.push(
        issue(
          'error',
          'MISSING_D',
          `Chưa đánh giá tiêu chí lãnh đạo: ${missing.map((s) => s.label).join('; ')}`,
          item.code,
        ),
      );
    } else if (invalid.length > 0) {
      issues.push(
        issue(
          'error',
          'INVALID_D',
          `Mức đánh giá không hợp lệ (chỉ chấp nhận ${rule.leadershipD.allowedLevels.map((l) => pct(d(l), 0)).join(', ')}): ${invalid.map((s) => s.label).join('; ')}`,
          item.code,
        ),
      );
    } else {
      const parts = rule.leadershipD.subCriteria.map((s) => d(dScores[s.code]!));
      const dv = sum(parts).div(parts.length);
      values.D = dv;
      components.D = {
        value: toNum(dv),
        formula: `D = trung bình(${parts.map((p) => pct(p, 0)).join(', ')}) = ${pct(dv)}`,
      };
    }
  }

  const missingComponent = formula.components.filter((c) => values[c] === undefined);
  const metrics = {
    rowCount: rows.length,
    completed: rows.filter((r) => r.plannedQty > 0 && r.completedQty >= r.plannedQty).length,
    exceeded: rows.filter((r) => r.exceeded).length,
    late: rows.filter((r) => r.lateQty > 0 && r.lateCount > 0).length,
    failed: rows.filter((r) => r.plannedQty > 0 && r.completedQty === 0).length,
  };
  if (missingComponent.length > 0) {
    return { ratio: null, steps, issues, components, rows: rowResults, metrics };
  }

  let kpi: Dec;
  if (formula.aggregate === 'MEAN') {
    kpi = sum(formula.components.map((c) => values[c]!)).div(formula.components.length);
    steps.push(
      `KPI = (${formula.components.join(' + ')}) / ${formula.components.length} = (${formula.components
        .map((c) => pct(values[c]!))
        .join(' + ')}) / ${formula.components.length} = ${pct(kpi)}`,
    );
  } else {
    const weights = formula.components.map((c) => d(formula.weights![c]!));
    kpi = sum(formula.components.map((c, i) => values[c]!.times(weights[i]!))).div(sum(weights));
    steps.push(
      `KPI = Σ(thành phần × trọng số) / Σ trọng số = ${formula.components
        .map((c, i) => `${pct(values[c]!)}×${fmt(weights[i]!)}`)
        .join(' + ')} / ${fmt(sum(weights))} = ${pct(kpi)}`,
    );
  }
  return { ratio: kpi, steps, issues, components, rows: rowResults, metrics };
}
