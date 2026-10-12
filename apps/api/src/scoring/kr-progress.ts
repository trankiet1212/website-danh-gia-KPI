/**
 * Tiến độ Kết quả then chốt (OKR) — CHỈ ĐỂ THEO DÕI, không phải điểm KPI
 * (không quy đổi thành điểm khi chưa có quy tắc được xác nhận — CLAUDE.md).
 */
import type { MeasureDirection, MeasureType } from '@kpi/shared';
import { Dec, ONE, ZERO, d, fmt, pct, sum, toNum } from './decimal.js';

export interface KrLike {
  measureType: MeasureType;
  direction: MeasureDirection;
  baseline: number | null;
  target: number;
  currentValue: number | null;
}

export function krProgress(kr: KrLike): { ratio: number | null; explanation: string } {
  if (kr.currentValue === null) return { ratio: null, explanation: 'Chưa cập nhật kết quả' };
  const cur = d(kr.currentValue);
  const target = d(kr.target);
  if (kr.measureType === 'BOOLEAN') {
    const ok = kr.direction === 'DECREASE' ? cur.lte(target) : cur.gte(target);
    return { ratio: ok ? 1 : 0, explanation: ok ? 'Đã đạt' : 'Chưa đạt' };
  }
  const base = d(kr.baseline ?? 0);
  let raw: Dec;
  let text: string;
  if (kr.direction === 'DECREASE') {
    const span = base.minus(target);
    if (span.lte(0))
      return { ratio: null, explanation: 'Giá trị ban đầu phải lớn hơn mục tiêu (chỉ tiêu giảm)' };
    raw = base.minus(cur).div(span);
    text = `(${fmt(base)} − ${fmt(cur)}) / (${fmt(base)} − ${fmt(target)})`;
  } else {
    const span = target.minus(base);
    if (span.lte(0)) return { ratio: null, explanation: 'Mục tiêu phải lớn hơn giá trị ban đầu' };
    raw = cur.minus(base).div(span);
    text = `(${fmt(cur)} − ${fmt(base)}) / (${fmt(target)} − ${fmt(base)})`;
  }
  const ratio = Dec.min(Dec.max(raw, ZERO), ONE);
  return {
    ratio: toNum(ratio),
    explanation: `${text} = ${pct(raw, 1)}${ratio.eq(raw) ? '' : ` → hiển thị ${pct(ratio, 1)}`}`,
  };
}

/** Tiến độ Mục tiêu = bình quân tiến độ KR (theo trọng số nếu có đủ trọng số). */
export function objectiveProgress(
  krs: { ratio: number | null; weight: number | null }[],
): number | null {
  const known = krs.filter((k) => k.ratio !== null);
  if (known.length === 0) return null;
  const weighted = known.every((k) => k.weight !== null && k.weight > 0);
  const w = known.map((k) => d(weighted ? k.weight! : 1));
  return toNum(sum(known.map((k, i) => d(k.ratio!).times(w[i]!))).div(sum(w)));
}
