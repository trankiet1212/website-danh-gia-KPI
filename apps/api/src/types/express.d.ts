import 'express-serve-static-core';
import type { AuthContext } from '../auth/types.js';

declare module 'express-serve-static-core' {
  interface Request {
    /** Mã định danh request — trả về ở header X-Request-Id và trong body lỗi. */
    id: string;
    /** Dữ liệu đã qua zod validate (middleware validate). */
    valid: {
      body?: unknown;
      query?: unknown;
      params?: unknown;
    };
    /** Người dùng đã xác thực (middleware authenticate). */
    auth?: AuthContext;
  }
}
