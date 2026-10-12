/**
 * Phiếu chấm điểm một hồ sơ: nhập dữ liệu theo phương pháp chấm của từng tiêu chí.
 * Lớp "tự đánh giá" và lớp "thẩm định" lưu riêng; khi thẩm định, hiển thị kèm dữ liệu tự đánh giá để đối chiếu.
 */
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type {
  CompositeRow,
  CriteriaItemDto,
  EvaluationDetail,
  ItemInput,
  RuleConfig,
} from '@kpi/shared';
import { FormError } from '@/components/common/states';
import { useToast } from '@/components/common/toast-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox, Input, Label, Select, Textarea } from '@/components/ui/form-controls';
import { api, ApiClientError } from '@/lib/api-client';
import { kpiKeys, useAction, useCatalogItems, type TrialResult } from './api';
import { ScoreResultView } from './components';

type Layer = 'self' | 'review';
interface Entry {
  input: ItemInput;
  note: string;
}

const emptyRow = (): CompositeRow => ({
  label: '',
  catalogItemCode: null,
  coefficient: 1,
  plannedQty: 0,
  completedQty: 0,
  reworkQty: 0,
  reworkCount: 0,
  lateQty: 0,
  lateCount: 0,
  exemptCount: 0,
  exemptNote: null,
  exceeded: false,
});

/** Các mục cần nhập dữ liệu (mục lá có phương pháp chấm). */
function scorableItems(items: CriteriaItemDto[]): CriteriaItemDto[] {
  const hasKids = (id: string) => items.some((i) => i.parentId === id);
  return items
    .filter((i) => i.scoringMethod && !(i.scoringMethod === 'WEIGHTED_INDICATORS' && hasKids(i.id)))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function describe(
  input: ItemInput | null | undefined,
  item: CriteriaItemDto,
  rule: RuleConfig,
): string {
  if (!input) return 'chưa chấm';
  if (input.notApplicable) return `không áp dụng (${input.naReason ?? 'chưa ghi lý do'})`;
  switch (item.scoringMethod) {
    case 'PASS_FAIL':
      return input.passed === undefined ? 'chưa chấm' : input.passed ? 'Đảm bảo' : 'Không đảm bảo';
    case 'MANUAL_SCORE':
      return input.points === undefined ? 'chưa chấm' : `${input.points} điểm`;
    case 'QUALITATIVE_LEVEL':
      return rule.qualitativeLevels.find((l) => l.code === input.level)?.label ?? 'chưa chấm';
    case 'TARGET_RATIO':
      return input.actual === undefined ? 'chưa nhập' : `thực tế ${input.actual}`;
    case 'KPI_COMPOSITE':
      return `${input.rows?.length ?? 0} dòng nhiệm vụ${
        input.dScores
          ? `, D: ${Object.entries(input.dScores)
              .map(([k, v]) => `${k}=${v * 100}%`)
              .join(', ')}`
          : ''
      }`;
    default:
      return '—';
  }
}

function RowsEditor({
  rows,
  onChange,
  disabled,
  catalogVersionId,
}: {
  rows: CompositeRow[];
  onChange: (rows: CompositeRow[]) => void;
  disabled: boolean;
  catalogVersionId: string | null;
}) {
  const catalog = useCatalogItems(catalogVersionId ?? undefined, '');
  const set = (idx: number, patch: Partial<CompositeRow>) =>
    onChange(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const num = (v: string) => (v === '' ? 0 : Number(v));
  const cell = (idx: number, key: keyof CompositeRow, label: string, width = 'w-16') => (
    <Input
      aria-label={label}
      type="number"
      step="any"
      min={0}
      className={`h-8 ${width}`}
      disabled={disabled}
      value={String(rows[idx]![key] ?? 0)}
      onChange={(e) => set(idx, { [key]: num(e.target.value) } as Partial<CompositeRow>)}
    />
  );
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded border">
        <table className="w-full text-xs">
          <caption className="sr-only">Bảng nhiệm vụ để tính KPI tổng hợp</caption>
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-2 py-1">Nhiệm vụ / sản phẩm</th>
              <th className="px-2 py-1">Hệ số</th>
              <th className="px-2 py-1">KH</th>
              <th className="px-2 py-1">HT</th>
              <th className="px-2 py-1" title="Số lượng có sai sót / số lần làm lại">
                Làm lại (SL/lần)
              </th>
              <th className="px-2 py-1" title="Số lượng chậm / số lần chậm">
                Chậm (SL/lần)
              </th>
              <th className="px-2 py-1">Miễn trừ</th>
              <th className="px-2 py-1">Vượt mức</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={idx} className="border-t align-top">
                <td className="min-w-64 space-y-1 px-2 py-1">
                  <Input
                    aria-label="Tên nhiệm vụ"
                    className="h-8"
                    disabled={disabled}
                    value={r.label}
                    onChange={(e) => set(idx, { label: e.target.value })}
                  />
                  {catalog.data && catalog.data.length > 0 && (
                    <Select
                      aria-label="Sản phẩm trong danh mục"
                      className="h-8 text-xs"
                      disabled={disabled}
                      value={r.catalogItemCode ?? ''}
                      onChange={(e) => {
                        const item = catalog.data.find((c) => c.code === e.target.value);
                        set(
                          idx,
                          item
                            ? {
                                catalogItemCode: item.code,
                                coefficient: item.coefficient,
                                label: r.label || item.name,
                              }
                            : { catalogItemCode: null },
                        );
                      }}
                    >
                      <option value="">— Không theo danh mục —</option>
                      {catalog.data.map((c) => (
                        <option key={c.id} value={c.code}>
                          {c.code} (
                          {c.coefficient.toLocaleString('vi-VN', { maximumFractionDigits: 3 })}){' '}
                          {c.name.slice(0, 70)}
                        </option>
                      ))}
                    </Select>
                  )}
                </td>
                <td className="px-2 py-1">{cell(idx, 'coefficient', 'Hệ số', 'w-20')}</td>
                <td className="px-2 py-1">{cell(idx, 'plannedQty', 'Số lượng kế hoạch')}</td>
                <td className="px-2 py-1">{cell(idx, 'completedQty', 'Số lượng hoàn thành')}</td>
                <td className="px-2 py-1">
                  <div className="flex gap-1">
                    {cell(idx, 'reworkQty', 'Số lượng làm lại', 'w-14')}
                    {cell(idx, 'reworkCount', 'Số lần làm lại', 'w-14')}
                  </div>
                </td>
                <td className="px-2 py-1">
                  <div className="flex gap-1">
                    {cell(idx, 'lateQty', 'Số lượng chậm', 'w-14')}
                    {cell(idx, 'lateCount', 'Số lần chậm', 'w-14')}
                  </div>
                </td>
                <td className="space-y-1 px-2 py-1">
                  {cell(idx, 'exemptCount', 'Số lần được miễn trừ', 'w-14')}
                  {r.exemptCount > 0 && (
                    <Input
                      aria-label="Căn cứ miễn trừ"
                      placeholder="Căn cứ"
                      className="h-8 w-32"
                      disabled={disabled}
                      value={r.exemptNote ?? ''}
                      onChange={(e) => set(idx, { exemptNote: e.target.value || null })}
                    />
                  )}
                </td>
                <td className="px-2 py-1 text-center">
                  <Checkbox
                    aria-label="Vượt mức yêu cầu"
                    disabled={disabled}
                    checked={r.exceeded}
                    onChange={(e) => set(idx, { exceeded: e.target.checked })}
                  />
                </td>
                <td className="px-2 py-1">
                  {!disabled && (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Xóa dòng"
                      onClick={() => onChange(rows.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!disabled && (
        <Button size="sm" variant="outline" onClick={() => onChange([...rows, emptyRow()])}>
          <Plus className="size-4" /> Thêm nhiệm vụ
        </Button>
      )}
    </div>
  );
}

function ItemEditor({
  item,
  entry,
  onChange,
  disabled,
  rule,
  ev,
  reference,
}: {
  item: CriteriaItemDto;
  entry: Entry;
  onChange: (e: Entry) => void;
  disabled: boolean;
  rule: RuleConfig;
  ev: EvaluationDetail;
  reference?: string;
}) {
  const input = entry.input;
  const set = (patch: Partial<ItemInput>) => onChange({ ...entry, input: { ...input, ...patch } });
  const id = `item-${item.id}`;
  const formula = rule.kpiFormulas[ev.kpiProfile];
  const needsD = item.scoringMethod === 'KPI_COMPOSITE' && formula?.components.includes('D');

  return (
    <div className="space-y-2 border-b py-3 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Label htmlFor={id} className="max-w-3xl font-normal">
          <strong>{item.code}</strong> {item.name}
        </Label>
        <span className="text-xs whitespace-nowrap text-muted-foreground">
          Tối đa {item.maxPoints} điểm
        </span>
      </div>
      {reference !== undefined && (
        <p className="text-xs text-muted-foreground">Tự đánh giá: {reference}</p>
      )}

      {item.scoringMethod === 'PASS_FAIL' && (
        <Select
          id={id}
          className="w-48"
          disabled={disabled || input.notApplicable}
          value={input.passed === undefined ? '' : String(input.passed)}
          onChange={(e) =>
            set({ passed: e.target.value === '' ? undefined : e.target.value === 'true' })
          }
        >
          <option value="">— Chưa chấm —</option>
          <option value="true">Đảm bảo</option>
          <option value="false">Không đảm bảo</option>
        </Select>
      )}
      {item.scoringMethod === 'MANUAL_SCORE' && (
        <Input
          id={id}
          type="number"
          step="any"
          min={0}
          max={item.maxPoints}
          className="w-32"
          disabled={disabled || input.notApplicable}
          value={input.points ?? ''}
          onChange={(e) =>
            set({ points: e.target.value === '' ? undefined : Number(e.target.value) })
          }
        />
      )}
      {item.scoringMethod === 'QUALITATIVE_LEVEL' && (
        <Select
          id={id}
          className="max-w-xl"
          disabled={disabled || input.notApplicable}
          value={input.level ?? ''}
          onChange={(e) => set({ level: e.target.value || undefined })}
        >
          <option value="">— Chưa chấm —</option>
          {rule.qualitativeLevels.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </Select>
      )}
      {item.scoringMethod === 'TARGET_RATIO' && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Input
            id={id}
            type="number"
            step="any"
            className="w-32"
            disabled={disabled || input.notApplicable}
            value={input.actual ?? ''}
            onChange={(e) =>
              set({ actual: e.target.value === '' ? undefined : Number(e.target.value) })
            }
          />
          <span className="text-muted-foreground">
            mục tiêu {item.target} {item.measureUnit}
            {item.baseline !== null && `, ban đầu ${item.baseline}`} (
            {item.direction === 'DECREASE' ? 'càng giảm càng tốt' : 'càng tăng càng tốt'})
          </span>
        </div>
      )}
      {item.scoringMethod === 'KPI_COMPOSITE' && (
        <RowsEditor
          rows={input.rows ?? []}
          onChange={(rows) => set({ rows })}
          disabled={disabled}
          catalogVersionId={ev.criteriaVersion.workCatalogVersionId}
        />
      )}
      {needsD && (
        <fieldset className="grid gap-2 sm:grid-cols-3">
          <legend className="mb-1 text-xs font-medium">
            Thành phần D — lãnh đạo, chỉ đạo, điều hành
          </legend>
          {rule.leadershipD.subCriteria.map((s) => (
            <div key={s.code} className="space-y-1">
              <Label htmlFor={`${id}-${s.code}`} className="text-xs font-normal">
                {s.code}. {s.label}
              </Label>
              <Select
                id={`${id}-${s.code}`}
                disabled={disabled}
                value={input.dScores?.[s.code] ?? ''}
                onChange={(e) => {
                  const next = { ...(input.dScores ?? {}) };
                  if (e.target.value === '') delete next[s.code];
                  else next[s.code] = Number(e.target.value);
                  set({ dScores: next });
                }}
              >
                <option value="">— Chưa chấm —</option>
                {rule.leadershipD.allowedLevels.map((l) => (
                  <option key={l} value={l}>
                    {l * 100}%
                  </option>
                ))}
              </Select>
            </div>
          ))}
        </fieldset>
      )}
      {item.allowNotApplicable && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Label className="flex items-center gap-2 font-normal">
            <Checkbox
              disabled={disabled}
              checked={!!input.notApplicable}
              onChange={(e) => set({ notApplicable: e.target.checked })}
            />
            Không áp dụng
          </Label>
          {input.notApplicable && (
            <Input
              aria-label="Lý do không áp dụng"
              placeholder="Lý do"
              className="h-8 max-w-md"
              disabled={disabled}
              value={input.naReason ?? ''}
              onChange={(e) => set({ naReason: e.target.value })}
            />
          )}
        </div>
      )}
      {(!disabled || entry.note) && (
        <Textarea
          aria-label={`Ghi chú ${item.code}`}
          placeholder="Ghi chú, minh chứng"
          rows={1}
          disabled={disabled}
          value={entry.note}
          onChange={(e) => onChange({ ...entry, note: e.target.value })}
        />
      )}
    </div>
  );
}

export function ScoreSheet({
  ev,
  layer,
  editable,
}: {
  ev: EvaluationDetail;
  layer: Layer;
  editable: boolean;
}) {
  const toast = useToast();
  const rule = ev.ruleSetVersion.config;
  const items = scorableItems(ev.criteriaVersion.items);
  const saved = new Map(ev.items.map((i) => [i.criteriaItemId, i]));
  const [entries, setEntries] = useState<Record<string, Entry>>(() =>
    Object.fromEntries(
      items.map((it) => {
        const s = saved.get(it.id);
        const input = ((layer === 'review' ? (s?.reviewInput ?? s?.selfInput) : s?.selfInput) ??
          {}) as ItemInput;
        const note = (layer === 'review' ? s?.reviewNote : s?.selfNote) ?? '';
        return [it.id, { input: structuredClone(input), note }];
      }),
    ),
  );
  const [flags, setFlags] = useState<string[]>(ev.reviewFlags);
  const [trial, setTrial] = useState<TrialResult | null>(null);
  const invalidate = [kpiKeys.evaluation(ev.id), ['evaluations']] as const;

  const payload = (version: number) => ({
    items: items.map((it) => ({
      criteriaItemId: it.id,
      input: entries[it.id]!.input,
      note: entries[it.id]!.note || null,
    })),
    ...(layer === 'review' ? { flags } : {}),
    version,
  });
  const path = layer === 'self' ? 'self' : 'review';
  const save = useAction(
    () => api.put<EvaluationDetail>(`/evaluations/${ev.id}/${path}`, payload(ev.version)),
    invalidate,
  );
  const calc = useAction(async () => {
    if (editable)
      await api.put<EvaluationDetail>(`/evaluations/${ev.id}/${path}`, payload(ev.version));
    return api.post<TrialResult>(`/evaluations/${ev.id}/calculate`, { layer });
  }, invalidate);
  const finish = useAction(async () => {
    const after = await api.put<EvaluationDetail>(
      `/evaluations/${ev.id}/${path}`,
      payload(ev.version),
    );
    return api.post<EvaluationDetail>(
      `/evaluations/${ev.id}/${layer === 'self' ? 'submit' : 'complete-review'}`,
      { version: after.version },
    );
  }, invalidate);
  const error = save.error ?? calc.error ?? finish.error;
  const missing =
    error instanceof ApiClientError &&
    error.details &&
    typeof error.details === 'object' &&
    'missing' in error.details
      ? (error.details as { missing: string[] }).missing
      : [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {layer === 'self' ? 'Phiếu tự đánh giá' : 'Phiếu thẩm định (người đánh giá chấm lại)'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {items.map((it) => (
            <ItemEditor
              key={it.id}
              item={it}
              entry={entries[it.id]!}
              onChange={(e) => setEntries((all) => ({ ...all, [it.id]: e }))}
              disabled={!editable}
              rule={rule}
              ev={ev}
              reference={
                layer === 'review'
                  ? describe(saved.get(it.id)?.selfInput as ItemInput | undefined, it, rule)
                  : undefined
              }
            />
          ))}
          {layer === 'review' && (
            <fieldset className="mt-3 space-y-1">
              <legend className="text-sm font-medium">
                Cờ điều kiện xếp loại (người thẩm định ghi nhận, có căn cứ)
              </legend>
              {rule.rating.flags.map((f) => (
                <Label key={f.code} className="flex items-start gap-2 text-sm font-normal">
                  <Checkbox
                    disabled={!editable}
                    checked={flags.includes(f.code)}
                    onChange={(e) =>
                      setFlags((fl) =>
                        e.target.checked ? [...fl, f.code] : fl.filter((x) => x !== f.code),
                      )
                    }
                  />
                  <span>{f.label}</span>
                </Label>
              ))}
            </fieldset>
          )}
        </CardContent>
      </Card>

      <FormError error={error} />
      {missing.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-destructive">
          {missing.map((m) => (
            <li key={m}>Thiếu dữ liệu: {m}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          disabled={calc.isPending}
          onClick={() => calc.mutate(undefined, { onSuccess: setTrial })}
        >
          {editable ? 'Lưu và tính thử' : 'Tính thử'}
        </Button>
        {editable && (
          <>
            <Button
              variant="outline"
              disabled={save.isPending}
              onClick={() => save.mutate(undefined, { onSuccess: () => toast.success('Đã lưu') })}
            >
              Lưu nháp
            </Button>
            <Button
              disabled={finish.isPending}
              onClick={() =>
                finish.mutate(undefined, {
                  onSuccess: () =>
                    toast.success(
                      layer === 'self' ? 'Đã nộp tự đánh giá' : 'Đã hoàn tất thẩm định',
                    ),
                })
              }
            >
              {layer === 'self' ? 'Nộp tự đánh giá' : 'Hoàn tất thẩm định'}
            </Button>
          </>
        )}
      </div>
      {trial && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Kết quả tính thử ({layer === 'self' ? 'tự đánh giá' : 'thẩm định'}) — chưa lưu thành
              kết quả
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScoreResultView result={trial.result} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
