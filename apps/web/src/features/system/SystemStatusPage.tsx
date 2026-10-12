import { Activity, Database, RefreshCw, ServerCrash } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiClientError } from '@/lib/api-client';
import { useHealth } from './api';

const ENV_LABELS: Record<string, string> = {
  development: 'Phát triển',
  test: 'Kiểm thử',
  production: 'Vận hành',
};

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h} giờ ${m} phút` : m > 0 ? `${m} phút ${s} giây` : `${s} giây`;
}

/** Trang kiểm tra trạng thái hệ thống: API và kết nối cơ sở dữ liệu (dữ liệu thật từ /api/v1/health). */
export function SystemStatusPage() {
  const { data, error, isPending, isFetching, refetch, dataUpdatedAt } = useHealth();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Trạng thái hệ thống</h1>
          <p className="text-sm text-muted-foreground">
            Kiểm tra kết nối giữa giao diện, máy chủ API và cơ sở dữ liệu. Tự động làm mới mỗi 30
            giây.
          </p>
        </div>
        <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw className={isFetching ? 'animate-spin' : undefined} aria-hidden />
          {isFetching ? 'Đang kiểm tra...' : 'Kiểm tra lại'}
        </Button>
      </div>

      {isPending && (
        <Card aria-busy="true">
          <CardContent className="p-5 text-sm text-muted-foreground">
            Đang kiểm tra trạng thái hệ thống...
          </CardContent>
        </Card>
      )}

      {error && (
        <Card role="alert" className="border-destructive/40">
          <CardHeader className="flex-row items-center gap-3">
            <ServerCrash className="size-5 text-destructive" aria-hidden />
            <div>
              <CardTitle>Không kết nối được máy chủ API</CardTitle>
              <CardDescription>{error.message}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Kiểm tra API đã chạy chưa (<code className="rounded bg-muted px-1">npm run dev</code>).
            {error instanceof ApiClientError && error.requestId && (
              <> Mã yêu cầu: {error.requestId}.</>
            )}
          </CardContent>
        </Card>
      )}

      {data?.health && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div className="flex items-center gap-3">
                <Activity className="size-5 text-primary" aria-hidden />
                <CardTitle>Máy chủ API</CardTitle>
              </div>
              <Badge variant={data.health.status === 'ok' ? 'success' : 'warning'}>
                {data.health.status === 'ok' ? 'Hoạt động bình thường' : 'Hoạt động hạn chế'}
              </Badge>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Phiên bản</dt>
                <dd>{data.health.version ?? 'Ẩn (production)'}</dd>
                <dt className="text-muted-foreground">Môi trường</dt>
                <dd>
                  {data.health.environment
                    ? (ENV_LABELS[data.health.environment] ?? data.health.environment)
                    : 'Ẩn (production)'}
                </dd>
                <dt className="text-muted-foreground">Thời gian chạy</dt>
                <dd>
                  {data.health.uptimeSeconds === undefined
                    ? '—'
                    : formatUptime(data.health.uptimeSeconds)}
                </dd>
                <dt className="text-muted-foreground">Kiểm tra lúc</dt>
                <dd>{new Date(dataUpdatedAt).toLocaleTimeString('vi-VN')}</dd>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div className="flex items-center gap-3">
                <Database className="size-5 text-primary" aria-hidden />
                <CardTitle>Cơ sở dữ liệu PostgreSQL</CardTitle>
              </div>
              <Badge
                variant={data.health.checks.database.status === 'up' ? 'success' : 'destructive'}
              >
                {data.health.checks.database.status === 'up' ? 'Đã kết nối' : 'Mất kết nối'}
              </Badge>
            </CardHeader>
            <CardContent className="text-sm">
              {data.health.checks.database.status === 'up' ? (
                <p>
                  Độ trễ truy vấn kiểm tra:{' '}
                  <span className="font-medium">{data.health.checks.database.latencyMs} ms</span>
                </p>
              ) : (
                <p className="text-muted-foreground">
                  API đang chạy nhưng không kết nối được database. Kiểm tra Docker Desktop và chạy{' '}
                  <code className="rounded bg-muted px-1">npm run db:up</code>.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
