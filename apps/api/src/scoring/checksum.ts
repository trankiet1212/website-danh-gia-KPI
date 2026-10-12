import { createHash } from 'node:crypto';

/** JSON chuẩn hóa (khóa sắp xếp) để băm ổn định — phát hiện thay đổi dữ liệu đã chốt. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

export function checksumOf(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}
