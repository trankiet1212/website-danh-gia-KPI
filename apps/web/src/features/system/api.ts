import { useQuery } from '@tanstack/react-query';
import type { ApiSuccess, HealthResponse } from '@kpi/shared';
import { ApiClientError, apiFetch } from '@/lib/api-client';

export interface HealthResult {
  /** Trạng thái chi tiết (có cả khi API trả 503 do database lỗi). */
  health: HealthResponse | null;
  httpOk: boolean;
}

async function fetchHealth(): Promise<HealthResult> {
  try {
    const res = await apiFetch<ApiSuccess<HealthResponse>>('/health');
    return { health: res.data, httpOk: true };
  } catch (err) {
    // 503 vẫn có body trạng thái — hiển thị "degraded" thay vì coi là lỗi mạng.
    if (err instanceof ApiClientError && err.status === 503 && err.data) {
      return { health: err.data as HealthResponse, httpOk: false };
    }
    throw err;
  }
}

export function useHealth() {
  return useQuery({
    queryKey: ['system', 'health'],
    queryFn: fetchHealth,
    refetchInterval: 30_000,
    retry: false,
  });
}
