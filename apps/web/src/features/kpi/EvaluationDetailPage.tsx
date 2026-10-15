/**
 * Chi tiết hồ sơ đánh giá: 3 lớp điểm tách biệt (tự đánh giá / thẩm định / đã phê duyệt), phiếu chấm,
 * kết quả kèm giải thích, ảnh chụp tính điểm đã lưu, lịch sử; thao tác trả lại — phê duyệt — mở lại.
 */
import { Lock } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router';
import {
  EVALUATION_STATUS_LABELS,
  KPI_PROFILE_LABELS,
  type CalculationDto,
  type EvaluationDetail,
  type EvaluationStatus,
} from '@kpi/shared';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { PageHeader } from '@/components/common/page-header';
import { ErrorState, FormError, LoadingState } from '@/components/common/states';
import { useToast } from '@/components/common/toast-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { FormField, Select, Textarea } from '@/components/ui/form-controls';
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/table';
import { api } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { kpiKeys, useAction, useEvaluation } from './api';
import { AssignTasksCard } from './AssignTasksCard';
import { Num, ProvisionalNotice, ScoreResultView, StatusBadge } from './components';
import { ScoreSheet } from './ScoreSheet';

type Tab = 'sheet' | 'result' | 'history';
const KIND_LABELS: Record<CalculationDto['kind'], string> = {
  TRIAL: 'Tính thử',
  SELF: 'Tự đánh giá (khi nộp)',
  REVIEW: 'Thẩm định (khi hoàn tất)',
  APPROVAL: 'Phê duyệt (đã chốt)',
};
const ACTION_LABELS: Record<string, string> = {
  create: 'Tạo hồ sơ',
  saveSelf: 'Sửa tự đánh giá',
  submit: 'Nộp tự đánh giá',
  saveReview: 'Bắt đầu thẩm định',
  completeReview: 'Hoàn tất thẩm định',
  return: 'Trả lại',
  approve: 'Phê duyệt',
  reopen: 'Mở lại',
  assignTasks: 'Giao nhiệm vụ',
};
const statusLabel = (s: string | null) =>
  s ? (EVALUATION_STATUS_LABELS[s as EvaluationStatus] ?? s) : '—';

function LayerCard({
  title,
  total,
  rating,
  active,
}: {
  title: string;
  total: number | null;
  rating: string | null;
  active?: boolean;
}) {
  return (
    <div className={cn('rounded-lg border bg-card p-3', active && 'border-primary')}>
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="mt-1 text-2xl font-semibold">
        <Num value={total} />
      </p>
      <p className="text-sm">{rating ?? 'Chưa có mức xếp loại'}</p>
    </div>
  );
}

function ApproveDialog({ ev, onClose }: { ev: EvaluationDetail; onClose: () => void }) {
  const toast = useToast();
  const bands = ev.ruleSetVersion.config.rating.bands;
  const eligible = ev.latest.REVIEW?.result.rating.eligible ?? null;
  const [finalRating, setFinal] = useState(eligible ?? '');
  const [overrideReason, setReason] = useState('');
  const [comment, setComment] = useState('');
  const approve = useAction(
    (body: object) => api.post<EvaluationDetail>(`/evaluations/${ev.id}/approve`, body),
    [kpiKeys.evaluation(ev.id), ['evaluations']],
  );
  const overridden = finalRating !== (eligible ?? '');
  return (
    <Dialog
      open
      onClose={onClose}
      title="Phê duyệt kết quả đánh giá"
      description="Sau khi phê duyệt, hồ sơ bị khóa; mọi điều chỉnh phải qua quy trình mở lại có lý do."
    >
      <div className="space-y-3">
        <FormError error={approve.error} />
        <p className="text-sm">
          Điểm thẩm định: <strong>{ev.reviewTotal?.toLocaleString('vi-VN') ?? '—'}</strong>. Mức đề
          xuất theo quy tắc:{' '}
          <strong>
            {eligible
              ? `${bands.find((b) => b.code === eligible)?.label ?? eligible} (${eligible})`
              : 'không xác định'}
          </strong>
        </p>
        <FormField id="ap-rating" label="Mức xếp loại phê duyệt" required>
          <Select id="ap-rating" value={finalRating} onChange={(e) => setFinal(e.target.value)}>
            <option value="">— Chọn mức —</option>
            {bands.map((b) => (
              <option key={b.code} value={b.code}>
                {b.label} ({b.code})
              </option>
            ))}
          </Select>
        </FormField>
        {overridden && finalRating && (
          <FormField id="ap-reason" label="Lý do chọn mức khác đề xuất" required>
            <Textarea
              id="ap-reason"
              value={overrideReason}
              onChange={(e) => setReason(e.target.value)}
            />
          </FormField>
        )}
        <FormField id="ap-comment" label="Ý kiến phê duyệt">
          <Textarea id="ap-comment" value={comment} onChange={(e) => setComment(e.target.value)} />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button
            disabled={!finalRating || (overridden && !overrideReason.trim()) || approve.isPending}
            onClick={() =>
              approve.mutate(
                {
                  finalRating,
                  overrideReason: overridden ? overrideReason : null,
                  comment,
                  version: ev.version,
                },
                {
                  onSuccess: () => {
                    toast.success('Đã phê duyệt và khóa kết quả');
                    onClose();
                  },
                },
              )
            }
          >
            Phê duyệt
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function SnapshotView({ calc }: { calc: CalculationDto }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {KIND_LABELS[calc.kind]} · lần điều chỉnh {calc.revisionNo} ·{' '}
        {formatDateTime(calc.createdAt)} · engine {calc.engineVersion} · checksum{' '}
        <code>{calc.checksum.slice(0, 16)}…</code>
      </p>
      <ScoreResultView result={calc.result} />
    </div>
  );
}

export function EvaluationDetailPage() {
  const { id = '' } = useParams();
  const q = useEvaluation(id);
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('sheet');
  const [dialog, setDialog] = useState<'return' | 'reopen' | 'approve' | null>(null);
  const [snapshot, setSnapshot] = useState<string>('');
  const reasonAction = useAction(
    (a: { kind: 'return' | 'reopen'; reason: string; version: number }) =>
      api.post<EvaluationDetail>(`/evaluations/${id}/${a.kind}`, {
        reason: a.reason,
        version: a.version,
      }),
    [kpiKeys.evaluation(id), ['evaluations']],
  );

  if (q.isPending) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const ev = q.data;
  const reviewLayer =
    ['SUBMITTED', 'UNDER_REVIEW', 'REOPENED', 'REVIEWED', 'APPROVED'].includes(ev.status) &&
    (ev.can.editReview || ev.reviewTotal !== null || ev.items.some((i) => i.reviewInput));
  const snapshots = [
    ...ev.approvals,
    ...(['SELF', 'REVIEW'] as const).flatMap((k) => (ev.latest[k] ? [ev.latest[k]] : [])),
  ];
  const shown =
    snapshots.find((s) => s.id === snapshot) ??
    ev.latest.APPROVAL ??
    ev.latest.REVIEW ??
    ev.latest.SELF ??
    ev.approvals.at(-1);

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Hồ sơ đánh giá — ${ev.employee?.fullName ?? ''}`}
        description={`${ev.period.name} · ${ev.unitName ?? ''} · ${KPI_PROFILE_LABELS[ev.kpiProfile]} · Bộ tiêu chí ${ev.criteriaVersion.criteriaSetCode} v${ev.criteriaVersion.versionNo} · Quy tắc ${ev.ruleSetVersion.label}`}
        actions={
          <>
            {ev.can.return && (
              <Button variant="outline" onClick={() => setDialog('return')}>
                Trả lại
              </Button>
            )}
            {ev.can.approve && <Button onClick={() => setDialog('approve')}>Phê duyệt</Button>}
            {ev.can.reopen && (
              <Button variant="outline" onClick={() => setDialog('reopen')}>
                Mở lại
              </Button>
            )}
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={ev.status} />
        {ev.revisionNo > 1 && <Badge variant="outline">Lần điều chỉnh {ev.revisionNo}</Badge>}
        {ev.lockedAt && (
          <Badge variant="secondary">
            <Lock className="size-3" /> Đã khóa {formatDateTime(ev.lockedAt)}
          </Badge>
        )}
        {ev.isDemo && <Badge variant="outline">DỮ LIỆU DEMO</Badge>}
        <StatusBadge kind="config" status={ev.ruleSetVersion.status} />
        <span className="text-xs text-muted-foreground">(bộ quy tắc)</span>
        <StatusBadge kind="approval" status={ev.criteriaVersion.status} />
        <span className="text-xs text-muted-foreground">(bộ tiêu chí)</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <LayerCard title="Điểm tự đánh giá" total={ev.selfTotal} rating={ev.selfRating} />
        <LayerCard title="Điểm thẩm định" total={ev.reviewTotal} rating={ev.reviewRating} />
        <LayerCard
          title="Điểm đã phê duyệt"
          total={ev.approvedTotal}
          rating={ev.approvedRating}
          active={ev.status === 'APPROVED'}
        />
      </div>
      {ev.ratingOverrideReason && (
        <p className="text-sm">
          <strong>Lý do chọn mức khác đề xuất:</strong> {ev.ratingOverrideReason}
        </p>
      )}
      {ev.approvalBlockers.length > 0 &&
        ['REVIEWED', 'UNDER_REVIEW', 'SUBMITTED', 'REOPENED'].includes(ev.status) && (
          <ProvisionalNotice>
            <p className="font-medium">Chưa đủ điều kiện phê duyệt:</p>
            <ul className="list-disc pl-5">
              {ev.approvalBlockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </ProvisionalNotice>
        )}

      <div role="tablist" aria-label="Nội dung hồ sơ" className="flex gap-1 border-b">
        {(
          [
            ['sheet', 'Phiếu chấm điểm'],
            ['result', 'Kết quả và giải thích'],
            ['history', 'Lịch sử'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={tab === key}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm',
              tab === key
                ? 'border-primary font-medium'
                : 'border-transparent text-muted-foreground',
            )}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'sheet' && (
        // Dựng lại phiếu (nạp lại dữ liệu đã lưu) khi hồ sơ sang giai đoạn mới. "Đã nộp" → "Đang thẩm định"
        // xảy ra ngay lần lưu đầu của người thẩm định: coi là cùng giai đoạn để không mất kết quả tính thử.
        <div
          className="space-y-6"
          key={`${ev.status === 'SUBMITTED' ? 'UNDER_REVIEW' : ev.status}-${ev.revisionNo}`}
        >
          {ev.status === 'APPROVED' && (
            <ProvisionalNotice>
              Hồ sơ đã phê duyệt và bị khóa. Muốn điều chỉnh phải được người có thẩm quyền mở lại
              (ghi rõ lý do).
            </ProvisionalNotice>
          )}
          {ev.can.assignTasks && <AssignTasksCard key={`assign-${ev.version}`} ev={ev} />}
          {reviewLayer ? (
            <ScoreSheet ev={ev} layer="review" editable={ev.can.editReview} />
          ) : (
            // Người chỉ xem (ví dụ cấp trên vừa giao nhiệm vụ): nạp lại phiếu khi hồ sơ có phiên bản mới
            <ScoreSheet
              key={ev.can.editSelf ? 'self' : `self-${ev.version}`}
              ev={ev}
              layer="self"
              editable={ev.can.editSelf}
            />
          )}
          {reviewLayer && (
            <details>
              <summary className="cursor-pointer text-sm font-medium">
                Xem phiếu tự đánh giá
              </summary>
              <div className="mt-3">
                <ScoreSheet ev={ev} layer="self" editable={false} />
              </div>
            </details>
          )}
        </div>
      )}

      {tab === 'result' &&
        (shown ? (
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">Ảnh chụp kết quả đã lưu</CardTitle>
              <Select
                aria-label="Chọn ảnh chụp"
                className="w-auto"
                value={shown.id}
                onChange={(e) => setSnapshot(e.target.value)}
              >
                {snapshots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {KIND_LABELS[s.kind]} — lần {s.revisionNo} — {formatDateTime(s.createdAt)}
                  </option>
                ))}
              </Select>
            </CardHeader>
            <CardContent>
              <SnapshotView calc={shown} />
            </CardContent>
          </Card>
        ) : (
          <p className="text-sm text-muted-foreground">
            Chưa có kết quả được lưu. Dùng nút “Tính thử” ở phiếu chấm điểm để xem kết quả tạm tính.
          </p>
        ))}

      {tab === 'history' && (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <THead>
              <Tr>
                <Th>Thời điểm</Th>
                <Th>Thao tác</Th>
                <Th>Trạng thái</Th>
                <Th>Người thực hiện</Th>
                <Th>Ý kiến / lý do</Th>
              </Tr>
            </THead>
            <TBody>
              {ev.history.map((h) => (
                <Tr key={h.id}>
                  <Td className="whitespace-nowrap">{formatDateTime(h.createdAt)}</Td>
                  <Td>{ACTION_LABELS[h.action] ?? h.action}</Td>
                  <Td className="text-sm whitespace-nowrap">
                    {statusLabel(h.fromStatus)} → {statusLabel(h.toStatus)}
                  </Td>
                  <Td>{h.actor ?? 'Hệ thống'}</Td>
                  <Td className="text-sm">{h.comment ?? ''}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </div>
      )}

      <ConfirmDialog
        open={dialog === 'return' || dialog === 'reopen'}
        title={
          dialog === 'reopen'
            ? 'Mở lại kết quả đã phê duyệt'
            : 'Trả lại hồ sơ cho người được đánh giá'
        }
        description={
          dialog === 'reopen'
            ? 'Kết quả đã duyệt hiện tại vẫn được lưu nguyên trong lịch sử; hồ sơ chuyển sang lần điều chỉnh mới.'
            : undefined
        }
        confirmLabel={dialog === 'reopen' ? 'Mở lại' : 'Trả lại'}
        destructive
        requireReason
        pending={reasonAction.isPending}
        error={reasonAction.error}
        onClose={() => {
          setDialog(null);
          reasonAction.reset();
        }}
        onConfirm={(reason) =>
          (dialog === 'return' || dialog === 'reopen') &&
          reasonAction.mutate(
            { kind: dialog, reason, version: ev.version },
            {
              onSuccess: () => {
                toast.success(dialog === 'reopen' ? 'Đã mở lại hồ sơ' : 'Đã trả lại hồ sơ');
                setDialog(null);
              },
            },
          )
        }
      />
      {dialog === 'approve' && <ApproveDialog ev={ev} onClose={() => setDialog(null)} />}
    </div>
  );
}
