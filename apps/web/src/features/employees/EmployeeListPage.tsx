/**
 * Danh sách hồ sơ cán bộ — tìm kiếm, lọc, phân trang, sắp xếp đều thực hiện phía server.
 * Bộ lọc lưu trên URL để có thể chia sẻ/quay lại đúng trạng thái.
 */
import { ArrowDown, ArrowUp, ArrowUpDown, Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { EMPLOYEE_STATUSES, EMPLOYEE_STATUS_LABELS, type EmployeeStatus } from '@kpi/shared';
import { PageHeader } from '@/components/common/page-header';
import { Pagination } from '@/components/common/pagination';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/states';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button-variants';
import { Checkbox, Input, Label, Select } from '@/components/ui/form-controls';
import { TBody, THead, Table, Td, Th, Tr } from '@/components/ui/table';
import { flattenUnitTree, usePositions, useUnits } from '@/features/org/api';
import { useCan } from '@/lib/auth';
import { useDebounce } from '@/lib/use-debounce';
import { useEmployees, type EmployeeFilters } from './api';

const STATUS_VARIANT: Record<EmployeeStatus, 'success' | 'secondary' | 'warning'> = {
  WORKING: 'success',
  TRANSFERRED: 'warning',
  RETIRED: 'secondary',
  ARCHIVED: 'secondary',
};

function SortHeader({
  field,
  label,
  sort,
  onSort,
  className,
}: {
  field: string;
  label: string;
  sort: string | undefined;
  onSort: (s: string) => void;
  className?: string;
}) {
  const [f, dir] = (sort ?? 'fullName:asc').split(':');
  const active = f === field;
  const Icon = !active ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <Th
      className={className}
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:text-foreground"
        onClick={() => onSort(`${field}:${active && dir === 'asc' ? 'desc' : 'asc'}`)}
      >
        {label}
        <Icon className="size-3.5" aria-hidden />
      </button>
    </Th>
  );
}

export function EmployeeListPage() {
  const can = useCan();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [term, setTerm] = useState(params.get('q') ?? '');
  const debounced = useDebounce(term.trim());

  const filters: EmployeeFilters = {
    q: params.get('q') ?? undefined,
    unitId: params.get('unitId') ?? undefined,
    positionId: params.get('positionId') ?? undefined,
    status: params.get('status') ?? undefined,
    includeInactive: params.get('includeInactive') === 'true' || undefined,
    sort: params.get('sort') ?? undefined,
    page: Number(params.get('page') ?? 1) || 1,
    pageSize: Number(params.get('pageSize') ?? 20) || 20,
  };

  const update = (patch: Record<string, string | undefined>, resetPage = true) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === '') next.delete(k);
      else next.set(k, v);
    }
    if (resetPage) next.delete('page');
    setParams(next, { replace: true });
  };

  // Đồng bộ ô tìm kiếm (đã debounce) lên URL
  useEffect(() => {
    if ((params.get('q') ?? '') !== debounced) update({ q: debounced || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ chạy khi giá trị tìm kiếm thay đổi
  }, [debounced]);

  const list = useEmployees(filters);
  const units = useUnits();
  const positions = usePositions();
  const canWrite = can('employee.write');

  return (
    <div className="space-y-4">
      <PageHeader
        title="Hồ sơ cán bộ"
        description="Danh sách cán bộ, công chức trong phạm vi bạn được phân quyền."
        actions={
          canWrite && (
            <Link to="/can-bo/them" className={buttonVariants()}>
              <Plus aria-hidden /> Thêm cán bộ
            </Link>
          )
        }
      />

      <div className="grid gap-3 rounded-lg border bg-card p-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" aria-hidden />
          <Input
            aria-label="Tìm theo họ tên, mã cán bộ, email"
            placeholder="Tìm họ tên, mã, email..."
            className="pl-8"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
        </div>
        <Select
          aria-label="Lọc theo đơn vị"
          value={filters.unitId ?? ''}
          onChange={(e) => update({ unitId: e.target.value })}
        >
          <option value="">Tất cả đơn vị</option>
          {flattenUnitTree(units.data ?? []).map((u) => (
            <option key={u.id} value={u.id}>
              {'— '.repeat(u.depth)}
              {u.name}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Lọc theo chức vụ"
          value={filters.positionId ?? ''}
          onChange={(e) => update({ positionId: e.target.value })}
        >
          <option value="">Tất cả chức vụ</option>
          {(positions.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <div className="flex items-center gap-3">
          <Select
            aria-label="Lọc theo trạng thái"
            value={filters.status ?? ''}
            onChange={(e) => update({ status: e.target.value })}
          >
            <option value="">Đang công tác</option>
            {EMPLOYEE_STATUSES.filter((s) => s !== 'WORKING').map((s) => (
              <option key={s} value={s}>
                {EMPLOYEE_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
          <Label className="flex shrink-0 items-center gap-1.5 font-normal">
            <Checkbox
              checked={!!filters.includeInactive}
              disabled={!!filters.status}
              onChange={(e) => update({ includeInactive: e.target.checked ? 'true' : undefined })}
            />
            Tất cả
          </Label>
        </div>
      </div>

      {list.isPending && <LoadingState label="Đang tải danh sách cán bộ..." />}
      {list.error && <ErrorState error={list.error} onRetry={() => void list.refetch()} />}
      {list.data && list.data.data.length === 0 && (
        <EmptyState
          title="Không có cán bộ phù hợp"
          description={
            filters.q || filters.unitId || filters.positionId
              ? 'Thử bỏ bớt điều kiện lọc.'
              : 'Chưa có hồ sơ trong phạm vi của bạn.'
          }
        />
      )}
      {list.data && list.data.data.length > 0 && (
        <div className="space-y-3" aria-busy={list.isFetching}>
          <Table>
            <THead>
              <Tr>
                <SortHeader
                  field="fullName"
                  label="Họ và tên"
                  sort={filters.sort}
                  onSort={(s) => update({ sort: s }, false)}
                />
                <SortHeader
                  field="employeeCode"
                  label="Mã cán bộ"
                  sort={filters.sort}
                  onSort={(s) => update({ sort: s }, false)}
                  className="hidden sm:table-cell"
                />
                <Th>Chức vụ</Th>
                <Th className="hidden md:table-cell">Đơn vị</Th>
                <Th className="hidden lg:table-cell">Vị trí việc làm</Th>
                <Th>Trạng thái</Th>
              </Tr>
            </THead>
            <TBody>
              {list.data.data.map((e) => (
                <Tr
                  key={e.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/can-bo/${e.id}`)}
                >
                  <Td>
                    <Link
                      to={`/can-bo/${e.id}`}
                      className="font-medium text-primary hover:underline"
                      onClick={(ev) => ev.stopPropagation()}
                    >
                      {e.fullName}
                    </Link>
                    {e.isDemo && (
                      <Badge variant="outline" className="ml-2">
                        DEMO
                      </Badge>
                    )}
                    <p className="text-xs text-muted-foreground sm:hidden">{e.employeeCode}</p>
                  </Td>
                  <Td className="hidden font-mono text-xs sm:table-cell">{e.employeeCode}</Td>
                  <Td>{e.current?.position.name ?? '—'}</Td>
                  <Td className="hidden md:table-cell">{e.current?.unit.name ?? '—'}</Td>
                  <Td className="hidden lg:table-cell">{e.current?.jobPosition?.name ?? '—'}</Td>
                  <Td>
                    <Badge variant={STATUS_VARIANT[e.status]}>
                      {EMPLOYEE_STATUS_LABELS[e.status]}
                    </Badge>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          <Pagination
            meta={list.data.meta}
            onPage={(p) => update({ page: String(p) }, false)}
            onPageSize={(s) => update({ pageSize: String(s) })}
          />
        </div>
      )}
    </div>
  );
}
