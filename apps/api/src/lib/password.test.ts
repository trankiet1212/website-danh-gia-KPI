import { describe, expect, it } from 'vitest';
import { checkPasswordStrength } from '@kpi/shared';
import { generateTemporaryPassword, hashPassword, verifyPassword } from './password.js';

describe('mật khẩu', () => {
  it('băm Argon2id và kiểm tra đúng/sai', async () => {
    const hash = await hashPassword('Mat-Khau-Dung#2026');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(hash, 'Mat-Khau-Dung#2026')).toBe(true);
    expect(await verifyPassword(hash, 'mat-khau-dung#2026')).toBe(false);
    expect(await verifyPassword('khong-phai-hash', 'x')).toBe(false);
  });

  it('hai lần băm cùng mật khẩu cho kết quả khác nhau (có salt)', async () => {
    expect(await hashPassword('Giong-Nhau#123')).not.toBe(await hashPassword('Giong-Nhau#123'));
  });

  it('mật khẩu tạm luôn đạt chính sách mật khẩu', () => {
    for (let i = 0; i < 200; i++) {
      const p = generateTemporaryPassword();
      expect(p).toHaveLength(16);
      expect(checkPasswordStrength(p)).toEqual([]);
    }
  });

  it('chính sách mật khẩu', () => {
    expect(checkPasswordStrength('ngan')).not.toEqual([]);
    expect(checkPasswordStrength('chuthuongdaiquadi')).not.toEqual([]);
    expect(checkPasswordStrength('Abcdefgh1234')).toEqual([]);
    expect(checkPasswordStrength('Nguyenvana-2026', 'nguyenvana')).toContain(
      'Mật khẩu không được chứa tên đăng nhập',
    );
  });
});
