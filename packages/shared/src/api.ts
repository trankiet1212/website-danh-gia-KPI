/**
 * Hợp đồng phản hồi API dùng chung (docs/04-api.md §6.1).
 */
import { z } from 'zod';

export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'BAD_REQUEST',
  'UNAUTHENTICATED',
  'ACCOUNT_LOCKED',
  'PASSWORD_CHANGE_REQUIRED',
  'CSRF_INVALID',
  'FORBIDDEN',
  'NOT_FOUND',
  'DUPLICATE',
  'CONFLICT_VERSION',
  'INVALID_TRANSITION',
  'BUSINESS_RULE',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA',
  'RATE_LIMITED',
  'SERVICE_UNAVAILABLE',
  'INTERNAL',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
}

export interface ApiSuccess<T> {
  data: T;
  meta?: PageMeta;
}

/** Tham số phân trang chuẩn cho mọi endpoint danh sách. */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(200).optional(),
  sort: z
    .string()
    .regex(/^[a-zA-Z_.]+:(asc|desc)$/, 'Định dạng sort phải là field:asc hoặc field:desc')
    .optional(),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export type HealthStatus = 'ok' | 'degraded';
export type DependencyStatus = 'up' | 'down';

export interface HealthResponse {
  status: HealthStatus;
  service: string;
  /** Chỉ trả khi không phải production (tránh lộ thông tin triển khai qua endpoint công khai). */
  version?: string;
  environment?: string;
  uptimeSeconds?: number;
  timestamp: string;
  checks: {
    database: { status: DependencyStatus; latencyMs: number | null };
  };
}
