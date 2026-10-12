/**
 * Kiểm tra cấu trúc bộ tiêu chí trước khi trình duyệt/phê duyệt:
 * tổng điểm tiêu chí chung, tổng điểm các trục, tổng trọng số chỉ tiêu con, quan hệ cha–con, phương pháp, mục tiêu.
 */
import type { RuleConfig, ValidationIssue } from '@kpi/shared';
import { METHODS_BY_KIND } from '@kpi/shared';
import { d, fmt, sum } from './decimal.js';
import type { EngineCriteriaItem } from './types.js';

const ALLOWED_PARENT: Record<EngineCriteriaItem['kind'], EngineCriteriaItem['kind'] | null> = {
  GENERAL_GROUP: null,
  GENERAL_ITEM: 'GENERAL_GROUP',
  AXIS: null,
  AXIS_INDICATOR: 'AXIS',
};

export function validateCriteria(
  items: EngineCriteriaItem[],
  generalMax: number,
  resultMax: number,
  rule?: RuleConfig | null,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const err = (code: string, message: string, itemCode?: string) =>
    issues.push({ level: 'error', code, message, itemCode });
  const warn = (code: string, message: string, itemCode?: string) =>
    issues.push({ level: 'warning', code, message, itemCode });
  const byId = new Map(items.map((i) => [i.id, i]));
  const children = (id: string) => items.filter((i) => i.parentId === id);

  const codes = new Map<string, number>();
  for (const i of items) codes.set(i.code, (codes.get(i.code) ?? 0) + 1);
  for (const [code, n] of codes) if (n > 1) err('DUPLICATE_CODE', `Mã "${code}" bị trùng`, code);

  for (const i of items) {
    const expectedParent = ALLOWED_PARENT[i.kind];
    const parent = i.parentId ? byId.get(i.parentId) : undefined;
    if (expectedParent === null && i.parentId)
      err('INVALID_PARENT', `"${i.name}" là mục cấp gốc, không có mục cha`, i.code);
    if (expectedParent !== null && parent?.kind !== expectedParent) {
      err('INVALID_PARENT', `"${i.name}" phải thuộc một mục loại ${expectedParent}`, i.code);
    }
    const allowed = METHODS_BY_KIND[i.kind];
    if (allowed.length === 0 && i.scoringMethod)
      err('INVALID_METHOD', `"${i.name}" là nhóm, không có phương pháp chấm`, i.code);
    if (allowed.length > 0 && (!i.scoringMethod || !allowed.includes(i.scoringMethod))) {
      err('INVALID_METHOD', `"${i.name}": phương pháp chấm không hợp lệ cho loại mục này`, i.code);
    }
    if (i.scoringMethod === 'TARGET_RATIO') {
      if (i.target === null) err('MISSING_TARGET', `"${i.name}": thiếu giá trị mục tiêu`, i.code);
      if (!i.direction)
        err('MISSING_DIRECTION', `"${i.name}": thiếu chiều đánh giá (tăng/giảm)`, i.code);
      if (i.direction === 'DECREASE' && rule?.targetRatio.decreaseMethod === 'BASELINE_GAP') {
        if (i.baseline === null || i.target === null || i.baseline <= i.target) {
          err(
            'INVALID_BASELINE',
            `"${i.name}": chỉ tiêu giảm cần giá trị ban đầu lớn hơn mục tiêu`,
            i.code,
          );
        }
      }
    }
    if (i.scoringMethod === 'WEIGHTED_INDICATORS' && children(i.id).length === 0) {
      err('NO_INDICATORS', `"${i.name}": phương pháp trọng số cần ít nhất 1 chỉ tiêu con`, i.code);
    }
    if (i.scoringMethod === 'KPI_COMPOSITE' && children(i.id).length > 0) {
      warn(
        'IGNORED_CHILDREN',
        `"${i.name}": phương pháp KPI tổng hợp không dùng chỉ tiêu con`,
        i.code,
      );
    }
  }

  // Tổng điểm tiêu chí chung
  const generalItems = items.filter((i) => i.kind === 'GENERAL_ITEM');
  const generalTotal = sum(generalItems.map((i) => d(i.maxPoints)));
  if (!generalTotal.eq(generalMax)) {
    err(
      'GENERAL_TOTAL',
      `Tổng điểm tiêu chí chung = ${fmt(generalTotal, 2)}, phải bằng ${fmt(generalMax, 2)}`,
    );
  }
  for (const g of items.filter((i) => i.kind === 'GENERAL_GROUP')) {
    const s = sum(children(g.id).map((c) => d(c.maxPoints)));
    if (!s.eq(g.maxPoints))
      err(
        'GROUP_TOTAL',
        `Nhóm "${g.name}": tổng điểm mục con = ${fmt(s, 2)}, phải bằng ${fmt(g.maxPoints, 2)}`,
        g.code,
      );
  }

  // Tổng điểm các trục
  const axes = items.filter((i) => i.kind === 'AXIS');
  const axisTotal = sum(axes.map((a) => d(a.maxPoints)));
  if (axes.length === 0) err('NO_AXIS', 'Chưa có trục kết quả nhiệm vụ');
  if (!axisTotal.eq(resultMax))
    err('AXIS_TOTAL', `Tổng điểm các trục = ${fmt(axisTotal, 2)}, phải bằng ${fmt(resultMax, 2)}`);

  // Tổng trọng số chỉ tiêu con = 100
  for (const a of axes.filter((x) => x.scoringMethod === 'WEIGHTED_INDICATORS')) {
    const kids = children(a.id);
    const missing = kids.filter((k) => k.weight === null || k.weight <= 0);
    if (missing.length > 0) {
      err(
        'MISSING_WEIGHT',
        `Trục "${a.name}": chỉ tiêu chưa có trọng số: ${missing.map((m) => m.code).join(', ')}`,
        a.code,
      );
    } else {
      const w = sum(kids.map((k) => d(k.weight!)));
      if (!w.eq(100))
        err(
          'WEIGHT_TOTAL',
          `Trục "${a.name}": tổng trọng số = ${fmt(w, 2)}%, phải bằng 100%`,
          a.code,
        );
    }
  }

  if (rule) {
    if (!d(generalMax).plus(resultMax).eq(rule.scale.max)) {
      err(
        'SCALE_MISMATCH',
        `Điểm chung + điểm kết quả = ${fmt(generalMax + resultMax, 2)}, khác thang điểm ${fmt(rule.scale.max, 2)} của bộ quy tắc`,
      );
    }
    if (generalMax !== rule.scale.generalMax || resultMax !== rule.scale.resultMax) {
      warn('SCALE_SPLIT', 'Cơ cấu điểm chung/kết quả khác với bộ quy tắc đã chọn');
    }
    if (items.some((i) => i.allowNotApplicable) && rule.notApplicable.policy === 'NOT_ALLOWED') {
      warn(
        'NA_NOT_ALLOWED',
        'Có tiêu chí cho phép "không áp dụng" nhưng bộ quy tắc không cho phép loại trừ tiêu chí',
      );
    }
  } else {
    warn('NO_RULESET', 'Chưa gắn bộ quy tắc tính điểm');
  }
  return issues;
}
