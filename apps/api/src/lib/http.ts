/** Tiện ích đọc dữ liệu đã validate và trả phản hồi theo định dạng chuẩn. */
import type { Request, Response } from 'express';
import type { PageMeta } from '@kpi/shared';

export const validBody = <T>(req: Request): T => req.valid.body as T;
export const validQuery = <T>(req: Request): T => req.valid.query as T;
export const validParams = <T>(req: Request): T => req.valid.params as T;

export function sendData<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ data });
}

export function sendPage<T>(res: Response, data: T[], meta: PageMeta): void {
  res.json({ data, meta });
}
