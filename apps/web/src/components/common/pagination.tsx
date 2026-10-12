import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PageMeta } from '@kpi/shared';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/form-controls';

export function Pagination({
  meta,
  onPage,
  onPageSize,
}: {
  meta: PageMeta;
  onPage: (page: number) => void;
  onPageSize?: (size: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(meta.total / meta.pageSize));
  const from = meta.total === 0 ? 0 : (meta.page - 1) * meta.pageSize + 1;
  const to = Math.min(meta.page * meta.pageSize, meta.total);
  return (
    <nav
      aria-label="Phân trang"
      className="flex flex-wrap items-center justify-between gap-3 text-sm"
    >
      <p className="text-muted-foreground">
        Hiển thị {from}–{to} / {meta.total} bản ghi
      </p>
      <div className="flex items-center gap-2">
        {onPageSize && (
          <Select
            aria-label="Số bản ghi mỗi trang"
            className="h-8 w-auto"
            value={meta.pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
          >
            {[10, 20, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}/trang
              </option>
            ))}
          </Select>
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={meta.page <= 1}
          onClick={() => onPage(meta.page - 1)}
          aria-label="Trang trước"
        >
          <ChevronLeft />
        </Button>
        <span className="min-w-20 text-center">
          Trang {meta.page}/{pages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={meta.page >= pages}
          onClick={() => onPage(meta.page + 1)}
          aria-label="Trang sau"
        >
          <ChevronRight />
        </Button>
      </div>
    </nav>
  );
}
