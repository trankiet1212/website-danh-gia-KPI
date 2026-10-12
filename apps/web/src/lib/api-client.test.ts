import { describe, expect, it } from 'vitest';
import { ApiClientError, parseResponse } from './api-client';

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

describe('parseResponse', () => {
  it('trả body khi thành công', async () => {
    await expect(parseResponse(json(200, { data: { a: 1 } }))).resolves.toEqual({ data: { a: 1 } });
  });

  it('chuyển lỗi chuẩn của API thành ApiClientError', async () => {
    const err = await parseResponse(
      json(404, { error: { code: 'NOT_FOUND', message: 'Không tìm thấy', requestId: 'r-1' } }),
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err).toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
      message: 'Không tìm thấy',
      requestId: 'r-1',
    });
  });

  it('giữ lại data khi phản hồi lỗi không theo định dạng error (ví dụ health 503)', async () => {
    const err = (await parseResponse(
      json(503, { data: { status: 'degraded' } }, { 'x-request-id': 'r-2' }),
    ).catch((e: unknown) => e)) as ApiClientError;
    expect(err.code).toBe('UNKNOWN');
    expect(err.data).toEqual({ status: 'degraded' });
    expect(err.requestId).toBe('r-2');
  });

  it('chịu được body không phải JSON', async () => {
    const err = (await parseResponse(
      new Response('<html>Bad gateway</html>', { status: 502 }),
    ).catch((e: unknown) => e)) as ApiClientError;
    expect(err.status).toBe(502);
    expect(err.message).toContain('502');
  });
});
