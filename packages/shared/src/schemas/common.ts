/**
 * Khối zod dùng chung cho các schema nghiệp vụ.
 */
import { z } from 'zod';

/** Ngày nghiệp vụ dạng YYYY-MM-DD (không giờ, không múi giờ). */
export const dateOnly = z
  .string({ error: 'Vui lòng nhập ngày' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có dạng YYYY-MM-DD')
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v);
  }, 'Ngày không hợp lệ');

export const uuid = z.uuid({ error: 'Mã định danh không hợp lệ' });

/** UUID không bắt buộc: ô chọn để trống ('') → null. */
export const optionalUuid = z
  .union([z.literal('').transform(() => null), uuid])
  .nullish()
  .transform((v) => v ?? null);

/** Chuỗi bắt buộc, đã cắt khoảng trắng đầu/cuối và gộp khoảng trắng thừa. */
export const requiredText = (label: string, max = 200) =>
  z
    .string({ error: `${label} là bắt buộc` })
    .transform((v) => v.normalize('NFC').replace(/\s+/g, ' ').trim())
    .pipe(z.string().min(1, `${label} là bắt buộc`).max(max, `${label} tối đa ${max} ký tự`));

/** Chuỗi không bắt buộc: chuỗi rỗng → null. */
export const optionalText = (label: string, max = 500) =>
  z
    .string()
    .transform((v) => v.normalize('NFC').trim())
    .pipe(z.string().max(max, `${label} tối đa ${max} ký tự`))
    .transform((v) => (v === '' ? null : v))
    .nullish();

/** Mã danh mục: chữ in hoa, số, dấu gạch. Tự chuyển chữ thường thành chữ hoa. */
export const codeField = (label: string, max = 50) =>
  z
    .string({ error: `${label} là bắt buộc` })
    .transform((v) => v.trim().toUpperCase())
    .pipe(
      z
        .string()
        .min(1, `${label} là bắt buộc`)
        .max(max, `${label} tối đa ${max} ký tự`)
        .regex(/^[A-Z0-9][A-Z0-9._-]*$/, `${label} chỉ gồm chữ không dấu, số và . _ -`),
    );

/** Số phiên bản cho cập nhật có kiểm soát xung đột (optimistic locking). */
export const versionField = z.coerce
  .number({ error: 'Thiếu phiên bản dữ liệu' })
  .int()
  .min(1, 'Phiên bản dữ liệu không hợp lệ');

/** Tham số boolean trên query string ("true"/"false"). */
export const queryBoolean = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();

/** Tạo schema sort dạng "field:asc|desc" chỉ cho phép các trường trong danh sách. */
export function sortParam<const F extends readonly [string, ...string[]]>(fields: F) {
  return z
    .string()
    .regex(/^[a-zA-Z]+:(asc|desc)$/, 'Định dạng sắp xếp phải là truong:asc hoặc truong:desc')
    .transform((v) => {
      const [field, dir] = v.split(':') as [string, 'asc' | 'desc'];
      return { field, dir };
    })
    .refine((v) => (fields as readonly string[]).includes(v.field), {
      message: `Chỉ được sắp xếp theo: ${fields.join(', ')}`,
    })
    .transform((v) => v as { field: F[number]; dir: 'asc' | 'desc' })
    .optional();
}

export const pageParams = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v ? v : undefined)),
};
