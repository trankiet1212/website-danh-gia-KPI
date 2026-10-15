/**
 * Giao việc hằng ngày (docs/06 §5.7): xem theo tuần, cấp trên chọn ngày bất kỳ để giao việc cho cấp dưới,
 * cán bộ báo cáo kết quả, cấp trên đánh giá từng việc. Chỉ theo dõi — không quy ra điểm.
 */
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  DAILY_REPORT_STATUS_LABELS,
  DAILY_TASK_QUALITY_LABELS,
  DAILY_TASK_RESULT_LABELS,
  DAILY_TASK_TIMELINESS_LABELS,
  type DailyAssigneeDto,
  type DailyTaskDto,
  type DailyTaskQuality,
  type DailyTaskResult,
  type DailyTaskTimeliness,
} from '@kpi/shared';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { PageHeader } from '@/components/common/page-header';
import { ErrorState, FormError, LoadingState } from '@/components/common/states';
import { useToast } from '@/components/common/toast-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, FormField, Input, Label, Select, Textarea } from '@/components/ui/form-controls';
import { api } from '@/lib/api-client';
import { useCan, useMe } from '@/lib/auth';
import { formatDate, todayIso } from '@/lib/format';
import { cn } from '@/lib/utils';
import { deleteDailyTask, useAssignees, useDailyAction, useDailyTasks } from './api';
import { addDaysIso, shortDate, weekDays, weekStart, weekdayName } from './week';

type DialogState =
  | { kind: 'create'; date: string }
  | { kind: 'edit'; task: DailyTaskDto }
  | { kind: 'report' | 'evaluate' | 'delete'; task: DailyTaskDto }
  | null;

function TaskFormDialog({
  state,
  assignees,
  onClose,
}: {
  state: { kind: 'create'; date: string } | { kind: 'edit'; task: DailyTaskDto };
  assignees: DailyAssigneeDto[];
  onClose: () => void;
}) {
  const toast = useToast();
  const editing = state.kind === 'edit' ? state.task : null;
  const [date, setDate] = useState(
    editing?.workDate ?? (state.kind === 'create' ? state.date : ''),
  );
  const [title, setTitle] = useState(editing?.title ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [picked, setPicked] = useState<string[]>([]);
  const save = useDailyAction(() =>
    editing
      ? api.patch(`/daily-tasks/${editing.id}`, {
          workDate: date,
          title,
          description,
          version: editing.version,
        })
      : api.post('/daily-tasks', { employeeIds: picked, workDate: date, title, description }),
  );
  const toggle = (id: string, on: boolean) =>
    setPicked((p) => (on ? [...p, id] : p.filter((x) => x !== id)));
  return (
    <Dialog
      open
      onClose={onClose}
      title={editing ? 'Sửa công việc đã giao' : 'Giao việc'}
      description={
        editing
          ? `${editing.employee.fullName} — chỉ sửa được khi cán bộ chưa báo cáo.`
          : 'Chọn ngày bất kỳ và một hoặc nhiều cán bộ cấp dưới. Mỗi cán bộ nhận một việc riêng để báo cáo, đánh giá.'
      }
    >
      <div className="space-y-3">
        <FormError error={save.error} />
        <FormField id="dt-date" label="Ngày làm việc" required>
          <Input id="dt-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </FormField>
        {date && (
          <p className="-mt-2 text-xs text-muted-foreground">
            {weekdayName(date)}, {formatDate(date)}
          </p>
        )}
        {!editing && (
          <fieldset className="space-y-1">
            <legend className="text-sm font-medium">
              Cán bộ được giao <span className="text-destructive">*</span>
            </legend>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
              {assignees.map((a) => (
                <Label key={a.id} className="flex items-start gap-2 text-sm font-normal">
                  <Checkbox
                    checked={picked.includes(a.id)}
                    onChange={(e) => toggle(a.id, e.target.checked)}
                  />
                  <span>
                    {a.fullName}
                    <span className="text-xs text-muted-foreground">
                      {' '}
                      · {a.positionName ?? '—'} · {a.unitName ?? '—'}
                    </span>
                  </span>
                </Label>
              ))}
            </div>
          </fieldset>
        )}
        <FormField id="dt-title" label="Nội dung công việc" required>
          <Input id="dt-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </FormField>
        <FormField id="dt-desc" label="Yêu cầu, sản phẩm cần có">
          <Textarea
            id="dt-desc"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button
            disabled={save.isPending || !date || !title.trim() || (!editing && picked.length === 0)}
            onClick={() =>
              save.mutate(undefined, {
                onSuccess: () => {
                  toast.success(editing ? 'Đã sửa công việc' : 'Đã giao việc');
                  onClose();
                },
              })
            }
          >
            {editing ? 'Lưu' : 'Giao việc'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function ReportDialog({ task, onClose }: { task: DailyTaskDto; onClose: () => void }) {
  const toast = useToast();
  const [status, setStatus] = useState(task.reportStatus === 'NOT_DONE' ? 'NOT_DONE' : 'DONE');
  const [note, setNote] = useState(task.reportNote ?? '');
  const save = useDailyAction(() =>
    api.put(`/daily-tasks/${task.id}/report`, { status, note, version: task.version }),
  );
  return (
    <Dialog open onClose={onClose} title="Báo cáo kết quả" description={task.title}>
      <div className="space-y-3">
        <FormError error={save.error} />
        <FormField id="rp-status" label="Kết quả" required>
          <Select id="rp-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="DONE">{DAILY_REPORT_STATUS_LABELS.DONE}</option>
            <option value="NOT_DONE">{DAILY_REPORT_STATUS_LABELS.NOT_DONE}</option>
          </Select>
        </FormField>
        <FormField id="rp-note" label="Nội dung báo cáo (kết quả, khó khăn, đề xuất)">
          <Textarea id="rp-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button
            disabled={save.isPending}
            onClick={() =>
              save.mutate(undefined, {
                onSuccess: () => {
                  toast.success('Đã gửi báo cáo');
                  onClose();
                },
              })
            }
          >
            Gửi báo cáo
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function EvaluateDialog({ task, onClose }: { task: DailyTaskDto; onClose: () => void }) {
  const toast = useToast();
  const [result, setResult] = useState<DailyTaskResult | ''>(task.result ?? '');
  const [quality, setQuality] = useState<DailyTaskQuality | ''>(task.quality ?? '');
  const [timeliness, setTimeliness] = useState<DailyTaskTimeliness | ''>(task.timeliness ?? '');
  const [comment, setComment] = useState(task.evalComment ?? '');
  const completed = result === 'COMPLETED';
  const save = useDailyAction(() =>
    api.put(`/daily-tasks/${task.id}/evaluation`, {
      result,
      quality: completed ? quality : null,
      timeliness: completed ? timeliness : null,
      comment,
      version: task.version,
    }),
  );
  return (
    <Dialog
      open
      onClose={onClose}
      title="Đánh giá công việc"
      description={`${task.employee.fullName} — ${task.title}`}
    >
      <div className="space-y-3">
        <FormError error={save.error} />
        <p className="text-sm">
          Cán bộ báo cáo: <strong>{DAILY_REPORT_STATUS_LABELS[task.reportStatus]}</strong>
          {task.reportNote && <span className="text-muted-foreground"> — {task.reportNote}</span>}
        </p>
        <FormField id="ev-result" label="Kết quả" required>
          <Select
            id="ev-result"
            value={result}
            onChange={(e) => setResult(e.target.value as DailyTaskResult | '')}
          >
            <option value="">— Chọn —</option>
            {(['COMPLETED', 'NOT_COMPLETED'] as const).map((r) => (
              <option key={r} value={r}>
                {DAILY_TASK_RESULT_LABELS[r]}
              </option>
            ))}
          </Select>
        </FormField>
        {completed && (
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="ev-quality" label="Chất lượng" required>
              <Select
                id="ev-quality"
                value={quality}
                onChange={(e) => setQuality(e.target.value as DailyTaskQuality | '')}
              >
                <option value="">— Chọn —</option>
                {(['MEETS', 'REWORK'] as const).map((q) => (
                  <option key={q} value={q}>
                    {DAILY_TASK_QUALITY_LABELS[q]}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField id="ev-time" label="Tiến độ" required>
              <Select
                id="ev-time"
                value={timeliness}
                onChange={(e) => setTimeliness(e.target.value as DailyTaskTimeliness | '')}
              >
                <option value="">— Chọn —</option>
                {(['ON_TIME', 'LATE'] as const).map((q) => (
                  <option key={q} value={q}>
                    {DAILY_TASK_TIMELINESS_LABELS[q]}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
        )}
        <FormField id="ev-comment" label="Nhận xét">
          <Textarea
            id="ev-comment"
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </FormField>
        <p className="text-xs text-muted-foreground">
          Đánh giá hằng ngày chỉ để theo dõi, không quy ra điểm; được tổng hợp làm căn cứ khi chấm
          hồ sơ tháng, quý.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button
            disabled={save.isPending || !result || (completed && (!quality || !timeliness))}
            onClick={() =>
              save.mutate(undefined, {
                onSuccess: () => {
                  toast.success('Đã lưu đánh giá');
                  onClose();
                },
              })
            }
          >
            Lưu đánh giá
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function TaskItem({
  task,
  showEmployee,
  onAction,
}: {
  task: DailyTaskDto;
  showEmployee: boolean;
  onAction: (kind: 'edit' | 'report' | 'evaluate' | 'delete', task: DailyTaskDto) => void;
}) {
  const reportVariant =
    task.reportStatus === 'DONE'
      ? 'success'
      : task.reportStatus === 'NOT_DONE'
        ? 'warning'
        : 'outline';
  return (
    <li className="space-y-1.5 rounded-md border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">{task.title}</p>
          {showEmployee && (
            <p className="text-xs text-muted-foreground">
              {task.employee.fullName} · {task.unitName}
            </p>
          )}
          {task.description && <p className="text-sm text-muted-foreground">{task.description}</p>}
          <p className="text-xs text-muted-foreground">Người giao: {task.assignedBy ?? '—'}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {task.can.report && (
            <Button size="sm" variant="outline" onClick={() => onAction('report', task)}>
              Báo cáo
            </Button>
          )}
          {task.can.evaluate && (
            <Button size="sm" onClick={() => onAction('evaluate', task)}>
              {task.result ? 'Sửa đánh giá' : 'Đánh giá'}
            </Button>
          )}
          {task.can.edit && (
            <Button
              size="sm"
              variant="ghost"
              aria-label="Sửa công việc"
              onClick={() => onAction('edit', task)}
            >
              <Pencil className="size-4" />
            </Button>
          )}
          {task.can.delete && (
            <Button
              size="sm"
              variant="ghost"
              aria-label="Xóa công việc"
              onClick={() => onAction('delete', task)}
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-sm">
        <Badge variant={reportVariant}>{DAILY_REPORT_STATUS_LABELS[task.reportStatus]}</Badge>
        {task.reportNote && <span className="text-muted-foreground">{task.reportNote}</span>}
      </div>
      {task.result ? (
        <div className="space-y-0.5 rounded bg-muted/50 px-2 py-1.5 text-sm">
          <p>
            <strong>Đánh giá:</strong> {DAILY_TASK_RESULT_LABELS[task.result]}
            {task.quality && ` · ${DAILY_TASK_QUALITY_LABELS[task.quality]}`}
            {task.timeliness && ` · ${DAILY_TASK_TIMELINESS_LABELS[task.timeliness]}`}
            <span className="text-xs text-muted-foreground"> — {task.evaluatedBy ?? ''}</span>
          </p>
          {task.evalComment && <p className="text-muted-foreground">{task.evalComment}</p>}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Chưa đánh giá</p>
      )}
    </li>
  );
}

function Summary({ tasks }: { tasks: DailyTaskDto[] }) {
  const count = (f: (t: DailyTaskDto) => boolean) => tasks.filter(f).length;
  const items: [string, number][] = [
    ['Số việc', tasks.length],
    ['Đã báo cáo', count((t) => t.reportStatus !== 'PENDING')],
    ['Hoàn thành', count((t) => t.result === 'COMPLETED')],
    ['Chưa hoàn thành', count((t) => t.result === 'NOT_COMPLETED')],
    ['Phải làm lại', count((t) => t.quality === 'REWORK')],
    ['Chậm', count((t) => t.timeliness === 'LATE')],
    ['Chưa đánh giá', count((t) => t.result === null)],
  ];
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-lg border bg-card p-2">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="text-xl font-semibold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DailyTasksPage() {
  const can = useCan();
  const me = useMe();
  const toast = useToast();
  const today = todayIso();
  const [monday, setMonday] = useState(() => weekStart(today));
  const [employeeId, setEmployeeId] = useState('');
  const [dialog, setDialog] = useState<DialogState>(null);
  const days = weekDays(monday);
  const canAssign = can('task.assign');
  const assignees = useAssignees(canAssign);
  const tasks = useDailyTasks(days[0]!, days[6]!, employeeId || undefined);
  const remove = useDailyAction((t: DailyTaskDto) => deleteDailyTask(t));
  const leader = canAssign && (assignees.data?.length ?? 0) > 0;
  const selfId = me.data?.user.employee?.id;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Giao việc hằng ngày"
        description="Cấp trên chọn ngày bất kỳ để giao việc cho cấp dưới; cán bộ báo cáo; cấp trên đánh giá từng việc. Kết quả chỉ để theo dõi, không quy ra điểm."
      />
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            aria-label="Tuần trước"
            onClick={() => setMonday(addDaysIso(monday, -7))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setMonday(weekStart(today))}>
            Tuần này
          </Button>
          <Button
            variant="outline"
            size="sm"
            aria-label="Tuần sau"
            onClick={() => setMonday(addDaysIso(monday, 7))}
          >
            <ChevronRight className="size-4" />
          </Button>
          <span className="ml-2 text-sm font-medium">
            Tuần {shortDate(days[0]!)} – {formatDate(days[6]!)}
          </span>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dt-jump">Đến ngày</Label>
          <Input
            id="dt-jump"
            type="date"
            className="w-44"
            value=""
            onChange={(e) => e.target.value && setMonday(weekStart(e.target.value))}
          />
        </div>
        {leader && (
          <div className="space-y-1.5">
            <Label htmlFor="dt-emp">Cán bộ</Label>
            <Select
              id="dt-emp"
              className="w-72"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              <option value="">Tất cả cán bộ trong phạm vi</option>
              {selfId && <option value={selfId}>Việc của tôi</option>}
              {assignees.data?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.fullName} — {a.positionName ?? ''}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      {tasks.isPending ? (
        <LoadingState />
      ) : tasks.isError ? (
        <ErrorState error={tasks.error} onRetry={() => void tasks.refetch()} />
      ) : (
        <>
          <Summary tasks={tasks.data} />
          <div className="space-y-3">
            {days.map((d) => {
              const list = tasks.data.filter((t) => t.workDate === d);
              return (
                <Card key={d} className={cn(d === today && 'border-primary')}>
                  <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 py-3">
                    <CardTitle className="text-base">
                      {weekdayName(d)}, {formatDate(d)}
                      {d === today && (
                        <Badge variant="secondary" className="ml-2">
                          Hôm nay
                        </Badge>
                      )}
                    </CardTitle>
                    {leader && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDialog({ kind: 'create', date: d })}
                      >
                        <Plus className="size-4" /> Giao việc
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent className="pb-3">
                    {list.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Không có công việc.</p>
                    ) : (
                      <ul className="space-y-2">
                        {list.map((t) => (
                          <TaskItem
                            key={t.id}
                            task={t}
                            showEmployee={t.employee.id !== selfId}
                            onAction={(kind, task) => setDialog({ kind, task })}
                          />
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {(dialog?.kind === 'create' || dialog?.kind === 'edit') && (
        <TaskFormDialog
          state={dialog}
          assignees={assignees.data ?? []}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'report' && (
        <ReportDialog task={dialog.task} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'evaluate' && (
        <EvaluateDialog task={dialog.task} onClose={() => setDialog(null)} />
      )}
      <ConfirmDialog
        open={dialog?.kind === 'delete'}
        title="Xóa công việc đã giao"
        description="Chỉ xóa được khi cán bộ chưa báo cáo và chưa được đánh giá. Thao tác được ghi nhật ký."
        confirmLabel="Xóa"
        destructive
        pending={remove.isPending}
        error={remove.error}
        onClose={() => {
          setDialog(null);
          remove.reset();
        }}
        onConfirm={() =>
          dialog?.kind === 'delete' &&
          remove.mutate(dialog.task, {
            onSuccess: () => {
              toast.success('Đã xóa công việc');
              setDialog(null);
            },
          })
        }
      />
    </div>
  );
}
