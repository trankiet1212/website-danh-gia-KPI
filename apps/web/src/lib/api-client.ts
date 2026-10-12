/**
 * Client gọi API /api/v1.
 *  - Luôn gửi cookie phiên (credentials: 'include').
 *  - Tự gắn header X-CSRF-Token cho request thay đổi dữ liệu. Token giữ TRONG BỘ NHỚ (không dùng
 *    localStorage); nếu hết hạn/không khớp, lấy lại token một lần rồi thử lại.
 *  - Chuẩn hóa lỗi theo định dạng { error: { code, message, details, requestId } } (docs/04-api.md).
 */
import type { ApiErrorBody, ErrorCode, PageMeta } from '@kpi/shared';

export const API_BASE = '/api/v1';

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: ErrorCode | 'NETWORK_ERROR' | 'UNKNOWN';
  readonly details?: unknown;
  readonly requestId?: string;
  /** Dữ liệu `data` đi kèm phản hồi lỗi (ví dụ health 503 vẫn trả trạng thái chi tiết). */
  readonly data?: unknown;

  constructor(init: {
    status: number;
    code: ApiClientError['code'];
    message: string;
    details?: unknown;
    requestId?: string;
    data?: unknown;
  }) {
    super(init.message);
    this.name = 'ApiClientError';
    this.status = init.status;
    this.code = init.code;
    this.details = init.details;
    this.requestId = init.requestId;
    this.data = init.data;
  }
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as ApiErrorBody).error?.code === 'string'
  );
}

/** Chuyển phản hồi HTTP thành dữ liệu hoặc ApiClientError (tách riêng để dễ kiểm thử). */
export async function parseResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let body: unknown = undefined;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = undefined;
    }
  }
  if (res.ok) return body as T;

  if (isApiErrorBody(body)) {
    throw new ApiClientError({
      status: res.status,
      code: body.error.code,
      message: body.error.message,
      details: body.error.details,
      requestId: body.error.requestId,
    });
  }
  const data =
    typeof body === 'object' && body !== null && 'data' in body
      ? (body as { data: unknown }).data
      : undefined;
  throw new ApiClientError({
    status: res.status,
    code: 'UNKNOWN',
    message: `Máy chủ phản hồi lỗi (HTTP ${res.status})`,
    requestId: res.headers.get('x-request-id') ?? undefined,
    data,
  });
}

// ---------------------------------------------------------------------------
// CSRF token (chỉ trong bộ nhớ của tab)
// ---------------------------------------------------------------------------
let csrfToken: string | null = null;
export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Gọi khi API báo phiên hết hạn (401) — ứng dụng đăng ký để chuyển về trang đăng nhập. */
let onUnauthenticated: (() => void) | null = null;
export function setUnauthenticatedHandler(handler: (() => void) | null): void {
  onUnauthenticated = handler;
}

async function rawFetch(path: string, init: RequestInit): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body !== undefined && !headers.has('Content-Type'))
    headers.set('Content-Type', 'application/json');
  if (UNSAFE.has(method) && csrfToken) headers.set('X-CSRF-Token', csrfToken);
  try {
    return await fetch(`${API_BASE}${path}`, { ...init, method, headers, credentials: 'include' });
  } catch {
    throw new ApiClientError({
      status: 0,
      code: 'NETWORK_ERROR',
      message: 'Không kết nối được tới máy chủ. Kiểm tra kết nối mạng hoặc liên hệ quản trị.',
    });
  }
}

async function refreshCsrf(): Promise<boolean> {
  try {
    const res = await rawFetch('/auth/csrf', { method: 'GET' });
    const body = await parseResponse<{ data: { csrfToken: string } }>(res);
    setCsrfToken(body.data.csrfToken);
    return true;
  } catch {
    return false;
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res = await rawFetch(path, init);
  if (res.status === 403 && UNSAFE.has((init.method ?? 'GET').toUpperCase())) {
    const peek = await res
      .clone()
      .json()
      .catch(() => null);
    if (isApiErrorBody(peek) && peek.error.code === 'CSRF_INVALID' && (await refreshCsrf())) {
      res = await rawFetch(path, init);
    }
  }
  try {
    return await parseResponse<T>(res);
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 401 && !path.startsWith('/auth/login')) {
      onUnauthenticated?.();
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Tiện ích gọi API
// ---------------------------------------------------------------------------
export interface Page<T> {
  data: T[];
  meta: PageMeta;
}

export const api = {
  get: <T>(path: string) => apiFetch<{ data: T }>(path).then((r) => r.data),
  page: <T>(path: string) => apiFetch<Page<T>>(path),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<{ data: T }>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }).then(
      (r) => r.data,
    ),
  patch: <T>(path: string, body: unknown) =>
    apiFetch<{ data: T }>(path, { method: 'PATCH', body: JSON.stringify(body) }).then(
      (r) => r.data,
    ),
  put: <T>(path: string, body: unknown) =>
    apiFetch<{ data: T }>(path, { method: 'PUT', body: JSON.stringify(body) }).then((r) => r.data),
  del: <T>(path: string) => apiFetch<{ data: T }>(path, { method: 'DELETE' }).then((r) => r.data),
};

/** Tạo query string, bỏ qua giá trị rỗng. */
export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/** Thông điệp lỗi thân thiện để hiển thị. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiClientError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Đã xảy ra lỗi không xác định';
}

/**
 * Tải file (Excel/PDF) do máy chủ sinh: gọi API thật (cookie phiên + CSRF), lấy tên file từ
 * Content-Disposition rồi lưu về máy. Lỗi từ API được ném ra như các lời gọi khác.
 */
export async function downloadFile(path: string, body?: unknown): Promise<string> {
  const init: RequestInit =
    body === undefined ? { method: 'GET' } : { method: 'POST', body: JSON.stringify(body) };
  const res = await rawFetch(path, init);
  if (!res.ok) await parseResponse(res);
  const disposition = res.headers.get('content-disposition') ?? '';
  const match =
    /filename\*=UTF-8''([^;]+)/.exec(disposition) ?? /filename="([^"]+)"/.exec(disposition);
  const fileName = match?.[1] ? decodeURIComponent(match[1]) : 'bao-cao';
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return fileName;
}
