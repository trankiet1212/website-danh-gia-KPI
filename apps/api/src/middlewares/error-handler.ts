/**
 * Xử lý lỗi tập trung. Định dạng: { error: { code, message, details?, requestId } }.
 * Không bao giờ trả stack trace hay thông điệp nội bộ cho client; lỗi 5xx được ghi log đầy đủ.
 */
import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { Logger } from 'pino';
import type { ApiErrorBody } from '@kpi/shared';
import { mapPrismaError } from '../lib/db-errors.js';
import { AppError } from '../lib/errors.js';

/** Lỗi do body-parser của Express ném ra (JSON hỏng, quá dung lượng...). */
interface BodyParserError {
  type?: string;
  status?: number;
}

function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const bp = err as BodyParserError;
  if (bp?.type === 'entity.parse.failed') {
    return new AppError('BAD_REQUEST', 'Nội dung JSON không hợp lệ');
  }
  if (bp?.type === 'entity.too.large') {
    return new AppError('PAYLOAD_TOO_LARGE', 'Dữ liệu gửi lên vượt quá dung lượng cho phép');
  }
  if (bp?.type === 'encoding.unsupported' || bp?.type === 'charset.unsupported') {
    return new AppError('UNSUPPORTED_MEDIA', 'Bảng mã dữ liệu không được hỗ trợ');
  }
  // Lớp phòng thủ: lỗi ràng buộc DB lọt qua service (trùng khóa, trigger khóa dữ liệu) → mã 4xx thay vì 500
  const mapped = mapPrismaError(err);
  if (mapped instanceof AppError) return mapped;
  return new AppError('INTERNAL', 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.');
}

export function notFoundHandler(): RequestHandler {
  return (req, _res, next) => {
    next(new AppError('NOT_FOUND', `Không tìm thấy đường dẫn ${req.method} ${req.path}`));
  };
}

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (err, req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    const appError = toAppError(err);
    if (appError.status >= 500) {
      logger.error(
        { err, requestId: req.id, method: req.method, url: req.originalUrl },
        'Lỗi xử lý request',
      );
    }
    const body: ApiErrorBody = {
      error: {
        code: appError.code,
        message: appError.message,
        ...(appError.details === undefined ? {} : { details: appError.details }),
        requestId: req.id,
      },
    };
    res.status(appError.status).json(body);
  };
}
