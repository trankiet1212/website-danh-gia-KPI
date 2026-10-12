/**
 * Lỗi nghiệp vụ có mã chuẩn (docs/04-api.md §6.1). Service ném AppError; middleware
 * error-handler chuyển thành JSON `{ error: { code, message, details?, requestId } }`.
 */
import type { ErrorCode } from '@kpi/shared';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  BAD_REQUEST: 400,
  UNAUTHENTICATED: 401,
  ACCOUNT_LOCKED: 423,
  PASSWORD_CHANGE_REQUIRED: 403,
  CSRF_INVALID: 403,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  DUPLICATE: 409,
  CONFLICT_VERSION: 409,
  INVALID_TRANSITION: 409,
  BUSINESS_RULE: 422,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA: 415,
  RATE_LIMITED: 429,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }
}

export const httpStatusOf = (code: ErrorCode): number => STATUS_BY_CODE[code];
