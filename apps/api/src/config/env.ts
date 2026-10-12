/**
 * Đọc và kiểm tra biến môi trường một lần khi khởi động (fail fast).
 * File .env đặt ở thư mục gốc monorepo; biến có sẵn trong môi trường (production) được ưu tiên.
 */
import path from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

/** Chuẩn hóa danh sách origin "a,b,c" → mảng origin hợp lệ (không có dấu / cuối). */
const originList = z
  .string()
  .default('')
  .transform((raw, ctx) => {
    const items = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const origins: string[] = [];
    for (const item of items) {
      try {
        const url = new URL(item);
        if (url.origin === 'null' || url.pathname !== '/' || url.search || url.hash)
          throw new Error();
        origins.push(url.origin);
      } catch {
        ctx.addIssue({ code: 'custom', message: `Origin không hợp lệ: "${item}"` });
      }
    }
    return origins;
  });

const trustProxy = z
  .string()
  .default('false')
  .transform((v, ctx): boolean | number => {
    if (v === 'true') return true;
    if (v === 'false') return false;
    const n = Number(v);
    if (Number.isInteger(n) && n >= 0) return n;
    ctx.addIssue({ code: 'custom', message: 'TRUST_PROXY phải là true, false hoặc số hop' });
    return false;
  });

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    DATABASE_URL: z
      .string({ error: 'Thiếu DATABASE_URL' })
      .refine(
        (v) => /^postgres(ql)?:\/\//.test(v),
        'DATABASE_URL phải là chuỗi kết nối postgresql://',
      ),
    CORS_ORIGINS: originList,
    LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
    TRUST_PROXY: trustProxy,
    BODY_LIMIT: z
      .string()
      .regex(/^\d+(kb|mb)$/i, 'BODY_LIMIT dạng 100kb hoặc 1mb')
      .default('1mb'),
    // ---- Phiên đăng nhập (docs/adr/0002) ----
    SESSION_SECRET: z
      .string({ error: 'Thiếu SESSION_SECRET (chuỗi ngẫu nhiên ≥ 32 ký tự)' })
      .min(32, 'SESSION_SECRET phải dài ít nhất 32 ký tự'),
    SESSION_IDLE_MINUTES: z.coerce
      .number()
      .int()
      .min(5)
      .max(24 * 60)
      .default(30),
    SESSION_ABSOLUTE_HOURS: z.coerce
      .number()
      .int()
      .min(1)
      .max(24 * 7)
      .default(8),
    LOGIN_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(20).default(5),
    LOGIN_LOCK_MINUTES: z.coerce
      .number()
      .int()
      .min(1)
      .max(24 * 60)
      .default(15),
    LOGIN_RATE_LIMIT: z.coerce.number().int().min(1).max(1000).default(20),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    if (/CHANGE_ME/i.test(env.SESSION_SECRET)) {
      ctx.addIssue({
        code: 'custom',
        path: ['SESSION_SECRET'],
        message: 'SESSION_SECRET còn giá trị mẫu CHANGE_ME',
      });
    }
    // Production: bắt buộc khai báo origin rõ ràng và dùng HTTPS.
    if (env.CORS_ORIGINS.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['CORS_ORIGINS'],
        message: 'Production bắt buộc khai báo CORS_ORIGINS',
      });
    }
    for (const o of env.CORS_ORIGINS) {
      if (!o.startsWith('https://')) {
        ctx.addIssue({
          code: 'custom',
          path: ['CORS_ORIGINS'],
          message: `Production chỉ chấp nhận origin HTTPS: ${o}`,
        });
      }
    }
    if (/CHANGE_ME/i.test(env.DATABASE_URL)) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message: 'DATABASE_URL còn giá trị mẫu CHANGE_ME',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/** Phân tích object biến môi trường; ném lỗi tiếng Việt liệt kê đầy đủ biến sai. */
export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map(
      (i) => `  - ${i.path.join('.') || '(env)'}: ${i.message}`,
    );
    throw new Error(`Cấu hình môi trường không hợp lệ:\n${lines.join('\n')}`);
  }
  return result.data;
}

let cached: Env | undefined;

/** Nạp .env ở thư mục gốc (nếu có) rồi kiểm tra. Gọi nhiều lần trả về cùng kết quả. */
export function loadEnv(): Env {
  if (cached) return cached;
  loadDotenv({ path: path.resolve(import.meta.dirname, '../../../../.env'), quiet: true });
  cached = parseEnv(process.env);
  return cached;
}
