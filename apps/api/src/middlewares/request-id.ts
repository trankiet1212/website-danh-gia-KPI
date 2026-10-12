import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

export const REQUEST_ID_HEADER = 'x-request-id';
const SAFE_ID = /^[A-Za-z0-9._-]{8,64}$/;

/**
 * Sinh mã request: dùng lại X-Request-Id từ reverse proxy nếu hợp lệ (chống log injection),
 * ngược lại tạo UUID mới. Luôn trả lại qua header X-Request-Id.
 * Dùng làm `genReqId` cho pino-http (pino-http gán kết quả vào req.id).
 */
export function genRequestId(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const id = typeof incoming === 'string' && SAFE_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', id);
  return id;
}
