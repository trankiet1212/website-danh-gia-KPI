/**
 * Băm và kiểm tra mật khẩu bằng Argon2id (khuyến nghị OWASP).
 * Tham số: m = 19 MiB, t = 2, p = 1 — mức tối thiểu khuyến nghị, phù hợp máy chủ cơ quan.
 */
import { randomInt } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

/** `Algorithm.Argon2id` = 2 (const enum của thư viện không dùng trực tiếp được với verbatimModuleSyntax). */
const ARGON2ID = 2;
const OPTIONS = { algorithm: ARGON2ID, memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

export async function verifyPassword(hashed: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashed, plain);
  } catch {
    return false;
  }
}

/**
 * Băm giả dùng khi tên đăng nhập không tồn tại — vẫn tốn thời gian như kiểm tra thật
 * để kẻ tấn công không dò được tài khoản qua thời gian phản hồi.
 */
let dummyHash: Promise<string> | undefined;
export async function burnPasswordCheck(plain: string): Promise<void> {
  dummyHash ??= hashPassword('khong-phai-mat-khau-that-' + randomInt(1e9));
  await verifyPassword(await dummyHash, plain);
}

const CHARSETS = {
  lower: 'abcdefghijkmnopqrstuvwxyz',
  upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
  digit: '23456789',
  special: '!@#$%&*-_=+?',
};

/** Sinh mật khẩu tạm 16 ký tự, đủ 4 nhóm ký tự, bỏ ký tự dễ nhầm (0/O, 1/l/I). */
export function generateTemporaryPassword(length = 16): string {
  const all = Object.values(CHARSETS).join('');
  const chars = Object.values(CHARSETS).map((set) => set[randomInt(set.length)]!);
  while (chars.length < length) chars.push(all[randomInt(all.length)]!);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join('');
}
