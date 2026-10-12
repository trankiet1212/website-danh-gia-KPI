/**
 * Chuyển lỗi ràng buộc của Prisma/PostgreSQL thành AppError có thông điệp tiếng Việt.
 */
import { AppError } from './errors.js';

interface PrismaLikeError {
  code?: string;
  meta?: {
    target?: unknown;
    modelName?: string;
    driverAdapterError?: { cause?: { constraint?: unknown } };
  };
  message?: string;
}

const FIELD_LABELS: Record<string, string> = {
  code: 'Mã',
  employee_code: 'Mã cán bộ',
  employeeCode: 'Mã cán bộ',
  username: 'Tên đăng nhập',
  employee_id: 'Cán bộ (đã có tài khoản)',
  employeeId: 'Cán bộ (đã có tài khoản)',
};

function uniqueFields(err: PrismaLikeError): string[] {
  const target = err.meta?.target ?? err.meta?.driverAdapterError?.cause?.constraint;
  if (Array.isArray(target)) return target.map(String);
  if (typeof target === 'string') return [target];
  if (target && typeof target === 'object' && 'fields' in target) {
    const fields = (target as { fields: unknown }).fields;
    if (Array.isArray(fields)) return fields.map(String);
  }
  return [];
}

export function mapPrismaError(err: unknown): unknown {
  const e = err as PrismaLikeError;
  if (e?.code === 'P2002') {
    const fields = uniqueFields(e);
    const label = fields.map((f) => FIELD_LABELS[f] ?? f).join(', ') || 'Giá trị';
    return new AppError('DUPLICATE', `${label} đã tồn tại`, { fields });
  }
  if (e?.code === 'P2025') return new AppError('NOT_FOUND', 'Không tìm thấy dữ liệu');
  if (e?.code === 'P2003') {
    return new AppError(
      'BUSINESS_RULE',
      'Dữ liệu đang được tham chiếu hoặc tham chiếu không hợp lệ',
    );
  }
  // Lỗi do trigger nghiệp vụ trong PostgreSQL (ví dụ: 2 phân công chính đang hiệu lực)
  if (typeof e?.message === 'string' && e.message.includes('phân công chính đang hiệu lực')) {
    return new AppError('BUSINESS_RULE', 'Cán bộ đã có phân công chính đang hiệu lực');
  }
  // Trigger bảo vệ dữ liệu (hồ sơ đã duyệt, bản đã xác nhận, bảng chỉ ghi thêm) — docs/03
  if (
    typeof e?.message === 'string' &&
    /bị khóa|bất biến|chỉ được ghi thêm|phải thực hiện quy trình mở lại|Không được xóa/.test(
      e.message,
    )
  ) {
    return new AppError(
      'INVALID_TRANSITION',
      'Dữ liệu đã bị khóa hoặc không được phép thay đổi theo cách này (cần quy trình hợp lệ, ví dụ mở lại).',
    );
  }
  return err;
}

/** Bọc lời gọi DB: lỗi ràng buộc → AppError; lỗi khác giữ nguyên. */
export async function withDbErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw mapPrismaError(err);
  }
}
