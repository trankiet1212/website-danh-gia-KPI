/**
 * Gắn lỗi từ API vào biểu mẫu react-hook-form:
 *  - VALIDATION_ERROR: details = [{ path: 'assignment.unitId', message }]
 *  - DUPLICATE: details = { fields: ['employeeCode'] }
 * Trả về true nếu đã gắn được ít nhất một lỗi theo trường.
 */
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import type { z } from 'zod';
import { ApiClientError } from './api-client';

export function applyServerErrors<T extends FieldValues>(
  err: unknown,
  setError: UseFormSetError<T>,
  rename: Record<string, string> = {},
): boolean {
  if (!(err instanceof ApiClientError)) return false;
  let applied = false;
  if (err.code === 'VALIDATION_ERROR' && Array.isArray(err.details)) {
    for (const d of err.details as { path?: string; message?: string }[]) {
      if (d.path) {
        setError((rename[d.path] ?? d.path) as Path<T>, {
          type: 'server',
          message: d.message ?? 'Không hợp lệ',
        });
        applied = true;
      }
    }
  }
  if (err.code === 'DUPLICATE') {
    const fields = (err.details as { fields?: string[] } | undefined)?.fields ?? [];
    const toField: Record<string, string> = {
      employee_code: 'employeeCode',
      username: 'username',
      code: 'code',
    };
    for (const f of fields) {
      setError((toField[f] ?? f) as Path<T>, { type: 'server', message: err.message });
      applied = true;
    }
  }
  return applied;
}

/**
 * Kiểm tra payload bằng zod schema dùng chung (giống hệt backend) trước khi gửi.
 * Lỗi được gắn vào trường biểu mẫu; `rename` đổi đường dẫn khi tên trường biểu mẫu khác tên trong API.
 */
export function validatePayload<T extends FieldValues, S extends z.ZodType>(
  schema: S,
  payload: unknown,
  setError: UseFormSetError<T>,
  rename: Record<string, string> = {},
): z.output<S> | null {
  const result = schema.safeParse(payload);
  if (result.success) return result.data;
  for (const issue of result.error.issues) {
    const path = issue.path.join('.');
    setError((rename[path] ?? path) as Path<T>, { type: 'validate', message: issue.message });
  }
  return null;
}
