/**
 * Middleware kiểm tra dữ liệu đầu vào bằng zod. Kết quả đã chuẩn hóa nằm ở `req.valid`.
 * (Express 5: req.query là getter chỉ đọc nên không ghi đè trực tiếp.)
 *
 *   router.post('/x', validate({ body: schema }), handler)
 */
import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { AppError } from '../lib/errors.js';

interface ValidationSchemas {
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodType;
}

export interface FieldIssue {
  location: 'body' | 'query' | 'params';
  path: string;
  message: string;
}

export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req, _res, next) => {
    const issues: FieldIssue[] = [];
    const valid: { body?: unknown; query?: unknown; params?: unknown } = {};

    for (const location of ['params', 'query', 'body'] as const) {
      const schema = schemas[location];
      if (!schema) continue;
      const result = schema.safeParse(req[location] ?? {});
      if (result.success) {
        valid[location] = result.data;
      } else {
        for (const issue of result.error.issues) {
          issues.push({ location, path: issue.path.join('.'), message: issue.message });
        }
      }
    }

    if (issues.length > 0) {
      next(new AppError('VALIDATION_ERROR', 'Dữ liệu gửi lên không hợp lệ', issues));
      return;
    }
    req.valid = valid;
    next();
  };
}
