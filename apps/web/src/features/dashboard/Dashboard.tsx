/**
 * Dashboard tổng hợp — dữ liệu thật từ API /dashboard/summary (lọc theo phạm vi ở máy chủ).
 * Biểu đồ dùng một sắc độ (primary) theo mức độ; mọi số liệu đều có nhãn chữ, không chỉ dựa vào màu.
 */
import { Link } from 'react-router';
import { useState } from 'react';
import { EVALUATION_STATUS_LABELS, EVALUATION_STATUSES, type DashboardSummary } from '@kpi/shared';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/states';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label, Select } from '@/components/ui/form-controls';
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/table';
import { EmployeePicker, type PickedEmployee } from '@/features/employees/EmployeePicker';
import { usePeriods } from '@/features/kpi/api';
import { StatusBadge } from '@/features/kpi/components';
import { flattenUnitTree, useUnits } from '@/features/org/api';
import { useDashboard } from '@/features/reports/api';

const nf = (n: number | null | undefined, d = 1) =>
  n === null || n === undefined ? '—' : n.toLocaleString('vi-VN', { maximumFractionDigits: d });

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Thanh tiến độ xếp chồng (một sắc độ, đậm dần theo bước quy trình) + chú giải có số liệu. */
function ProgressBar({ data }: { data: DashboardSummary['progress'] }) {
  const parts = [
    {
      key: 'none',
      label: 'Chưa có hồ sơ',
      value: data.notCreated ?? 0,
      cls: 'bg-muted-foreground/30',
    },
    {
      key: 'draft',
      label: 'Đang tự đánh giá / bị trả lại',
      value: data.draft,
      cls: 'bg-primary/25',
    },
    { key: 'sub', label: 'Đã nộp, đang thẩm định', value: data.submitted, cls: 'bg-primary/50' },
    { key: 'rev', label: 'Đã thẩm định, chờ duyệt', value: data.reviewed, cls: 'bg-primary/75' },
    { key: 'app', label: 'Đã phê duyệt', value: data.approved, cls: 'bg-primary' },
  ].filter((p) => p.key !== 'none' || data.notCreated !== null);
  const total = parts.reduce((a, p) => a + p.value, 0);
  if (total === 0)
    return <p className="text-sm text-muted-foreground">Chưa có hồ sơ trong bộ lọc này.</p>;
  return (
    <div className="space-y-3">
      <div
        className="flex h-4 w-full gap-[2px] overflow-hidden rounded"
        role="img"
        aria-label="Tiến độ đánh giá"
      >
        {parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <div
              key={p.key}
              className={`${p.cls} h-full first:rounded-l last:rounded-r`}
              style={{ width: `${(p.value / total) * 100}%` }}
              title={`${p.label}: ${p.value} (${nf((p.value / total) * 100)}%)`}
            />
          ))}
      </div>
      <ul className="grid gap-1 text-sm sm:grid-cols-2">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center gap-2">
            <span className={`inline-block size-3 rounded-sm ${p.cls}`} aria-hidden />
            <span className="flex-1 text-muted-foreground">{p.label}</span>
            <span className="font-medium tabular-nums">{p.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RatingBars({ ratings }: { ratings: DashboardSummary['ratings'] }) {
  const total = ratings.reduce((a, r) => a + r.count, 0);
  if (total === 0)
    return <p className="text-sm text-muted-foreground">Chưa có hồ sơ được phê duyệt.</p>;
  const max = Math.max(...ratings.map((r) => r.count));
  return (
    <ul className="space-y-2">
      {ratings.map((r) => (
        <li
          key={r.code}
          className="space-y-1"
          title={`${r.label}: ${r.count} người (${nf((r.count / total) * 100)}%)`}
        >
          <div className="flex justify-between text-sm">
            <span>{r.label}</span>
            <span className="font-medium tabular-nums">
              {r.count}{' '}
              <span className="text-muted-foreground">({nf((r.count / total) * 100)}%)</span>
            </span>
          </div>
          <div className="h-2.5 w-full rounded bg-muted">
            <div
              className="h-full rounded bg-primary"
              style={{ width: `${(r.count / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

const ACTION_TEXT = { self: 'Tự đánh giá', review: 'Thẩm định', approve: 'Phê duyệt' } as const;

export function Dashboard() {
  const year = new Date().getFullYear();
  const periods = usePeriods(year);
  const units = useUnits();
  const [periodId, setPeriodId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [status, setStatus] = useState('');
  const [employee, setEmployee] = useState<PickedEmployee | null>(null);
  const q = useDashboard({
    periodId: periodId || undefined,
    unitId: unitId || undefined,
    employeeId: employee?.id,
    status: status || undefined,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3" role="group" aria-label="Bộ lọc dashboard">
        <div className="space-y-1.5">
          <Label htmlFor="db-period">Kỳ</Label>
          <Select
            id="db-period"
            className="w-52"
            value={periodId}
            onChange={(e) => setPeriodId(e.target.value)}
          >
            <option value="">Tất cả các kỳ</option>
            {periods.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="db-unit">Đơn vị</Label>
          <Select
            id="db-unit"
            className="w-56"
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
          >
            <option value="">Tất cả trong phạm vi</option>
            {flattenUnitTree(units.data ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {'— '.repeat(u.depth)}
                {u.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-64 space-y-1.5">
          <Label htmlFor="db-emp">Cá nhân</Label>
          <EmployeePicker id="db-emp" value={employee} onChange={setEmployee} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="db-status">Trạng thái hồ sơ</Label>
          <Select
            id="db-status"
            className="w-48"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Tất cả</option>
            {EVALUATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {EVALUATION_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {q.isPending ? (
        <LoadingState />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Phạm vi dữ liệu: <strong>{q.data.scopeLabel}</strong>
            {q.data.period &&
              ` · Kỳ: ${q.data.period.name}${q.data.period.isRated ? '' : ' (không xếp loại riêng)'}`}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Tile label="Cán bộ trong phạm vi" value={nf(q.data.counts.employees, 0)} />
            <Tile label="Đơn vị" value={nf(q.data.counts.units, 0)} />
            <Tile label="Hồ sơ đánh giá" value={nf(q.data.counts.evaluations, 0)} />
            <Tile
              label="Đã phê duyệt"
              value={nf(q.data.progress.approved, 0)}
              hint={
                q.data.counts.evaluations
                  ? `${nf((q.data.progress.approved / q.data.counts.evaluations) * 100)}% số hồ sơ`
                  : undefined
              }
            />
            <Tile
              label="Điểm bình quân đã duyệt"
              value={nf(q.data.averages.approved, 2)}
              hint={`Tự ĐG ${nf(q.data.averages.self, 2)} · Thẩm định ${nf(q.data.averages.review, 2)}`}
            />
            <Tile
              label="Tiến độ OKR (theo dõi)"
              value={
                q.data.okr.averageProgress === null
                  ? '—'
                  : `${nf(q.data.okr.averageProgress * 100)}%`
              }
              hint={`${q.data.okr.objectives} mục tiêu · ${q.data.okr.keyResults} KR`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tiến độ đánh giá</CardTitle>
              </CardHeader>
              <CardContent>
                <ProgressBar data={q.data.progress} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Phân bố xếp loại</CardTitle>
                <CardDescription>Chỉ tính hồ sơ đã phê duyệt</CardDescription>
              </CardHeader>
              <CardContent>
                <RatingBars ratings={q.data.ratings} />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Hồ sơ chờ tôi xử lý</CardTitle>
              </CardHeader>
              <CardContent>
                {q.data.pending.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Không có hồ sơ nào chờ bạn xử lý.</p>
                ) : (
                  <ul className="divide-y">
                    {q.data.pending.map((p) => (
                      <li
                        key={`${p.id}-${p.action}`}
                        className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                      >
                        <Link
                          to={`/danh-gia/${p.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {p.employee} — {p.period}
                        </Link>
                        <span className="flex items-center gap-2">
                          <span className="text-muted-foreground">{ACTION_TEXT[p.action]}</span>
                          <StatusBadge status={p.status} />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Cán bộ chưa có hồ sơ trong kỳ</CardTitle>
                {!q.data.period && (
                  <CardDescription>Chọn một kỳ có xếp loại để kiểm tra</CardDescription>
                )}
              </CardHeader>
              <CardContent>
                {q.data.missing.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {q.data.period ? 'Không có — đã tạo đủ hồ sơ.' : '—'}
                  </p>
                ) : (
                  <ul className="max-h-64 space-y-1 overflow-auto text-sm">
                    {q.data.missing.map((m) => (
                      <li key={m.employeeId}>
                        {m.fullName}{' '}
                        <span className="text-muted-foreground">
                          ({m.employeeCode} · {m.unitName ?? '—'})
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Theo đơn vị</CardTitle>
            </CardHeader>
            <CardContent>
              {q.data.units.length === 0 ? (
                <EmptyState title="Chưa có hồ sơ" />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <THead>
                      <Tr>
                        <Th>Đơn vị</Th>
                        <Th className="text-right">Hồ sơ</Th>
                        <Th className="text-right">Đã duyệt</Th>
                        <Th className="text-right">Điểm BQ đã duyệt</Th>
                      </Tr>
                    </THead>
                    <TBody>
                      {q.data.units.map((u) => (
                        <Tr key={u.unitId}>
                          <Td>{u.unitName}</Td>
                          <Td className="text-right tabular-nums">{u.evaluations}</Td>
                          <Td className="text-right tabular-nums">{u.approved}</Td>
                          <Td className="text-right tabular-nums">{nf(u.averageApproved, 2)}</Td>
                        </Tr>
                      ))}
                    </TBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
