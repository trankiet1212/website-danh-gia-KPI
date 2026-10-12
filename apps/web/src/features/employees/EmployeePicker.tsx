/**
 * Chọn cán bộ bằng ô tìm kiếm (tìm phía server, chỉ trả về cán bộ trong phạm vi được xem).
 * Dùng cho trường "Cấp quản lý trực tiếp".
 */
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useId, useState } from 'react';
import type { EmployeeListItem } from '@kpi/shared';
import { Input } from '@/components/ui/form-controls';
import { api, qs } from '@/lib/api-client';
import { useDebounce } from '@/lib/use-debounce';

export interface PickedEmployee {
  id: string;
  label: string;
}

export function EmployeePicker({
  id,
  value,
  onChange,
  excludeId,
  invalid,
}: {
  id: string;
  value: PickedEmployee | null;
  onChange: (value: PickedEmployee | null) => void;
  excludeId?: string;
  invalid?: boolean;
}) {
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const q = useDebounce(term.trim(), 300);
  const listId = useId();
  const results = useQuery({
    queryKey: ['employees', 'picker', q],
    queryFn: () => api.page<EmployeeListItem>(`/employees${qs({ q, pageSize: 10 })}`),
    enabled: open && q.length >= 2,
  });

  if (value) {
    return (
      <div className="flex h-9 items-center justify-between rounded-md border bg-muted/40 px-3 text-sm">
        <span className="truncate">{value.label}</span>
        <button
          type="button"
          className="rounded p-0.5 hover:bg-accent"
          aria-label="Bỏ chọn"
          onClick={() => onChange(null)}
        >
          <X className="size-4" />
        </button>
      </div>
    );
  }

  const options = (results.data?.data ?? []).filter((e) => e.id !== excludeId);
  return (
    <div className="relative">
      <Input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-invalid={invalid || undefined}
        placeholder="Nhập ít nhất 2 ký tự họ tên hoặc mã cán bộ..."
        value={term}
        onChange={(e) => {
          setTerm(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && q.length >= 2 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-md border bg-card shadow-lg"
        >
          {results.isFetching && (
            <li className="px-3 py-2 text-sm text-muted-foreground">Đang tìm...</li>
          )}
          {!results.isFetching && options.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted-foreground">
              Không tìm thấy cán bộ phù hợp
            </li>
          )}
          {options.map((e) => (
            <li
              key={e.id}
              role="option"
              aria-selected={false}
              className="cursor-pointer px-3 py-2 text-sm hover:bg-accent"
              onMouseDown={(ev) => {
                ev.preventDefault();
                onChange({ id: e.id, label: `${e.fullName} (${e.employeeCode})` });
                setTerm('');
                setOpen(false);
              }}
            >
              <p className="font-medium">{e.fullName}</p>
              <p className="text-xs text-muted-foreground">
                {e.employeeCode} · {e.current?.position.name ?? '—'} · {e.current?.unit.name ?? '—'}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
