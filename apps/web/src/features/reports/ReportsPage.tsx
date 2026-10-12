/**
 * Báo cáo cá nhân, đơn vị, toàn cơ quan, tổng hợp kỳ. Nội dung xem trên màn hình chính là nội dung được in/xuất
 * (cùng API, cùng phạm vi dữ liệu); xuất Excel/PDF do máy chủ sinh file thật.
 */
import { useState } from 'react';
import { PERIOD_TYPE_LABELS, type ReportKind } from '@kpi/shared';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/states';
import { Label, Select } from '@/components/ui/form-controls';
import { EmployeePicker, type PickedEmployee } from '@/features/employees/EmployeePicker';
import { usePeriods } from '@/features/kpi/api';
import { flattenUnitTree, useUnits } from '@/features/org/api';
import { useMe } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { useReport, type ReportParams } from './api';
import { ExportButtons, ReportView } from './components';

const TABS: { kind: ReportKind; label: string }[] = [
  { kind: 'unit', label: 'Đơn vị' },
  { kind: 'agency', label: 'Toàn cơ quan' },
  { kind: 'individual', label: 'Cá nhân' },
  { kind: 'aggregate', label: 'Tổng hợp tháng/quý/năm' },
];
const THIS_YEAR = new Date().getFullYear();

export function ReportsPage() {
  const { data: me } = useMe();
  const [kind, setKind] = useState<ReportKind>('unit');
  const [year, setYear] = useState(THIS_YEAR);
  const [periodId, setPeriodId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [employee, setEmployee] = useState<PickedEmployee | null>(
    me?.user.employee ? { id: me.user.employee.id, label: me.user.employee.fullName } : null,
  );
  const periods = usePeriods(year);
  const units = useUnits();

  const periodOptions = (periods.data ?? []).filter((p) =>
    kind === 'aggregate' ? p.type !== 'MONTH' : true,
  );
  const params: ReportParams =
    kind === 'unit'
      ? { periodId, unitId }
      : kind === 'agency'
        ? { periodId }
        : kind === 'individual'
          ? { employeeId: employee?.id, year }
          : { periodId, unitId: unitId || undefined };
  const ready =
    kind === 'unit' ? !!periodId && !!unitId : kind === 'individual' ? !!employee : !!periodId;
  const report = useReport(kind, params, ready);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Báo cáo"
        description="Số liệu lấy trực tiếp từ hệ thống và chỉ gồm dữ liệu trong phạm vi bạn được phép xem. File Excel/PDF xuất ra có cùng nội dung."
        actions={<ExportButtons kind={kind} params={params} disabled={!ready || !report.data} />}
      />
      <div
        role="tablist"
        aria-label="Loại báo cáo"
        className="flex flex-wrap gap-1 border-b print:hidden"
      >
        {TABS.map((t) => (
          <button
            key={t.kind}
            type="button"
            role="tab"
            aria-selected={kind === t.kind}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm',
              kind === t.kind
                ? 'border-primary font-medium'
                : 'border-transparent text-muted-foreground',
            )}
            onClick={() => setKind(t.kind)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <div className="space-y-1.5">
          <Label htmlFor="rp-year">Năm</Label>
          <Select
            id="rp-year"
            className="w-28"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {[THIS_YEAR - 1, THIS_YEAR, THIS_YEAR + 1].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </div>
        {kind !== 'individual' && (
          <div className="space-y-1.5">
            <Label htmlFor="rp-period">{kind === 'aggregate' ? 'Kỳ tổng hợp' : 'Kỳ'}</Label>
            <Select
              id="rp-period"
              className="w-64"
              value={periodId}
              onChange={(e) => setPeriodId(e.target.value)}
            >
              <option value="">— Chọn kỳ —</option>
              {periodOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({PERIOD_TYPE_LABELS[p.type]})
                </option>
              ))}
            </Select>
          </div>
        )}
        {(kind === 'unit' || kind === 'aggregate') && (
          <div className="space-y-1.5">
            <Label htmlFor="rp-unit">Đơn vị</Label>
            <Select
              id="rp-unit"
              className="w-64"
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
            >
              <option value="">
                {kind === 'aggregate' ? 'Tất cả trong phạm vi' : '— Chọn đơn vị —'}
              </option>
              {flattenUnitTree(units.data ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {'— '.repeat(u.depth)}
                  {u.name}
                </option>
              ))}
            </Select>
          </div>
        )}
        {kind === 'individual' && (
          <div className="w-72 space-y-1.5">
            <Label htmlFor="rp-employee">Cán bộ</Label>
            <EmployeePicker id="rp-employee" value={employee} onChange={setEmployee} />
          </div>
        )}
      </div>

      {!ready ? (
        <EmptyState title="Chọn tham số để xem báo cáo" />
      ) : report.isPending ? (
        <LoadingState />
      ) : report.isError ? (
        <ErrorState error={report.error} onRetry={() => void report.refetch()} />
      ) : (
        <ReportView doc={report.data} />
      )}
    </div>
  );
}
