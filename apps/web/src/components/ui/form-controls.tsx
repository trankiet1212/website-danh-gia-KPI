/**
 * Ô nhập liệu theo phong cách shadcn/ui (new-york), dùng phần tử HTML gốc để giữ khả năng truy cập.
 */
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

const fieldBase =
  'w-full rounded-md border border-input bg-card px-3 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-destructive';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(fieldBase, 'h-9', className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(fieldBase, 'min-h-20 py-2', className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <select className={cn(fieldBase, 'h-9 pr-8', className)} {...props}>
      {children}
    </select>
  );
}

export function Label({ className, ...props }: ComponentProps<'label'>) {
  return <label className={cn('text-sm font-medium leading-none', className)} {...props} />;
}

export function Checkbox({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  return (
    <input
      type="checkbox"
      className={cn('size-4 rounded border-input accent-primary', className)}
      {...props}
    />
  );
}

/** Bọc một trường biểu mẫu: nhãn, ô nhập, gợi ý, thông báo lỗi (gắn aria cho trình đọc màn hình). */
export function FormField({
  id,
  label,
  required,
  hint,
  error,
  children,
  className,
}: {
  id: string;
  label: ReactNode;
  required?: boolean;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id}>
        {label}
        {required && (
          <span className="ml-0.5 text-destructive" aria-hidden>
            *
          </span>
        )}
      </Label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
