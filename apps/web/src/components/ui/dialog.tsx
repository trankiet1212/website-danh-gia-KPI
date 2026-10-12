/**
 * Hộp thoại dùng phần tử <dialog> gốc (showModal): tự giữ focus trong hộp thoại, Esc để đóng,
 * nền phía sau bị khóa — đạt yêu cầu truy cập mà không cần thư viện ngoài.
 */
import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={cn(
        'm-auto w-[calc(100%-2rem)] rounded-lg border bg-card p-0 text-card-foreground shadow-xl backdrop:bg-black/40',
        { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size],
      )}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b p-4">
            <div className="space-y-1">
              <h2 id={titleId} className="text-base font-semibold">
                {title}
              </h2>
              {description && <p className="text-sm text-muted-foreground">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-muted-foreground hover:bg-accent"
              aria-label="Đóng"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="overflow-y-auto p-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t p-4">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
