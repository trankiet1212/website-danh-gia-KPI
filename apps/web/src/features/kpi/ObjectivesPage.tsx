/**
 * Mục tiêu và Kết quả then chốt (OKR) theo kỳ. Tiến độ KR CHỈ ĐỂ THEO DÕI — không quy đổi thành điểm KPI
 * khi chưa có quy tắc quy đổi được xác nhận.
 */
import { Plus, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import {
  MEASURE_DIRECTION_LABELS,
  MEASURE_TYPE_LABELS,
  MEASURE_TYPES,
  OBJECTIVE_STATUS_LABELS,
  type KeyResultDto,
  type MeasureDirection,
  type MeasureType,
  type ObjectiveDto,
} from '@kpi/shared';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState, ErrorState, FormError, LoadingState } from '@/components/common/states';
import { useToast } from '@/components/common/toast-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { FormField, Input, Label, Select, Textarea } from '@/components/ui/form-controls';
import { EmployeePicker, type PickedEmployee } from '@/features/employees/EmployeePicker';
import { flattenUnitTree, useUnits } from '@/features/org/api';
import { api } from '@/lib/api-client';
import { useCan, useMe } from '@/lib/auth';
import { formatDate, formatDateTime } from '@/lib/format';
import { kpiKeys, useAction, useObjectives, usePeriods } from './api';
import { Num, Pct, ProvisionalNotice } from './components';

function ProgressBar({ ratio }: { ratio: number | null }) {
  const pct = ratio === null ? 0 : Math.round(ratio * 100);
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-2 w-32 overflow-hidden rounded bg-muted"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums">{ratio === null ? 'chưa có số liệu' : `${pct}%`}</span>
    </div>
  );
}

function ObjectiveDialog({ periodId, onClose }: { periodId: string; onClose: () => void }) {
  const { data: me } = useMe();
  const units = useUnits();
  const [ownerKind, setOwnerKind] = useState<'EMPLOYEE' | 'UNIT'>('EMPLOYEE');
  const [owner, setOwner] = useState<PickedEmployee | null>(
    me?.user.employee ? { id: me.user.employee.id, label: me.user.employee.fullName } : null,
  );
  const [unitId, setUnitId] = useState('');
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const create = useAction(
    (body: object) => api.post<ObjectiveDto>('/objectives', body),
    [kpiKeys.objectives(periodId)],
  );
  return (
    <Dialog open onClose={onClose} title="Thêm mục tiêu">
      <div className="space-y-3">
        <FormError error={create.error} />
        <FormField id="ob-kind" label="Mục tiêu của">
          <Select
            id="ob-kind"
            value={ownerKind}
            onChange={(e) => setOwnerKind(e.target.value as 'EMPLOYEE' | 'UNIT')}
          >
            <option value="EMPLOYEE">Cá nhân</option>
            <option value="UNIT">Đơn vị</option>
          </Select>
        </FormField>
        {ownerKind === 'EMPLOYEE' ? (
          <FormField id="ob-owner" label="Cán bộ" required>
            <EmployeePicker id="ob-owner" value={owner} onChange={setOwner} />
          </FormField>
        ) : (
          <FormField id="ob-unit" label="Đơn vị" required>
            <Select id="ob-unit" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
              <option value="">— Chọn đơn vị —</option>
              {flattenUnitTree(units.data ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {'— '.repeat(u.depth)}
                  {u.name}
                </option>
              ))}
            </Select>
          </FormField>
        )}
        <FormField id="ob-code" label="Mã" required>
          <Input id="ob-code" value={code} onChange={(e) => setCode(e.target.value)} />
        </FormField>
        <FormField id="ob-title" label="Mục tiêu" required>
          <Textarea id="ob-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </FormField>
        <FormField id="ob-desc" label="Mô tả">
          <Textarea
            id="ob-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button
            disabled={create.isPending}
            onClick={() =>
              create.mutate(
                {
                  periodId,
                  ownerKind,
                  ownerEmployeeId: ownerKind === 'EMPLOYEE' ? owner?.id : null,
                  ownerUnitId: ownerKind === 'UNIT' ? unitId || null : null,
                  code,
                  title,
                  description,
                },
                { onSuccess: onClose },
              )
            }
          >
            Lưu
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function KeyResultDialog({ objective, onClose }: { objective: ObjectiveDto; onClose: () => void }) {
  const [form, setForm] = useState({
    code: `KR${objective.keyResults.length + 1}`,
    title: '',
    measureType: 'PERCENT' as MeasureType,
    direction: 'INCREASE' as MeasureDirection,
    measureUnit: '',
    baseline: '0',
    target: '100',
    weight: '',
    dueDate: '',
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const create = useAction(
    (body: object) => api.post<ObjectiveDto>(`/objectives/${objective.id}/key-results`, body),
    [kpiKeys.objectives(objective.period.id)],
  );
  return (
    <Dialog open onClose={onClose} title={`Thêm kết quả then chốt — ${objective.code}`}>
      <div className="space-y-3">
        <FormError error={create.error} />
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField id="kr-code" label="Mã" required>
            <Input id="kr-code" value={form.code} onChange={(e) => set({ code: e.target.value })} />
          </FormField>
          <FormField id="kr-type" label="Loại đo lường">
            <Select
              id="kr-type"
              value={form.measureType}
              onChange={(e) => set({ measureType: e.target.value as MeasureType })}
            >
              {MEASURE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {MEASURE_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        <FormField id="kr-title" label="Kết quả then chốt" required>
          <Textarea
            id="kr-title"
            value={form.title}
            onChange={(e) => set({ title: e.target.value })}
          />
        </FormField>
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField id="kr-dir" label="Chiều">
            <Select
              id="kr-dir"
              value={form.direction}
              onChange={(e) => set({ direction: e.target.value as MeasureDirection })}
            >
              {(Object.keys(MEASURE_DIRECTION_LABELS) as MeasureDirection[]).map((d) => (
                <option key={d} value={d}>
                  {MEASURE_DIRECTION_LABELS[d]}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id="kr-base" label="Giá trị ban đầu">
            <Input
              id="kr-base"
              inputMode="decimal"
              value={form.baseline}
              onChange={(e) => set({ baseline: e.target.value })}
            />
          </FormField>
          <FormField id="kr-target" label="Mục tiêu" required>
            <Input
              id="kr-target"
              inputMode="decimal"
              value={form.target}
              onChange={(e) => set({ target: e.target.value })}
            />
          </FormField>
          <FormField id="kr-unit" label="Đơn vị đo">
            <Input
              id="kr-unit"
              value={form.measureUnit}
              onChange={(e) => set({ measureUnit: e.target.value })}
            />
          </FormField>
          <FormField id="kr-weight" label="Trọng số (%)">
            <Input
              id="kr-weight"
              inputMode="decimal"
              value={form.weight}
              onChange={(e) => set({ weight: e.target.value })}
            />
          </FormField>
          <FormField id="kr-due" label="Hạn">
            <Input
              id="kr-due"
              type="date"
              value={form.dueDate}
              onChange={(e) => set({ dueDate: e.target.value })}
            />
          </FormField>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button
            disabled={create.isPending}
            onClick={() => create.mutate(form, { onSuccess: onClose })}
          >
            Lưu
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function CheckinDialog({
  kr,
  periodId,
  onClose,
}: {
  kr: KeyResultDto;
  periodId: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const [value, setValue] = useState(kr.currentValue === null ? '' : String(kr.currentValue));
  const [note, setNote] = useState('');
  const checkin = useAction(
    (body: object) => api.post<ObjectiveDto>(`/key-results/${kr.id}/checkins`, body),
    [kpiKeys.objectives(periodId)],
  );
  return (
    <Dialog open onClose={onClose} title={`Cập nhật kết quả — ${kr.code}`} description={kr.title}>
      <div className="space-y-3">
        <FormError error={checkin.error} />
        <FormField
          id="ck-value"
          label={`Giá trị hiện tại${kr.measureUnit ? ` (${kr.measureUnit})` : ''}`}
          required
        >
          <Input
            id="ck-value"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </FormField>
        <FormField id="ck-note" label="Ghi chú / minh chứng">
          <Textarea id="ck-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </FormField>
        {kr.checkins.length > 0 && (
          <div>
            <p className="text-sm font-medium">Lịch sử cập nhật (chỉ ghi thêm)</p>
            <ul className="mt-1 max-h-40 space-y-1 overflow-auto text-xs">
              {kr.checkins.map((c) => (
                <li key={c.id}>
                  {formatDateTime(c.checkedAt)}: <Num value={c.value} /> {c.note && `— ${c.note}`}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button
            disabled={checkin.isPending || value.trim() === ''}
            onClick={() =>
              checkin.mutate(
                { value: value.replace(',', '.'), note },
                {
                  onSuccess: () => {
                    toast.success('Đã cập nhật kết quả');
                    onClose();
                  },
                },
              )
            }
          >
            Lưu
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

export function ObjectivesPage() {
  const can = useCan();
  const year = new Date().getFullYear();
  const periods = usePeriods(year);
  const [periodId, setPeriodId] = useState('');
  const effectivePeriod = periodId || periods.data?.find((p) => p.type === 'YEAR')?.id || '';
  const objectives = useObjectives(effectivePeriod || undefined);
  const [creating, setCreating] = useState(false);
  const [krFor, setKrFor] = useState<ObjectiveDto | null>(null);
  const [checkinFor, setCheckinFor] = useState<KeyResultDto | null>(null);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Mục tiêu và kết quả then chốt (OKR)"
        description="Theo dõi mục tiêu, kết quả then chốt và tiến độ theo kỳ."
        actions={
          can('objective.write') &&
          effectivePeriod && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" /> Thêm mục tiêu
            </Button>
          )
        }
      />
      <ProvisionalNotice>
        Tiến độ OKR chỉ để theo dõi, <strong>không phải điểm KPI</strong>: chưa có quy tắc được xác
        nhận để quy đổi tỷ lệ hoàn thành KR thành điểm đánh giá.
      </ProvisionalNotice>
      <div className="space-y-1.5">
        <Label htmlFor="okr-period">Kỳ</Label>
        <Select
          id="okr-period"
          className="w-64"
          value={effectivePeriod}
          onChange={(e) => setPeriodId(e.target.value)}
        >
          <option value="">— Chọn kỳ —</option>
          {periods.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </div>

      {!effectivePeriod ? (
        <EmptyState title="Chọn kỳ để xem mục tiêu" />
      ) : objectives.isPending ? (
        <LoadingState />
      ) : objectives.isError ? (
        <ErrorState error={objectives.error} onRetry={() => void objectives.refetch()} />
      ) : objectives.data.length === 0 ? (
        <EmptyState title="Chưa có mục tiêu trong kỳ" />
      ) : (
        <div className="space-y-3">
          {objectives.data.map((o) => (
            <Card key={o.id}>
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
                <div className="space-y-1">
                  <CardTitle className="text-base">
                    {o.code}. {o.title}
                  </CardTitle>
                  <CardDescription>
                    {o.ownerEmployee ? o.ownerEmployee.fullName : o.ownerUnit?.name} ·{' '}
                    {OBJECTIVE_STATUS_LABELS[o.status]}
                  </CardDescription>
                  {o.description && (
                    <p className="text-xs whitespace-pre-line text-muted-foreground">
                      {o.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <ProgressBar ratio={o.progress} />
                  {o.canEdit && (
                    <Button size="sm" variant="outline" onClick={() => setKrFor(o)}>
                      <Plus className="size-4" /> KR
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {o.keyResults.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Chưa có kết quả then chốt.</p>
                ) : (
                  <ul className="divide-y">
                    {o.keyResults.map((k) => (
                      <li
                        key={k.id}
                        className="flex flex-wrap items-center justify-between gap-2 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm">
                            <strong>{k.code}</strong> {k.title}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {MEASURE_TYPE_LABELS[k.measureType]} ·{' '}
                            {MEASURE_DIRECTION_LABELS[k.direction]} · ban đầu{' '}
                            <Num value={k.baseline} /> → mục tiêu <Num value={k.target} />{' '}
                            {k.measureUnit} · hiện tại <Num value={k.currentValue} />
                            {k.weight !== null && ` · trọng số ${k.weight}%`}
                            {k.dueDate && ` · hạn ${formatDate(k.dueDate)}`}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Cách tính: {k.progress.explanation}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">
                            <Pct value={k.progress.ratio} digits={1} />
                          </Badge>
                          {o.canEdit && (
                            <Button size="sm" variant="ghost" onClick={() => setCheckinFor(k)}>
                              <TrendingUp className="size-4" /> Cập nhật
                            </Button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {creating && (
        <ObjectiveDialog periodId={effectivePeriod} onClose={() => setCreating(false)} />
      )}
      {krFor && <KeyResultDialog objective={krFor} onClose={() => setKrFor(null)} />}
      {checkinFor && (
        <CheckinDialog
          kr={checkinFor}
          periodId={effectivePeriod}
          onClose={() => setCheckinFor(null)}
        />
      )}
    </div>
  );
}
