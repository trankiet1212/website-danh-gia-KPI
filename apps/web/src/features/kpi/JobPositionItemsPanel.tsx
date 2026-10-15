/**
 * Phân danh mục sản phẩm/công việc cho từng vị trí việc làm (quyền catalog.assign — docs/05).
 * Mỗi cán bộ chỉ xem, chọn được các mục đã phân cho VTVL của mình.
 */
import { useState } from 'react';
import type { CatalogItemDto, JobPositionWorkItemsDto } from '@kpi/shared';
import { JOB_POSITION_GROUP_LABELS, type JobPositionGroup } from '@kpi/shared';
import { EmptyState, ErrorState, FormError, LoadingState } from '@/components/common/states';
import { useToast } from '@/components/common/toast-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox, Label } from '@/components/ui/form-controls';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { kpiKeys, useAction, useJobPositionItems } from './api';
import { ProvisionalNotice } from './components';

/** Tiêu đề nhóm theo file nguồn "Danh mục công việc của BTCTU". */
const GROUP_LABELS: Record<string, string> = {
  A: 'Nhóm A — Lãnh đạo, quản lý',
  B: 'Nhóm B — Chuyên môn dùng chung (văn thư, hành chính, tài chính nội bộ)',
  C: 'Nhóm C — Chuyên môn, nghiệp vụ',
  D: 'Nhóm D — Công việc khác',
};

function Editor({ job, items }: { job: JobPositionWorkItemsDto; items: CatalogItemDto[] }) {
  const toast = useToast();
  const [codes, setCodes] = useState(() => new Set(job.itemCodes));
  const save = useAction(
    () =>
      api.put<JobPositionWorkItemsDto>(`/work-catalogs/job-positions/${job.jobPosition.id}/items`, {
        itemCodes: [...codes],
      }),
    [kpiKeys.jobPositionItems, ['work-catalog-items']],
  );
  const groups = [...new Set(items.map((i) => i.groupCode))];
  const toggle = (code: string, on: boolean) =>
    setCodes((prev) => {
      const next = new Set(prev);
      if (on) next.add(code);
      else next.delete(code);
      return next;
    });
  const setGroup = (g: string, on: boolean) =>
    setCodes((prev) => {
      const next = new Set(prev);
      for (const i of items.filter((x) => x.groupCode === g)) {
        if (on) next.add(i.code);
        else next.delete(i.code);
      }
      return next;
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{job.jobPosition.name}</p>
          <p className="text-xs text-muted-foreground">
            {JOB_POSITION_GROUP_LABELS[job.jobPosition.group as JobPositionGroup] ??
              job.jobPosition.group}{' '}
            · {job.employeeCount} cán bộ · đã chọn {codes.size}/{items.length} mục
          </p>
        </div>
        <Button
          disabled={save.isPending}
          onClick={() =>
            save.mutate(undefined, {
              onSuccess: () => toast.success(`Đã lưu danh mục cho ${job.jobPosition.name}`),
            })
          }
        >
          Lưu phân danh mục
        </Button>
      </div>
      <FormError error={save.error} />
      {groups.map((g) => {
        const list = items.filter((i) => i.groupCode === g);
        const all = list.every((i) => codes.has(i.code));
        return (
          <fieldset key={g} className="space-y-1 rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">{GROUP_LABELS[g] ?? `Nhóm ${g}`}</legend>
            <Label className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
              <Checkbox checked={all} onChange={(e) => setGroup(g, e.target.checked)} />
              Chọn cả nhóm
            </Label>
            {list.map((i) => (
              <Label key={i.id} className="flex items-start gap-2 text-sm font-normal">
                <Checkbox
                  checked={codes.has(i.code)}
                  onChange={(e) => toggle(i.code, e.target.checked)}
                />
                <span>
                  <strong>{i.code}</strong> {i.name}
                </span>
              </Label>
            ))}
          </fieldset>
        );
      })}
    </div>
  );
}

export function JobPositionItemsPanel({ items }: { items: CatalogItemDto[] }) {
  const jobs = useJobPositionItems(true);
  const [selected, setSelected] = useState('');
  if (jobs.isPending) return <LoadingState />;
  if (jobs.isError) return <ErrorState error={jobs.error} onRetry={() => void jobs.refetch()} />;
  if (jobs.data.length === 0) return <EmptyState title="Chưa có vị trí việc làm" />;
  const current = jobs.data.find((j) => j.jobPosition.id === selected) ?? jobs.data[0]!;

  return (
    <div className="space-y-3">
      <ProvisionalNotice>
        Phân mặc định theo tiêu đề nhóm của file danh mục nguồn (nhóm A cho lãnh đạo, quản lý; B cho
        chuyên môn dùng chung; C cho chuyên môn, nghiệp vụ; D cho mọi vị trí). Một số điểm là suy
        luận, chờ cơ quan xác nhận — hãy rà soát và chỉnh lại cho đúng từng vị trí.
      </ProvisionalNotice>
      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        <ul className="space-y-1" aria-label="Vị trí việc làm">
          {jobs.data.map((j) => (
            <li key={j.jobPosition.id}>
              <button
                type="button"
                className={cn(
                  'w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-muted',
                  j.jobPosition.id === current.jobPosition.id && 'border-primary bg-muted',
                )}
                onClick={() => setSelected(j.jobPosition.id)}
              >
                <span className="block font-medium">{j.jobPosition.name}</span>
                <span className="text-xs text-muted-foreground">
                  {j.employeeCount} cán bộ ·{' '}
                  {j.itemCodes.length === 0 ? (
                    <Badge variant="warning">chưa phân</Badge>
                  ) : (
                    `${j.itemCodes.length} mục`
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <Editor key={current.jobPosition.id} job={current} items={items} />
      </div>
    </div>
  );
}
