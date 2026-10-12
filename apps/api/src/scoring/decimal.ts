/**
 * Số thập phân chính xác cho engine tính điểm (tránh sai số dấu phẩy động, ví dụ 80,325 làm tròn HALF_UP → 80,3).
 */
import { Decimal } from 'decimal.js';
import type { RuleConfig } from '@kpi/shared';

export const Dec = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type Dec = InstanceType<typeof Dec>;

export const d = (v: Decimal.Value): Dec => new Dec(v);
export const ZERO = d(0);
export const ONE = d(1);

export function sum(values: Dec[]): Dec {
  return values.reduce((acc, v) => acc.plus(v), ZERO);
}

const MODES = {
  HALF_UP: Decimal.ROUND_HALF_UP,
  HALF_EVEN: Decimal.ROUND_HALF_EVEN,
  DOWN: Decimal.ROUND_DOWN,
} as const;

/** Làm tròn theo cấu hình bộ quy tắc (chỉ dùng ở bước chốt kết quả). */
export function roundBy(value: Dec, rounding: RuleConfig['rounding']): Dec {
  return value.toDecimalPlaces(rounding.decimals, MODES[rounding.mode]);
}

/** Giá trị lưu/trả về: tối đa 6 chữ số thập phân (đủ để kiểm chứng). */
export function toNum(value: Dec): number {
  return value.toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toNumber();
}

/** Định dạng số kiểu Việt Nam cho phần giải thích: 84,375 */
export function fmt(value: Dec | number, decimals = 4): string {
  const v = typeof value === 'number' ? d(value) : value;
  const s = v.toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP).toString();
  return s.replace('.', ',');
}

export function pct(value: Dec, decimals = 3): string {
  return `${fmt(value.times(100), decimals)}%`;
}
