/** Kỳ đánh giá: sinh cây kỳ của năm, chuyển trạng thái từng bước. Quý IV mặc định không xếp loại riêng. */
import { ArrowLeft, ArrowRight, CalendarPlus } from 'lucide-react';
import { useState } from 'react';
import {
  PERIOD_STATUSES,
  PERIOD_STATUS_LABELS,
  PERIOD_TYPE_LABELS,
  PERIOD_TYPES,
  type PeriodDto,
  type PeriodStatus,
  type PeriodType,
} from '@kpi/shared';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState, ErrorState, FormError, LoadingState } from '@/components/common/states';
import { useToast } from '@/components/common/toast-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label, Select } from '@/components/ui/form-controls';
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/table';
import { api, errorMessage } from '@/lib/api-client';
import { useCan } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { useAction, usePeriods } from './api';

const CURRENT_YEAR = new Date().getFullYear();

export function PeriodsPage() {
  const can = useCan();
  const toast = useToast();
  const [year, setYear] = useState(CURRENT_YEAR);
  const [type, setType] = useState<PeriodType | ''>('QUARTER');
  const periods = usePeriods(year, type || undefined);
  const canManage = can('period.manage');

  const generate = useAction(
    () => api.post<{ created: string[] }>('/periods/generate-year', { year }),
    [['periods']],
  );
  const transition = useAction(
    (a: { p: PeriodDto; to: PeriodStatus }) =>
      api.post<PeriodDto>(`/periods/${a.p.id}/transition`, { to: a.to, version: a.p.version }),
    [['periods']],
  );

  const step = (p: PeriodDto, dir: 1 | -1) => {
    const to = PERIOD_STATUSES[PERIOD_STATUSES.indexOf(p.status) + dir];
    if (!to) return;
    transition.mutate(
      { p, to },
      {
        onSuccess: () => toast.success(`${p.name}: ${PERIOD_STATUS_LABELS[to]}`),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Kỳ đánh giá"
        description="Năm → 6 tháng → Quý → Tháng. Quý IV không xếp loại riêng, kết quả được kết hợp vào đánh giá cuối năm ([QĐ39] Điều 14, [HD05] III.6)."
        actions={
          canManage && (
            <Button
              onClick={() =>
                generate.mutate(undefined, {
                  onSuccess: (r) =>
                    toast.success(
                      r.created.length
                        ? `Đã tạo ${r.created.length} kỳ`
                        : 'Các kỳ của năm đã có đủ',
                    ),
                })
              }
              disabled={generate.isPending}
            >
              <CalendarPlus className="size-4" /> Tạo các kỳ năm {year}
            </Button>
          )
        }
      />
      <FormError error={generate.error} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="period-year">Năm</Label>
          <Select
            id="period-year"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="w-28"
          >
            {[CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="period-type">Loại kỳ</Label>
          <Select
            id="period-type"
            value={type}
            onChange={(e) => setType(e.target.value as PeriodType | '')}
            className="w-40"
          >
            <option value="">Tất cả</option>
            {PERIOD_TYPES.map((t) => (
              <option key={t} value={t}>
                {PERIOD_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {periods.isPending ? (
        <LoadingState />
      ) : periods.isError ? (
        <ErrorState error={periods.error} onRetry={() => void periods.refetch()} />
      ) : periods.data.length === 0 ? (
        <EmptyState
          title="Chưa có kỳ đánh giá"
          description={canManage ? 'Bấm "Tạo các kỳ" để sinh cây kỳ của năm.' : undefined}
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <THead>
              <Tr>
                <Th>Kỳ</Th>
                <Th>Thời gian</Th>
                <Th>Xếp loại</Th>
                <Th>Trạng thái</Th>
                <Th className="text-right">Hồ sơ</Th>
                {canManage && <Th className="text-right">Chuyển trạng thái</Th>}
              </Tr>
            </THead>
            <TBody>
              {periods.data.map((p) => {
                const idx = PERIOD_STATUSES.indexOf(p.status);
                return (
                  <Tr key={p.id}>
                    <Td>
                      <p className="font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.code} · {PERIOD_TYPE_LABELS[p.type]}
                        {p.isDemo && ' · DEMO'}
                      </p>
                    </Td>
                    <Td className="whitespace-nowrap">
                      {formatDate(p.startDate)} – {formatDate(p.endDate)}
                    </Td>
                    <Td>
                      {p.isRated ? (
                        <Badge variant="success">Có</Badge>
                      ) : (
                        <Badge variant="secondary">Không xếp loại riêng</Badge>
                      )}
                    </Td>
                    <Td>
                      <Badge variant={p.status === 'CLOSED' ? 'secondary' : 'outline'}>
                        {PERIOD_STATUS_LABELS[p.status]}
                      </Badge>
                    </Td>
                    <Td className="text-right">{p.evaluationCount}</Td>
                    {canManage && (
                      <Td className="text-right whitespace-nowrap">
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Lùi trạng thái ${p.name}`}
                          disabled={idx <= 0 || transition.isPending}
                          onClick={() => step(p, -1)}
                        >
                          <ArrowLeft className="size-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={idx >= PERIOD_STATUSES.length - 1 || transition.isPending}
                          onClick={() => step(p, 1)}
                        >
                          {PERIOD_STATUS_LABELS[PERIOD_STATUSES[idx + 1] ?? p.status]}{' '}
                          <ArrowRight className="size-4" />
                        </Button>
                      </Td>
                    )}
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        </div>
      )}
    </div>
  );
}
