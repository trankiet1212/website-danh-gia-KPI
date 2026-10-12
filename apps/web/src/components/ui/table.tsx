import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// Bảng theo phong cách shadcn/ui; bọc cuộn ngang để không vỡ bố cục trên điện thoại.
export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div className="w-full overflow-x-auto rounded-lg border bg-card">
      <table className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  );
}
export function THead(props: ComponentProps<'thead'>) {
  return <thead className="border-b bg-muted/60 text-left" {...props} />;
}
export function TBody(props: ComponentProps<'tbody'>) {
  return <tbody className="[&_tr:last-child]:border-0" {...props} />;
}
export function Tr({ className, ...props }: ComponentProps<'tr'>) {
  return (
    <tr className={cn('border-b transition-colors hover:bg-muted/40', className)} {...props} />
  );
}
export function Th({ className, ...props }: ComponentProps<'th'>) {
  return (
    <th
      className={cn(
        'h-10 px-3 text-xs font-semibold whitespace-nowrap text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}
export function Td({ className, ...props }: ComponentProps<'td'>) {
  return <td className={cn('px-3 py-2.5 align-middle', className)} {...props} />;
}
