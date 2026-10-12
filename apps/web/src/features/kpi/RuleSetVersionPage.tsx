/**
 * Chi tiết phiên bản bộ quy tắc: trình bày cấu hình dưới dạng bảng dễ đọc (công thức, mức trừ, ngưỡng, điều kiện),
 * căn cứ từng khóa; sửa cấu hình (JSON) khi là bản nháp; trình — xác nhận — trả lại — ngừng áp dụng.
 */
import { useState } from 'react';
import { useParams } from 'react-router';
import {
  KPI_COMPONENT_LABELS,
  RATING_METRIC_LABELS,
  type RuleConfig,
  type RuleSetVersionDto,
} from '@kpi/shared';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { PageHeader } from '@/components/common/page-header';
import { ErrorState, FormError, LoadingState } from '@/components/common/states';
import { useToast } from '@/components/common/toast-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField, Input, Textarea } from '@/components/ui/form-controls';
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/table';
import { api, ApiClientError } from '@/lib/api-client';
import { useCan } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { kpiKeys, useAction, useRuleSetVersion } from './api';
import { Pct, ProvisionalNotice, StatusBadge } from './components';

type Decision = 'submit' | 'confirm' | 'return' | 'retire';
const DECISIONS: Record<Decision, { label: string; title: string; destructive?: boolean }> = {
  submit: { label: 'Trình xác nhận', title: 'Trình phiên bản để người có thẩm quyền xác nhận' },
  confirm: {
    label: 'Xác nhận áp dụng',
    title: 'Xác nhận áp dụng phiên bản này (ghi căn cứ/ý kiến)',
  },
  return: { label: 'Trả lại soạn thảo', title: 'Trả lại phiên bản về bản nháp', destructive: true },
  retire: { label: 'Ngừng áp dụng', title: 'Ngừng áp dụng phiên bản này', destructive: true },
};

const OP_TEXT: Record<string, string> = { '>=': '≥', '<=': '≤', '>': '>', '<': '<', '=': '=' };

function Row({
  k,
  label,
  children,
  provisional,
}: {
  k: string;
  label: string;
  children: React.ReactNode;
  provisional: Set<string>;
}) {
  const isProv = [...provisional].some(
    (p) => k === p || k.startsWith(`${p}.`) || p.startsWith(`${k}.`),
  );
  return (
    <Tr>
      <Td className="w-64 align-top font-medium">
        {label}
        {isProv && (
          <Badge variant="warning" className="ml-2">
            Tạm
          </Badge>
        )}
        <p className="font-mono text-xs font-normal text-muted-foreground">{k}</p>
      </Td>
      <Td className="align-top text-sm">{children}</Td>
    </Tr>
  );
}

function ConfigView({ cfg }: { cfg: RuleConfig }) {
  const prov = new Set(cfg.provisionalKeys);
  const formula = (p: 'LEADER' | 'STAFF') => {
    const f = cfg.kpiFormulas[p];
    if (!f) return 'Không áp dụng';
    const parts = f.components.map((c) => `${c} (${KPI_COMPONENT_LABELS[c]})`);
    return f.aggregate === 'MEAN'
      ? `KPI = (${f.components.join(' + ')}) / ${f.components.length} — ${parts.join(', ')}`
      : `KPI = Σ trọng số × thành phần: ${f.components.map((c) => `${c}×${f.weights?.[c] ?? '?'}`).join(' + ')}`;
  };
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TBody>
            <Row k="scale" label="Thang điểm" provisional={prov}>
              Tối đa {cfg.scale.max} = tiêu chí chung {cfg.scale.generalMax} + kết quả nhiệm vụ{' '}
              {cfg.scale.resultMax}
            </Row>
            <Row
              k="kpiFormulas.LEADER"
              label="Công thức KPI — lãnh đạo, quản lý"
              provisional={prov}
            >
              {formula('LEADER')}
            </Row>
            <Row k="kpiFormulas.STAFF" label="Công thức KPI — công chức" provisional={prov}>
              {formula('STAFF')}
            </Row>
            <Row k="composite.capA" label="Trần thành phần số lượng (A)" provisional={prov}>
              <Pct value={cfg.composite.capA} />
            </Row>
            <Row
              k="composite.qualityDenominator"
              label="Mẫu số thành phần chất lượng (B)"
              provisional={prov}
            >
              {cfg.composite.qualityDenominator === 'PLANNED'
                ? 'Khối lượng kế hoạch quy đổi (cột 7)'
                : 'Khối lượng hoàn thành quy đổi (cột 9)'}
            </Row>
            <Row
              k="composite.timelinessDenominator"
              label="Mẫu số thành phần tiến độ (C)"
              provisional={prov}
            >
              {cfg.composite.timelinessDenominator === 'PLANNED'
                ? 'Khối lượng kế hoạch quy đổi (cột 7)'
                : 'Khối lượng hoàn thành quy đổi (cột 9)'}
            </Row>
            <Row
              k="composite.reworkDeductionRate"
              label="Mức trừ mỗi lần làm lại"
              provisional={prov}
            >
              <Pct value={cfg.composite.reworkDeductionRate} />
            </Row>
            <Row
              k="composite.lateDeductionRate"
              label="Mức trừ mỗi lần chậm tiến độ"
              provisional={prov}
            >
              <Pct value={cfg.composite.lateDeductionRate} />
            </Row>
            <Row k="leadershipD" label="Thành phần D (lãnh đạo)" provisional={prov}>
              {cfg.leadershipD.subCriteria.map((s) => `${s.code}: ${s.label}`).join('; ')}. Mức cho
              phép: {cfg.leadershipD.allowedLevels.map((l) => `${l * 100}%`).join(', ')}
            </Row>
            <Row k="passFail" label="Tiêu chí đảm bảo/không đảm bảo" provisional={prov}>
              Đảm bảo = điểm tối đa; không đảm bảo = <Pct value={cfg.passFail.failRatio} /> điểm tối
              đa
            </Row>
            <Row k="targetRatio" label="Chỉ tiêu so với mục tiêu" provisional={prov}>
              Trần <Pct value={cfg.targetRatio.cap} />; chỉ tiêu giảm:{' '}
              {cfg.targetRatio.decreaseMethod === 'BASELINE_GAP'
                ? '(ban đầu − thực tế)/(ban đầu − mục tiêu)'
                : 'mục tiêu / thực tế'}
            </Row>
            <Row k="qualitativeLevels.ratio" label="Mức đánh giá định tính" provisional={prov}>
              {cfg.qualitativeLevels
                .map((l) => `${l.code} = ${l.ratio * 100}% (${l.label})`)
                .join('; ')}
            </Row>
            <Row k="notApplicable" label="Tiêu chí không áp dụng" provisional={prov}>
              {cfg.notApplicable.policy === 'NOT_ALLOWED'
                ? 'Không cho phép loại trừ'
                : 'Loại khỏi mẫu số và quy đổi lại thang điểm'}
            </Row>
            <Row k="rounding" label="Làm tròn tổng điểm" provisional={prov}>
              {cfg.rounding.decimals} chữ số thập phân, kiểu {cfg.rounding.mode}
            </Row>
            <Row k="outliers" label="Cảnh báo giá trị bất thường" provisional={prov}>
              Hoàn thành &gt; {cfg.outliers.maxCompletedOverPlanned} lần kế hoạch
            </Row>
            <Row k="annualAggregation" label="Tổng hợp năm" provisional={prov}>
              {cfg.annualAggregation.strategy === 'MANUAL_WITH_REFERENCE'
                ? 'Người có thẩm quyền quyết định, hệ thống chỉ hiển thị kết quả các quý làm căn cứ'
                : 'Bình quân có trọng số các kỳ'}
            </Row>
          </TBody>
        </Table>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ngưỡng và điều kiện xếp loại</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 overflow-x-auto">
          <Table>
            <THead>
              <Tr>
                <Th>Mức</Th>
                <Th>Khoảng điểm</Th>
                <Th>Điều kiện kèm theo</Th>
              </Tr>
            </THead>
            <TBody>
              {cfg.rating.bands.map((b) => {
                const conds = cfg.rating.conditions.filter((c) => c.rating === b.code);
                return (
                  <Tr key={b.code}>
                    <Td className="align-top font-medium">
                      {b.label} ({b.code})
                    </Td>
                    <Td className="align-top whitespace-nowrap">
                      {b.min !== null ? `≥ ${b.min}` : ''}
                      {b.min !== null && b.maxExclusive !== null ? ' và ' : ''}
                      {b.maxExclusive !== null ? `< ${b.maxExclusive}` : ''}
                      {b.assignOnlyWithinRange && (
                        <p className="text-xs text-muted-foreground">
                          Chỉ xếp khi điểm nằm trong khoảng
                        </p>
                      )}
                    </Td>
                    <Td className="align-top text-sm">
                      {conds.length === 0
                        ? '—'
                        : conds.map((c, i) => (
                            <div key={i} className="mb-1">
                              <p>
                                [{c.appliesTo.join(', ')}]{' '}
                                {c.all
                                  .map((x) =>
                                    x.type === 'metric'
                                      ? `${RATING_METRIC_LABELS[x.metric]} ${OP_TEXT[x.op] ?? x.op} ${x.metric === 'totalScore' ? x.value : `${x.value * 100}%`}`
                                      : `không có cờ "${x.flag}"`,
                                  )
                                  .join('; ')}
                              </p>
                              {c.note && <p className="text-xs text-muted-foreground">{c.note}</p>}
                            </div>
                          ))}
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
          {cfg.rating.forced.map((f, i) => (
            <p key={i} className="text-sm">
              <strong>Bắt buộc xếp {f.rating}</strong> khi có một trong các cờ:{' '}
              {f.anyFlag.join(', ')}.{' '}
              {f.note && <span className="text-muted-foreground">{f.note}</span>}
            </p>
          ))}
          <details>
            <summary className="cursor-pointer text-sm font-medium">
              Danh sách cờ điều kiện ({cfg.rating.flags.length})
            </summary>
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm">
              {cfg.rating.flags.map((f) => (
                <li key={f.code}>
                  <code>{f.code}</code>: {f.label}
                </li>
              ))}
            </ul>
          </details>
        </CardContent>
      </Card>
    </div>
  );
}

function ConfigEditor({ v, onDone }: { v: RuleSetVersionDto; onDone: () => void }) {
  const toast = useToast();
  const [text, setText] = useState(() => JSON.stringify(v.config, null, 2));
  const [legalBasis, setLegalBasis] = useState(v.legalBasis);
  const [parseError, setParseError] = useState<string | null>(null);
  const save = useAction(
    (body: object) => api.put<RuleSetVersionDto>(`/rule-set-versions/${v.id}`, body),
    [kpiKeys.ruleSetVersion(v.id), kpiKeys.ruleSets],
  );
  const details =
    save.error instanceof ApiClientError && Array.isArray(save.error.details)
      ? (save.error.details as { path: string; message: string }[])
      : [];

  const submit = () => {
    let config: unknown;
    try {
      config = JSON.parse(text);
    } catch (e) {
      setParseError(`JSON không hợp lệ: ${(e as Error).message}`);
      return;
    }
    setParseError(null);
    save.mutate(
      {
        config,
        legalBasis,
        sourceRefs: v.sourceRefs,
        effectiveFrom: v.effectiveFrom,
        version: v.version,
      },
      {
        onSuccess: () => {
          toast.success('Đã lưu cấu hình');
          onDone();
        },
      },
    );
  };

  return (
    <div className="space-y-3">
      <FormError error={parseError ? new Error(parseError) : save.error} />
      {details.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-destructive">
          {details.map((d, i) => (
            <li key={i}>
              <code>{d.path}</code>: {d.message}
            </li>
          ))}
        </ul>
      )}
      <FormField id="rs-legal" label="Căn cứ văn bản" required>
        <Input id="rs-legal" value={legalBasis} onChange={(e) => setLegalBasis(e.target.value)} />
      </FormField>
      <FormField
        id="rs-config"
        label="Cấu hình (JSON)"
        hint="Hệ thống kiểm tra cấu trúc, tổng thang điểm, mã mức/cờ khi lưu."
      >
        <Textarea
          id="rs-config"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={24}
          className="font-mono text-xs"
          spellCheck={false}
        />
      </FormField>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onDone}>
          Hủy
        </Button>
        <Button onClick={submit} disabled={save.isPending}>
          {save.isPending ? 'Đang lưu...' : 'Lưu cấu hình'}
        </Button>
      </div>
    </div>
  );
}

export function RuleSetVersionPage() {
  const { id = '' } = useParams();
  const q = useRuleSetVersion(id);
  const can = useCan();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [decision, setDecision] = useState<Decision | null>(null);
  const act = useAction(
    (a: { d: Decision; note: string; version: number }) =>
      api.post<RuleSetVersionDto>(`/rule-set-versions/${id}/${a.d}`, {
        note: a.note,
        version: a.version,
      }),
    [kpiKeys.ruleSetVersion(id), kpiKeys.ruleSets],
  );

  if (q.isPending) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const v = q.data;
  const actions: Decision[] = [];
  if (v.status === 'DRAFT' && can('ruleset.write')) actions.push('submit');
  if (v.status === 'PENDING_CONFIRMATION' && can('ruleset.confirm'))
    actions.push('confirm', 'return');
  if (v.status === 'CONFIRMED' && can('ruleset.confirm')) actions.push('retire');

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Phiên bản quy tắc v${v.versionNo}`}
        description={v.legalBasis}
        actions={
          <>
            {v.status === 'DRAFT' && can('ruleset.write') && !editing && (
              <Button variant="outline" onClick={() => setEditing(true)}>
                Sửa cấu hình
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
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <StatusBadge kind="config" status={v.status} />
        <span className="text-muted-foreground">
          Mã kiểm tra (checksum): <code>{v.checksum.slice(0, 16)}…</code>
        </span>
        {v.confirmedAt && (
          <span className="text-muted-foreground">
            Xác nhận lúc {formatDateTime(v.confirmedAt)} — {v.confirmNote}
          </span>
        )}
      </div>
      {v.status !== 'CONFIRMED' && (
        <ProvisionalNotice>
          Phiên bản chưa được xác nhận: kết quả tính theo phiên bản này chỉ mang tính{' '}
          <strong>tính thử</strong>, không được dùng để phê duyệt kết quả đánh giá.
        </ProvisionalNotice>
      )}
      {editing ? (
        <ConfigEditor v={v} onDone={() => setEditing(false)} />
      ) : (
        <ConfigView cfg={v.config} />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Căn cứ từng nội dung cấu hình</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <THead>
              <Tr>
                <Th>Khóa</Th>
                <Th>Văn bản</Th>
                <Th>Vị trí</Th>
                <Th>Ghi chú</Th>
              </Tr>
            </THead>
            <TBody>
              {v.sourceRefs.map((r, i) => (
                <Tr key={i}>
                  <Td className="font-mono text-xs">{r.key}</Td>
                  <Td>{r.document}</Td>
                  <Td>{r.location ?? '—'}</Td>
                  <Td className="text-sm">{r.note ?? ''}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={decision !== null}
        title={decision ? DECISIONS[decision].title : ''}
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
                toast.success('Đã cập nhật trạng thái phiên bản');
                setDecision(null);
              },
            },
          )
        }
      />
    </div>
  );
}
