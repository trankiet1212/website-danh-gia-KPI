/**
 * Giới hạn tần suất xuất file (Excel/PDF tốn CPU) theo TÀI KHOẢN — chống làm chậm máy chủ do gửi liên tục.
 * Bộ đếm trong bộ nhớ tiến trình: triển khai nhiều tiến trình cần kho đếm dùng chung (ghi trong docs/10).
 */
import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { AppError } from '../lib/errors.js';

export function exportLimiter(limit = 30, windowMinutes = 5): RequestHandler {
  return rateLimit({
    windowMs: windowMinutes * 60_000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => `export:${req.auth?.userId ?? 'anon'}`,
    handler: (_req, _res, next) =>
      next(
        new AppError(
          'RATE_LIMITED',
          'Bạn xuất file quá nhiều lần trong thời gian ngắn. Vui lòng thử lại sau ít phút.',
        ),
      ),
  });
}
