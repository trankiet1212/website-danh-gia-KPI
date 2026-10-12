/**
 * CORS theo whitelist cấu hình (CORS_ORIGINS). Chỉ origin trong danh sách được gửi cookie
 * (credentials). Origin lạ không bị báo lỗi 500 — chỉ không nhận header CORS nên trình duyệt chặn.
 * Request không có header Origin (curl, server-to-server, same-origin GET) không bị ảnh hưởng.
 */
import type { CorsOptions } from 'cors';

export function buildCorsOptions(allowedOrigins: readonly string[]): CorsOptions {
  const allowed = new Set(allowedOrigins);
  return {
    origin(origin, callback) {
      callback(null, origin === undefined ? false : allowed.has(origin));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'Content-Disposition'],
    maxAge: 600,
  };
}
