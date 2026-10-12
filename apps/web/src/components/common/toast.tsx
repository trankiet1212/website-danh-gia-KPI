/** Thông báo ngắn (toast) góc màn hình; tự ẩn sau vài giây; đọc được bởi trình đọc màn hình. */
import { CheckCircle2, XCircle } from 'lucide-react';
import { useCallback, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

import { ToastContext, type ToastKind } from './toast-context';

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="fixed right-4 bottom-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              'flex items-start gap-2 rounded-md border bg-card px-4 py-3 text-sm shadow-lg',
              t.kind === 'error' && 'border-destructive/50',
            )}
          >
            {t.kind === 'success' ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            ) : (
              <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
            )}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
