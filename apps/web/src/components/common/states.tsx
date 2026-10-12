/** Trạng thái chung của màn hình: đang tải, rỗng, lỗi, không có quyền. */
import { AlertTriangle, Inbox, Loader2, ShieldOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { ApiClientError, errorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';

export function Spinner({
  className,
  label = 'Đang tải...',
}: {
  className?: string;
  label?: string;
}) {
  return (
    <span
      role="status"
      className={cn('inline-flex items-center gap-2 text-sm text-muted-foreground', className)}
    >
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </span>
  );
}

export function LoadingState({ label }: { label?: string }) {
  return (
    <div
      className="flex min-h-40 items-center justify-center rounded-lg border bg-card p-6"
      aria-busy="true"
    >
      <Spinner label={label} />
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-card p-6 text-center">
      <Inbox className="size-8 text-muted-foreground" aria-hidden />
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const requestId = error instanceof ApiClientError ? error.requestId : undefined;
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-2 rounded-lg border border-destructive/40 bg-card p-6 text-center"
    >
      <AlertTriangle className="size-8 text-destructive" aria-hidden />
      <p className="font-medium">Không tải được dữ liệu</p>
      <p className="text-sm text-muted-foreground">{errorMessage(error)}</p>
      {requestId && <p className="text-xs text-muted-foreground">Mã yêu cầu: {requestId}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Thử lại
        </Button>
      )}
    </div>
  );
}

export function ForbiddenState() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-center">
      <ShieldOff className="size-10 text-muted-foreground" aria-hidden />
      <h1 className="text-lg font-semibold">Bạn không có quyền truy cập chức năng này</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Liên hệ quản trị hệ thống nếu bạn cần được cấp quyền.
      </p>
    </div>
  );
}

/** Thông báo lỗi trong biểu mẫu (lỗi không gắn được vào trường cụ thể). */
export function FormError({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
    >
      {errorMessage(error)}
    </div>
  );
}
