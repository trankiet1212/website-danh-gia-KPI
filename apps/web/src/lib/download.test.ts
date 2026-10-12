import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError, downloadFile } from './api-client';

/** Giả lập DOM tối thiểu để kiểm tra luồng tải file (môi trường test là Node). */
function stubDom() {
  const anchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
  vi.stubGlobal('document', {
    createElement: () => anchor,
    body: { appendChild: vi.fn() },
  });
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }),
  );
  return anchor;
}

afterEach(() => vi.unstubAllGlobals());

describe('downloadFile', () => {
  it('lưu file với tên lấy từ Content-Disposition (UTF-8)', async () => {
    const anchor = stubDom();
    const fetchMock = vi.fn(
      async () =>
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: {
            'content-type': 'application/pdf',
            'content-disposition': `attachment; filename="bao-cao.pdf"; filename*=UTF-8''${encodeURIComponent('Báo cáo.pdf')}`,
          },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(downloadFile('/reports/unit/export?format=pdf')).resolves.toBe('Báo cáo.pdf');
    expect(anchor.download).toBe('Báo cáo.pdf');
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/reports/unit/export?format=pdf',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('ném lỗi chuẩn của API (ví dụ không có quyền xuất) và không tạo file', async () => {
    const anchor = stubDom();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: { code: 'FORBIDDEN', message: 'Không có quyền', requestId: 'r' },
            }),
            {
              status: 403,
              headers: { 'content-type': 'application/json' },
            },
          ),
      ),
    );
    await expect(downloadFile('/reports/unit/export?format=xlsx')).rejects.toBeInstanceOf(
      ApiClientError,
    );
    expect(anchor.click).not.toHaveBeenCalled();
  });
});
