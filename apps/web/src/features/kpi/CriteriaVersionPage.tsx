/**
 * Chi tiết phiên bản bộ tiêu chí: cây tiêu chí, kết quả kiểm tra (tổng điểm, trọng số, phương pháp),
 * soạn thảo khi là bản nháp; trình — phê duyệt — trả lại — ngừng áp dụng.
 */
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router';
import {
  CRITERIA_ITEM_KIND_LABELS,
  KPI_PROFILE_LABELS,
  MEASURE_DIRECTION_LABELS,
  METHODS_BY_KIND,
  PERIOD_TYPE_LABELS,
  PERIOD_TYPES,
  SCORING_METHOD_LABELS,
  type CriteriaItemKind,
  type CriteriaVersionDto,
  type MeasureDirection,
  type PeriodType,
  type ScoringMethod,
} from '@kpi/shared';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { PageHeader } from '@/components/common/page-header';
import { ErrorState, FormError, LoadingState } from '@/components/common/states';
import { useToast } from '@/components/common/toast-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox, FormField, Input, Label, Select } from '@/components/ui/form-controls';
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/table';
import { api } from '@/lib/api-client';
import { useCan } from '@/lib/auth';
import { kpiKeys, useAction, useCatalogVersions, useCriteriaVersion, useRuleSets } from './api';
import { IssueList, Num, StatusBadge } from './components';

type Decision = 'submit' | 'approve' | 'return' | 'retire';
const DECISIONS: Record<Decision, { label: string; destructive?: boolean }> = {
  submit: { label: 'Trình phê duyệt' },
  approve: { label: 'Phê duyệt' },
  return: { label: 'Trả lại soạn thảo', destructive: true },
  retire: { label: 'Ngừng áp dụng', destructive: true },
};

interface EditRow {
  key: string;
  parentKey: string | null;
  kind: CriteriaItemKind;
  code: string;
  name: string;
  maxPoints: string;
  weight: string;
  scoringMethod: ScoringMethod | '';
  direction: MeasureDirection | '';
  target: string;
  baseline: string;
  measureUnit: string;
  allowNotApplicable: boolean;
  evidenceRequired: boolean;
}

const CHILD_KIND: Partial<Record<CriteriaItemKind, CriteriaItemKind>> = {
  GENERAL_GROUP: 'GENERAL_ITEM',
  AXIS: 'AXIS_INDICATOR',
};
const str = (v: number | null) => (v === null ? '' : String(v));
const numOrNull = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));

/** Sắp xếp cây: cha trước, con ngay sau cha. */
function ordered<T extends { key: string; parentKey: string | null }>(
  rows: T[],
): { row: T; depth: number }[] {
  const out: { row: T; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const r of rows.filter((x) => x.parentKey === parent)) {
      out.push({ row: r, depth });
      walk(r.key, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

function Editor({ v, onDone }: { v: CriteriaVersionDto; onDone: () => void }) {
  const toast = useToast();
  const ruleSets = useRuleSets();
  const catalogs = useCatalogVersions();
  const [generalMax, setGeneralMax] = useState(String(v.generalMax));
  const [resultMax, setResultMax] = useState(String(v.resultMax));
  const [periodTypes, setPeriodTypes] = useState<PeriodType[]>(v.periodTypes);
  const [ruleSetVersionId, setRuleSet] = useState(v.ruleSetVersionId ?? '');
  const [workCatalogVersionId, setCatalog] = useState(v.workCatalogVersionId ?? '');
  const [changeNote, setChangeNote] = useState(v.changeNote ?? '');
  const [rows, setRows] = useState<EditRow[]>(() =>
    v.items.map((i) => ({
      key: i.id,
      parentKey: i.parentId,
      kind: i.kind,
      code: i.code,
      name: i.name,
      maxPoints: String(i.maxPoints),
      weight: str(i.weight),
      scoringMethod: i.scoringMethod ?? '',
      direction: i.direction ?? '',
      target: str(i.target),
      baseline: str(i.baseline),
      measureUnit: i.measureUnit ?? '',
      allowNotApplicable: i.allowNotApplicable,
      evidenceRequired: i.evidenceRequired,
    })),
  );
  const save = useAction(
    (body: object) => api.put<CriteriaVersionDto>(`/criteria-versions/${v.id}/items`, body),
    [kpiKeys.criteriaVersion(v.id), kpiKeys.criteriaSets],
  );

  const update = (key: string, patch: Partial<EditRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const add = (kind: CriteriaItemKind, parentKey: string | null) => {
    const key = `new-${crypto.randomUUID()}`;
    const method = METHODS_BY_KIND[kind][0] ?? '';
    setRows((rs) => [
      ...rs,
      {
        key,
        parentKey,
        kind,
        code: '',
        name: '',
        maxPoints: '0',
        weight: '',
        scoringMethod: method,
        direction: '',
        target: '',
        baseline: '',
        measureUnit: '',
        allowNotApplicable: false,
        evidenceRequired: false,
      },
    ]);
  };
  const remove = (key: string) => {
    const drop = new Set([key]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const r of rows) {
        if (r.parentKey && drop.has(r.parentKey) && !drop.has(r.key)) {
          drop.add(r.key);
          changed = true;
        }
      }
    }
    setRows((rs) => rs.filter((r) => !drop.has(r.key)));
  };

  const submit = () => {
    const tree = ordered(rows);
    save.mutate(
      {
        generalMax: Number(generalMax),
        resultMax: Number(resultMax),
        periodTypes,
        ruleSetVersionId: ruleSetVersionId || null,
        workCatalogVersionId: workCatalogVersionId || null,
        changeNote,
        version: v.version,
        items: tree.map(({ row: r }, idx) => ({
          key: r.key,
          parentKey: r.parentKey,
          kind: r.kind,
          code: r.code,
          name: r.name,
          maxPoints: Number(r.maxPoints.replace(',', '.')),
          weight: numOrNull(r.weight),
          scoringMethod: r.scoringMethod || null,
          direction: r.direction || null,
          target: numOrNull(r.target),
          baseline: numOrNull(r.baseline),
          measureUnit: r.measureUnit,
          allowNotApplicable: r.allowNotApplicable,
          evidenceRequired: r.evidenceRequired,
          sortOrder: idx + 1,
        })),
      },
      {
        onSuccess: (res) => {
          const errors = res.issues.filter((i) => i.level === 'error').length;
          toast.success(
            errors ? `Đã lưu — còn ${errors} lỗi cần sửa trước khi trình` : 'Đã lưu bộ tiêu chí',
          );
          onDone();
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Soạn thảo bộ tiêu chí</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <FormError error={save.error} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FormField id="cv-gmax" label="Điểm tối đa tiêu chí chung">
            <Input
              id="cv-gmax"
              inputMode="decimal"
              value={generalMax}
              onChange={(e) => setGeneralMax(e.target.value)}
            />
          </FormField>
          <FormField id="cv-rmax" label="Điểm tối đa kết quả nhiệm vụ">
            <Input
              id="cv-rmax"
              inputMode="decimal"
              value={resultMax}
              onChange={(e) => setResultMax(e.target.value)}
            />
          </FormField>
          <FormField id="cv-rule" label="Bộ quy tắc tính điểm">
            <Select
              id="cv-rule"
              value={ruleSetVersionId}
              onChange={(e) => setRuleSet(e.target.value)}
            >
              <option value="">— Chưa chọn —</option>
              {ruleSets.data?.flatMap((s) =>
                s.versions
                  .filter((x) => x.status !== 'RETIRED')
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {s.code} v{x.versionNo} ({x.status})
                    </option>
                  )),
              )}
            </Select>
          </FormField>
          <FormField id="cv-catalog" label="Danh mục SP/CV">
            <Select
              id="cv-catalog"
              value={workCatalogVersionId}
              onChange={(e) => setCatalog(e.target.value)}
            >
              <option value="">— Không dùng —</option>
              {catalogs.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.catalogCode} v{c.versionNo}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        <fieldset className="flex flex-wrap gap-4">
          <legend className="mb-1 text-sm font-medium">Loại kỳ áp dụng</legend>
          {PERIOD_TYPES.map((t) => (
            <Label key={t} className="flex items-center gap-2 font-normal">
              <Checkbox
                checked={periodTypes.includes(t)}
                onChange={(e) =>
                  setPeriodTypes((p) => (e.target.checked ? [...p, t] : p.filter((x) => x !== t)))
                }
              />
              {PERIOD_TYPE_LABELS[t]}
            </Label>
          ))}
        </fieldset>

        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <THead>
              <Tr>
                <Th>Loại</Th>
                <Th>Mã</Th>
                <Th className="min-w-72">Tên tiêu chí</Th>
                <Th>Điểm tối đa</Th>
                <Th>Trọng số %</Th>
                <Th>Phương pháp</Th>
                <Th>Chiều / mục tiêu / ban đầu</Th>
                <Th />
              </Tr>
            </THead>
            <TBody>
              {ordered(rows).map(({ row: r, depth }) => (
                <Tr key={r.key}>
                  <Td
                    className="text-xs whitespace-nowrap"
                    style={{ paddingLeft: `${0.75 + depth}rem` }}
                  >
                    {CRITERIA_ITEM_KIND_LABELS[r.kind]}
                  </Td>
                  <Td>
                    <Input
                      aria-label="Mã"
                      className="h-8 w-20"
                      value={r.code}
                      onChange={(e) => update(r.key, { code: e.target.value })}
                    />
                  </Td>
                  <Td>
                    <Input
                      aria-label="Tên tiêu chí"
                      className="h-8"
                      value={r.name}
                      onChange={(e) => update(r.key, { name: e.target.value })}
                    />
                  </Td>
                  <Td>
                    <Input
                      aria-label="Điểm tối đa"
                      className="h-8 w-20"
                      inputMode="decimal"
                      value={r.maxPoints}
                      onChange={(e) => update(r.key, { maxPoints: e.target.value })}
                    />
                  </Td>
                  <Td>
                    {r.kind === 'AXIS_INDICATOR' && (
                      <Input
                        aria-label="Trọng số"
                        className="h-8 w-20"
                        inputMode="decimal"
                        value={r.weight}
                        onChange={(e) => update(r.key, { weight: e.target.value })}
                      />
                    )}
                  </Td>
                  <Td>
                    {METHODS_BY_KIND[r.kind].length > 0 && (
                      <Select
                        aria-label="Phương pháp"
                        className="h-8"
                        value={r.scoringMethod}
                        onChange={(e) =>
                          update(r.key, { scoringMethod: e.target.value as ScoringMethod })
                        }
                      >
                        {METHODS_BY_KIND[r.kind].map((m) => (
                          <option key={m} value={m}>
                            {SCORING_METHOD_LABELS[m]}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Td>
                  <Td>
                    {r.scoringMethod === 'TARGET_RATIO' && (
                      <div className="flex gap-1">
                        <Select
                          aria-label="Chiều đánh giá"
                          className="h-8 w-28"
                          value={r.direction}
                          onChange={(e) =>
                            update(r.key, { direction: e.target.value as MeasureDirection })
                          }
                        >
                          <option value="">—</option>
                          {(Object.keys(MEASURE_DIRECTION_LABELS) as MeasureDirection[]).map(
                            (d) => (
                              <option key={d} value={d}>
                                {MEASURE_DIRECTION_LABELS[d]}
                              </option>
                            ),
                          )}
                        </Select>
                        <Input
                          aria-label="Mục tiêu"
                          placeholder="Mục tiêu"
                          className="h-8 w-20"
                          value={r.target}
                          onChange={(e) => update(r.key, { target: e.target.value })}
                        />
                        <Input
                          aria-label="Giá trị ban đầu"
                          placeholder="Ban đầu"
                          className="h-8 w-20"
                          value={r.baseline}
                          onChange={(e) => update(r.key, { baseline: e.target.value })}
                        />
                      </div>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap">
                    {CHILD_KIND[r.kind] && (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Thêm mục con của ${r.code}`}
                        onClick={() => add(CHILD_KIND[r.kind]!, r.key)}
                      >
                        <Plus className="size-4" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Xóa ${r.code}`}
                      onClick={() => remove(r.key)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => add('GENERAL_GROUP', null)}>
            <Plus className="size-4" /> Nhóm tiêu chí chung
          </Button>
          <Button size="sm" variant="outline" onClick={() => add('AXIS', null)}>
            <Plus className="size-4" /> Trục kết quả nhiệm vụ
          </Button>
        </div>
        <FormField id="cv-note" label="Ghi chú thay đổi">
          <Input id="cv-note" value={changeNote} onChange={(e) => setChangeNote(e.target.value)} />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onDone}>
            Hủy
          </Button>
          <Button onClick={submit} disabled={save.isPending}>
            {save.isPending ? 'Đang lưu...' : 'Lưu và kiểm tra'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function CriteriaVersionPage() {
  const { id = '' } = useParams();
  const q = useCriteriaVersion(id);
  const can = useCan();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [decision, setDecision] = useState<Decision | null>(null);
  const act = useAction(
    (a: { d: Decision; note: string; version: number }) =>
      api.post<CriteriaVersionDto>(`/criteria-versions/${id}/${a.d}`, {
        note: a.note,
        version: a.version,
      }),
    [kpiKeys.criteriaVersion(id), kpiKeys.criteriaSets],
  );

  if (q.isPending) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const v = q.data;
  const actions: Decision[] = [];
  if (v.status === 'DRAFT' && can('criteria.write')) actions.push('submit');
  if (v.status === 'SUBMITTED' && can('criteria.approve')) actions.push('approve', 'return');
  if (v.status === 'APPROVED' && can('criteria.approve')) actions.push('retire');
  const tree = ordered(v.items.map((i) => ({ ...i, key: i.id, parentKey: i.parentId })));

  return (
    <div className="space-y-4">
      <PageHeader
        title={`${v.criteriaSetCode} — phiên bản ${v.versionNo}`}
        description={`${v.criteriaSetName} · ${KPI_PROFILE_LABELS[v.kpiProfile]} · Kỳ: ${v.periodTypes.map((t) => PERIOD_TYPE_LABELS[t]).join(', ')} · Quy tắc: ${v.ruleSetVersionLabel ?? 'chưa gắn'}`}
        actions={
          <>
            {v.status === 'DRAFT' && can('criteria.write') && !editing && (
              <Button variant="outline" onClick={() => setEditing(true)}>
                Soạn thảo
              </Button>
            )}
            {actions.map((d) => (
              <Button
                key={d}
                variant={DECISIONS[d].destructive ? 'outline' : 'default'}
                onClick={() => setDecision(d)}
              >
                {DECISIONS[d].label}
              </Button>
            ))}
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge kind="approval" status={v.status} />
        {v.changeNote && <span className="text-sm text-muted-foreground">{v.changeNote}</span>}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Kết quả kiểm tra</CardTitle>
        </CardHeader>
        <CardContent>
          <IssueList
            issues={v.issues}
            empty="Không có lỗi: tổng điểm, trọng số, phương pháp chấm hợp lệ."
          />
        </CardContent>
      </Card>

      {editing ? (
        <Editor v={v} onDone={() => setEditing(false)} />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <THead>
              <Tr>
                <Th>Mã</Th>
                <Th>Tiêu chí</Th>
                <Th className="text-right">Điểm tối đa</Th>
                <Th>Phương pháp chấm</Th>
                <Th>Ghi chú</Th>
              </Tr>
            </THead>
            <TBody>
              {tree.map(({ row: i, depth }) => (
                <Tr
                  key={i.id}
                  className={
                    i.kind === 'GENERAL_GROUP' || i.kind === 'AXIS' ? 'bg-muted/40' : undefined
                  }
                >
                  <Td
                    className="align-top whitespace-nowrap"
                    style={{ paddingLeft: `${0.75 + depth * 1.25}rem` }}
                  >
                    {i.code}
                  </Td>
                  <Td className="align-top">
                    <p
                      className={
                        i.kind === 'GENERAL_GROUP' || i.kind === 'AXIS' ? 'font-medium' : undefined
                      }
                    >
                      {i.name}
                    </p>
                    {i.description && (
                      <p className="mt-1 text-xs text-muted-foreground">{i.description}</p>
                    )}
                  </Td>
                  <Td className="text-right align-top">
                    <Num value={i.maxPoints} />
                    {i.weight !== null && (
                      <p className="text-xs text-muted-foreground">trọng số {i.weight}%</p>
                    )}
                  </Td>
                  <Td className="align-top text-sm">
                    {i.scoringMethod ? SCORING_METHOD_LABELS[i.scoringMethod] : '—'}
                  </Td>
                  <Td className="align-top text-xs">
                    {i.evidenceRequired && <Badge variant="outline">Cần minh chứng</Badge>}{' '}
                    {i.dataSource}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </div>
      )}

      <ConfirmDialog
        open={decision !== null}
        title={decision ? DECISIONS[decision].label : ''}
        confirmLabel={decision ? DECISIONS[decision].label : ''}
        destructive={decision ? DECISIONS[decision].destructive : false}
        requireReason
        pending={act.isPending}
        error={act.error}
        onClose={() => {
          setDecision(null);
          act.reset();
        }}
        onConfirm={(note) =>
          decision &&
          act.mutate(
            { d: decision, note, version: v.version },
            {
              onSuccess: () => {
                toast.success('Đã cập nhật trạng thái bộ tiêu chí');
                setDecision(null);
              },
            },
          )
        }
      />
    </div>
  );
}
