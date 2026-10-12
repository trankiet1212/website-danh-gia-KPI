/**
 * Kiểm thử khung API (không cần database): health-check, định dạng lỗi, CORS, header bảo mật.
 */
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { TEST_ORIGIN, buildTestApp } from '../helpers/test-app.js';

describe('GET /api/v1/health', () => {
  it('200 + status ok khi database hoạt động', async () => {
    const res = await request(buildTestApp()).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      status: 'ok',
      service: 'kpi-api',
      version: '0.0.0-test',
      environment: 'test',
      checks: { database: { status: 'up', latencyMs: 3 } },
    });
    expect(new Date(res.body.data.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('503 + degraded khi database lỗi, KHÔNG lộ thông điệp lỗi nội bộ', async () => {
    const secret = 'password authentication failed for user "kpi_app" at 10.0.0.5';
    const res = await request(
      buildTestApp({ db: { ok: false, latencyMs: null, error: secret } }),
    ).get('/api/v1/health');
    expect(res.status).toBe(503);
    expect(res.body.data.status).toBe('degraded');
    expect(res.body.data.checks.database).toEqual({ status: 'down', latencyMs: null });
    expect(JSON.stringify(res.body)).not.toContain('kpi_app');
  });

  it('liveness không phụ thuộc database', async () => {
    const res = await request(buildTestApp({ db: { ok: false, latencyMs: null } })).get(
      '/api/v1/health/live',
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { status: 'ok' } });
  });

  it('không cho cache phản hồi API', async () => {
    const res = await request(buildTestApp()).get('/api/v1/health');
    expect(res.headers['cache-control']).toBe('no-store');
  });
});

describe('Định dạng lỗi chuẩn', () => {
  it('404 NOT_FOUND kèm requestId trùng header X-Request-Id (ngoài /api/v1)', async () => {
    const res = await request(buildTestApp()).get('/khong-ton-tai');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
    expect(res.body.error).not.toHaveProperty('stack');
  });

  it('400 BAD_REQUEST khi JSON hỏng', async () => {
    const res = await request(buildTestApp())
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{"a":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('413 PAYLOAD_TOO_LARGE khi vượt BODY_LIMIT', async () => {
    const res = await request(buildTestApp())
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ x: 'a'.repeat(5_000) }));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('X-Request-Id', () => {
  it('dùng lại mã hợp lệ do proxy gửi', async () => {
    const res = await request(buildTestApp())
      .get('/api/v1/health/live')
      .set('X-Request-Id', 'proxy-req-12345');
    expect(res.headers['x-request-id']).toBe('proxy-req-12345');
  });

  it('thay mã không an toàn (chống log injection) bằng UUID mới', async () => {
    const res = await request(buildTestApp())
      .get('/api/v1/health/live')
      .set('X-Request-Id', 'bad id\twith space');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('CORS', () => {
  it('cho phép origin trong whitelist, kèm credentials', async () => {
    const res = await request(buildTestApp()).get('/api/v1/health').set('Origin', TEST_ORIGIN);
    expect(res.headers['access-control-allow-origin']).toBe(TEST_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('không trả header CORS cho origin lạ', async () => {
    const res = await request(buildTestApp())
      .get('/api/v1/health')
      .set('Origin', 'https://evil.example');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('preflight cho phép header X-CSRF-Token', async () => {
    const res = await request(buildTestApp())
      .options('/api/v1/health')
      .set('Origin', TEST_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,x-csrf-token');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-headers']).toMatch(/X-CSRF-Token/i);
  });
});

describe('Header bảo mật', () => {
  it('có CSP chặt, nosniff, không lộ X-Powered-By', async () => {
    const res = await request(buildTestApp()).get('/api/v1/health');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('chỉ bật HSTS ở production', async () => {
    const dev = await request(buildTestApp()).get('/api/v1/health');
    expect(dev.headers['strict-transport-security']).toBeUndefined();
    const prod = await request(buildTestApp({ config: { nodeEnv: 'production' } })).get(
      '/api/v1/health',
    );
    expect(prod.headers['strict-transport-security']).toBeDefined();
  });
});
