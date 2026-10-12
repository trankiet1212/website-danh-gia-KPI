import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Token ngẫu nhiên 256 bit, mã hóa base64url. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function hmacSha256(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

/** So sánh chuỗi trong thời gian hằng số (chống tấn công đo thời gian). */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
