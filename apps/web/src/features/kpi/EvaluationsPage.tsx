/**
 * Danh sách hồ sơ đánh giá trong phạm vi được xem; tạo hồ sơ cho cán bộ trong kỳ tháng/quý.
 * Tạo hồ sơ: Cán bộ tổng hợp (quản lý kỳ) — mọi cán bộ trong phạm vi; lãnh đạo — cấp dưới và chính mình.
 */
import { FilePlus2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { EVALUATION_STATUSES, EVALUATION_STATUS_LABELS, KPI_PROFILE_LABELS } from '@kpi/shared';
import { PageHeader } from '@/components/common/page-header';
import { Pagination } from '@/components/common/pagination';
import { EmptyState, ErrorState, FormError, LoadingState } from '@/components/common/states';
import { useToast } from '@/components/common/toast-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormField, Input, Label, Select } from '@/components/ui/form-controls';
import { formatDate } from '@/lib/format';
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/table';
import { api } from '@/lib/api-client';
import { useCan } from '@/lib/auth';
import { useDebounce } from '@/lib/use-debounce';
import { useAction, useEvaluations, usePeriods, type EvaluationFilters } from './api';
import { Num, StatusBadge } from './components';
import { PeriodOptions } from './period-options';
import { isCurrentPeriod, yearChoices } from './period-utils';

function GenerateDialog({ onClose, leader }: { onClose: () => void; leader: boolean }) {
  const toast = useToast();
  const years = yearChoices();
  const [year, setYear] = useState(years[1]!);
  const periods = usePeriods(year);
  const choices = (periods.data ?? []).filter(
    (p) => p.isRated && p.status !== 'CLOSED' && (p.type === 'MONTH' || p.type === 'QUARTER'),
  );
  const [picked, setPicked] = useState<string | null>(null);
  // Mặc định chọn tháng hiện tại (nếu thuộc năm đang chọn)
  const periodId =
    picked ?? choices.find((p) => p.type === 'MONTH' && isCurrentPeriod(p))?.id ?? '';
  const selected = choices.find((p) => p.id === periodId);
  const gen = useAction(
    (body: object) =>
      api.post<{
        created: number;
        existing: number;
        skipped: { employee: string; reason: string }[];
      }>('/evaluations/generate', body),
    [['evaluations']],
  );
  return (
    <Dialog
      open
      onClose={onClose}
      title="Tạo hồ sơ đánh giá cho kỳ"
      description={
        leader
          ? 'Tạo hồ sơ còn thiếu cho cán bộ cấp dưới trong phạm vi quản lý của bạn và cho chính bạn. Không ghi đè hồ sơ đã có.'
          : 'Tạo hồ sơ còn thiếu cho cán bộ trong phạm vi của bạn. Không ghi đè hồ sơ đã có.'
      }
    >
      <div className="space-y-3">
        <FormError error={gen.error} />
        <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
          <FormField id="gen-year" label="Năm">
            <Select
              id="gen-year"
              value={year}
              onChange={(e) => {
                setYear(Number(e.target.value));
                setPicked(null);
                gen.reset();
              }}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id="gen-period" label="Kỳ đánh giá (tháng hoặc quý)" required>
            <Select
              id="gen-period"
              value={periodId}
              onChange={(e) => {
                setPicked(e.target.value);
                gen.reset();
              }}
            >
              <option value="">— Chọn kỳ —</option>
              <PeriodOptions periods={choices} types={['MONTH', 'QUARTER']} />
            </Select>
          </FormField>
        </div>
        {periods.isSuccess && choices.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Chưa có kỳ tháng/quý đang mở của năm {year}. Người quản lý kỳ tạo các kỳ của năm tại mục
            “Kỳ đánh giá”.
          </p>
        )}
        {selected && (
          <p className="text-sm text-muted-foreground">
            {selected.name}: từ {formatDate(selected.startDate)} đến {formatDate(selected.endDate)}
            {isCurrentPeriod(selected) && ' (kỳ hiện tại)'}.
          </p>
        )}
        {gen.data && (
          <div className="rounded-md border p-3 text-sm">
            <p>
              Đã tạo <strong>{gen.data.created}</strong> hồ sơ; đã có trước: {gen.data.existing}.
            </p>
            {gen.data.skipped.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
                {gen.data.skipped.map((s, i) => (
                  <li key={i}>
                    {s.employee}: {s.reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Đóng
          </Button>
          <Button
            disabled={!periodId || gen.isPending}
            onClick={() =>
              gen.mutate(
                { periodId },
                { onSuccess: (r) => toast.success(`Đã tạo ${r.created} hồ sơ`) },
              )
            }
          >
            Tạo hồ sơ
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

export function EvaluationsPage() {
  const can = useCan();
  const years = yearChoices();
  const [year, setYear] = useState(years[1]!);
  const periods = usePeriods(year);
  const [filters, setFilters] = useState<EvaluationFilters>({ page: 1, pageSize: 20 });
  const [q, setQ] = useState('');
  const debounced = useDebounce(q.trim(), 300);
  const list = useEvaluations({ ...filters, q: debounced || undefined });
  const [generating, setGenerating] = useState(false);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Hồ sơ đánh giá"
        description="Tự đánh giá → thẩm định → phê duyệt. Điểm tự đánh giá, điểm thẩm định và điểm đã phê duyệt được lưu tách biệt."
        actions={
          can('evaluation.read') &&
          (can('period.manage') || can('evaluation.review')) && (
            <Button onClick={() => setGenerating(true)}>
              <FilePlus2 className="size-4" /> Tạo hồ sơ cho kỳ
            </Button>
          )
        }
      />
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="ev-year">Năm</Label>
          <Select
            id="ev-year"
            value={year}
            onChange={(e) => {
              setYear(Number(e.target.value));
              setFilters((f) => ({ ...f, periodId: undefined, page: 1 }));
            }}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ev-period">Kỳ</Label>
          <Select
            id="ev-period"
            value={filters.periodId ?? ''}
            onChange={(e) =>
              setFilters((f) => ({ ...f, periodId: e.target.value || undefined, page: 1 }))
            }
          >
            <option value="">Tất cả</option>
            <PeriodOptions
              periods={periods.data ?? []}
              types={['MONTH', 'QUARTER', 'HALF_YEAR', 'YEAR']}
            />
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ev-status">Trạng thái</Label>
          <Select
            id="ev-status"
            value={filters.status ?? ''}
            onChange={(e) =>
              setFilters((f) => ({ ...f, status: e.target.value || undefined, page: 1 }))
            }
          >
            <option value="">Tất cả</option>
            {EVALUATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {EVALUATION_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ev-q">Cán bộ</Label>
          <Input
            id="ev-q"
            placeholder="Họ tên hoặc mã"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-64"
          />
        </div>
      </div>

      {list.isPending ? (
        <LoadingState />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : list.data.data.length === 0 ? (
        <EmptyState title="Chưa có hồ sơ đánh giá" />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border bg-card">
            <Table>
              <THead>
                <Tr>
                  <Th>Cán bộ</Th>
                  <Th>Kỳ</Th>
                  <Th>Trạng thái</Th>
                  <Th className="text-right">Tự đánh giá</Th>
                  <Th className="text-right">Thẩm định</Th>
                  <Th className="text-right">Đã duyệt</Th>
                </Tr>
              </THead>
              <TBody>
                {list.data.data.map((e) => (
                  <Tr key={e.id}>
                    <Td>
                      <Link
                        to={`/danh-gia/${e.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {e.employee?.fullName ?? '—'}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {e.employee?.employeeCode} · {e.unitName} ·{' '}
                        {KPI_PROFILE_LABELS[e.kpiProfile]}
                        {e.isDemo && (
                          <Badge variant="outline" className="ml-1">
                            DEMO
                          </Badge>
                        )}
                      </p>
                    </Td>
                    <Td>{e.period.name}</Td>
                    <Td>
                      <StatusBadge status={e.status} />
                      {e.revisionNo > 1 && (
                        <p className="text-xs text-muted-foreground">
                          Lần điều chỉnh {e.revisionNo}
                        </p>
                      )}
                    </Td>
                    <Td className="text-right">
                      <Num value={e.selfTotal} />
                      <p className="text-xs text-muted-foreground">{e.selfRating ?? ''}</p>
                    </Td>
                    <Td className="text-right">
                      <Num value={e.reviewTotal} />
                      <p className="text-xs text-muted-foreground">{e.reviewRating ?? ''}</p>
                    </Td>
                    <Td className="text-right font-medium">
                      <Num value={e.approvedTotal} />
                      <p className="text-xs">{e.approvedRating ?? ''}</p>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>
          <Pagination
            meta={list.data.meta}
            onPage={(page) => setFilters((f) => ({ ...f, page }))}
            onPageSize={(pageSize) => setFilters((f) => ({ ...f, pageSize, page: 1 }))}
          />
        </>
      )}
      {generating && (
        <GenerateDialog onClose={() => setGenerating(false)} leader={can('evaluation.review')} />
      )}
    </div>
  );
}
