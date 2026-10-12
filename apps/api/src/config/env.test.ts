import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.js';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db?schema=public',
  SESSION_SECRET: 'x'.repeat(40),
};

describe('parseEnv', () => {
  it('áp giá trị mặc định cho môi trường phát triển', () => {
    const env = parseEnv({ ...base });
    expect(env.NODE_ENV).toBe('development');
    expect(env.API_PORT).toBe(4000);
    expect(env.CORS_ORIGINS).toEqual([]);
    expect(env.TRUST_PROXY).toBe(false);
    expect(env.BODY_LIMIT).toBe('1mb');
  });

  it('chuẩn hóa danh sách CORS_ORIGINS (bỏ khoảng trắng, dấu / cuối)', () => {
    const env = parseEnv({
      ...base,
      CORS_ORIGINS: ' http://localhost:5173/ , https://kpi.example.vn ',
    });
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:5173', 'https://kpi.example.vn']);
  });

  it('từ chối origin có đường dẫn hoặc sai định dạng', () => {
    expect(() => parseEnv({ ...base, CORS_ORIGINS: 'https://a.vn/app' })).toThrow(
      /Origin không hợp lệ/,
    );
    expect(() => parseEnv({ ...base, CORS_ORIGINS: 'not-a-url' })).toThrow(/Origin không hợp lệ/);
  });

  it('bắt buộc DATABASE_URL dạng postgresql://', () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
    expect(() => parseEnv({ DATABASE_URL: 'mysql://x' })).toThrow(/postgresql/);
  });

  it('bắt buộc SESSION_SECRET đủ dài; giá trị mặc định cho phiên đăng nhập', () => {
    expect(() => parseEnv({ DATABASE_URL: base.DATABASE_URL })).toThrow(/SESSION_SECRET/);
    expect(() => parseEnv({ ...base, SESSION_SECRET: 'ngan' })).toThrow(/32 ký tự/);
    const env = parseEnv(base);
    expect(env).toMatchObject({
      SESSION_IDLE_MINUTES: 30,
      SESSION_ABSOLUTE_HOURS: 8,
      LOGIN_MAX_ATTEMPTS: 5,
      LOGIN_LOCK_MINUTES: 15,
    });
  });

  it('TRUST_PROXY nhận true/false/số hop', () => {
    expect(parseEnv({ ...base, TRUST_PROXY: 'true' }).TRUST_PROXY).toBe(true);
    expect(parseEnv({ ...base, TRUST_PROXY: '1' }).TRUST_PROXY).toBe(1);
    expect(() => parseEnv({ ...base, TRUST_PROXY: 'abc' })).toThrow(/TRUST_PROXY/);
  });

  describe('production', () => {
    const prod = { ...base, NODE_ENV: 'production' };

    it('bắt buộc khai báo CORS_ORIGINS', () => {
      expect(() => parseEnv(prod)).toThrow(/Production bắt buộc khai báo CORS_ORIGINS/);
    });

    it('chỉ chấp nhận origin HTTPS', () => {
      expect(() => parseEnv({ ...prod, CORS_ORIGINS: 'http://kpi.example.vn' })).toThrow(/HTTPS/);
      expect(parseEnv({ ...prod, CORS_ORIGINS: 'https://kpi.example.vn' }).CORS_ORIGINS).toEqual([
        'https://kpi.example.vn',
      ]);
    });

    it('từ chối mật khẩu mẫu CHANGE_ME', () => {
      expect(() =>
        parseEnv({
          ...prod,
          CORS_ORIGINS: 'https://kpi.example.vn',
          DATABASE_URL: 'postgresql://u:CHANGE_ME@db:5432/x',
        }),
      ).toThrow(/CHANGE_ME/);
    });
  });
});
