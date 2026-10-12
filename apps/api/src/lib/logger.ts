/**
 * Logger JSON (pino). Che các trường nhạy cảm để không lọt mật khẩu/token/cookie vào log.
 */
import { pino, type Logger, type LoggerOptions } from 'pino';

export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.newPassword',
  '*.currentPassword',
  '*.passwordHash',
  '*.token',
  '*.tokenHash',
];

export function createLogger(options: { level: string; pretty?: boolean }): Logger {
  const base: LoggerOptions = {
    level: options.level,
    redact: { paths: REDACT_PATHS, censor: '[ĐÃ CHE]' },
    base: { service: 'kpi-api' },
    timestamp: pino.stdTimeFunctions.isoTime,
  };
  if (options.pretty) {
    return pino({
      ...base,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname,service' },
      },
    });
  }
  return pino(base);
}
