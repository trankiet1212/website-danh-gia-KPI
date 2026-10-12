import express from 'express';
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { paginationQuerySchema } from '@kpi/shared';
import { errorHandler } from './error-handler.js';
import { validate } from './validate.js';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.post(
    '/items/:id',
    validate({
      params: z.object({ id: z.uuid({ error: 'id phải là UUID' }) }),
      query: paginationQuerySchema,
      body: z.object({ name: z.string().trim().min(1, 'Tên không được để trống') }),
    }),
    (req, res) => {
      res.json({ data: req.valid });
    },
  );
  app.use(errorHandler(pino({ level: 'silent' })));
  return app;
}

describe('validate middleware', () => {
  const id = '0191c6a0-0000-7000-8000-000000000001';

  it('chuẩn hóa dữ liệu hợp lệ và áp giá trị mặc định', async () => {
    const res = await request(buildApp())
      .post(`/items/${id}?page=2`)
      .send({ name: '  Kế hoạch  ' });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      params: { id },
      query: { page: 2, pageSize: 20 },
      body: { name: 'Kế hoạch' },
    });
  });

  it('trả 400 VALIDATION_ERROR kèm lỗi từng trường', async () => {
    const res = await request(buildApp())
      .post('/items/khong-phai-uuid?pageSize=500')
      .send({ name: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const fields = res.body.error.details.map(
      (d: { location: string; path: string }) => `${d.location}.${d.path}`,
    );
    expect(fields).toEqual(expect.arrayContaining(['params.id', 'query.pageSize', 'body.name']));
  });
});
