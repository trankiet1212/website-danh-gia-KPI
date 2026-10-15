/**
 * Danh mục sản phẩm/công việc chuẩn ([HD05] Phụ lục 1): hệ số quy đổi = điểm / điểm chuẩn.
 * Mỗi người chỉ xem các mục được phân cho vị trí việc làm (VTVL) của mình; xem toàn bộ và phân danh mục
 * theo VTVL cần quyền (docs/05 "Danh mục theo vị trí việc làm").
 */
import { useState } from 'react';
import type { CatalogItemDto, CatalogVersionDto } from '@kpi/shared';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/states';
import { useToast } from '@/components/common/toast-context';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/form-controls';
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/table';
import { api } from '@/lib/api-client';
import { useCan } from '@/lib/auth';
import { useDebounce } from '@/lib/use-debounce';
import { cn } from '@/lib/utils';
import { kpiKeys, useAction, useCatalogItems, useCatalogVersions, useMyJobPosition } from './api';
import { Num, ProvisionalNotice, StatusBadge } from './components';
import { JobPositionItemsPanel } from './JobPositionItemsPanel';

type Tab = 'mine' | 'all' | 'assign';

function ItemsTable({ items }: { items: CatalogItemDto[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <Table>
        <THead>
          <Tr>
            <Th>Mã</Th>
            <Th>Sản phẩm/công việc</Th>
            <Th>Mức độ</Th>
            <Th>Thời gian tối đa</Th>
            <Th className="text-right">Điểm</Th>
            <Th className="text-right">Hệ số</Th>
          </Tr>
        </THead>
        <TBody>
          {items.map((i) => (
            <Tr key={i.id}>
              <Td className="whitespace-nowrap">{i.code}</Td>
              <Td>
                <p>{i.name}</p>
                {i.product && (
                  <p className="text-xs text-muted-foreground">Sản phẩm: {i.product}</p>
                )}
              </Td>
              <Td>{i.complexityLevel}</Td>
              <Td>{i.maxHoursText ?? '—'}</Td>
              <Td className="text-right">
                <Num value={i.points} />
              </Td>
              <Td className="text-right">
                <Num value={i.coefficient} digits={4} />
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
    </div>
  );
}

export function CatalogPage() {
  const versions = useCatalogVersions();
  const can = useCan();
  const toast = useToast();
  const myJob = useMyJobPosition();
  const [selected, setSelected] = useState<string>('');
  const [tab, setTab] = useState<Tab>('mine');
  const [q, setQ] = useState('');
  const debounced = useDebounce(q, 300);
  const current: CatalogVersionDto | undefined =
    versions.data?.find((v) => v.id === selected) ?? versions.data?.[0];
  const canViewAll =
    can('catalog.assign') || (can('catalog.approve') && current?.status === 'SUBMITTED');
  const shownTab: Tab =
    (tab === 'all' && !canViewAll) || (tab === 'assign' && !can('catalog.assign')) ? 'mine' : tab;
  const items = useCatalogItems(shownTab === 'assign' ? undefined : current?.id, debounced, {
    scope: shownTab === 'all' ? 'all' : 'mine',
  });
  const allItems = useCatalogItems(shownTab === 'assign' ? current?.id : undefined, '', {
    scope: 'all',
  });
  const [approving, setApproving] = useState(false);
  const approve = useAction(
    (a: { note: string }) =>
      api.post<CatalogVersionDto>(`/work-catalogs/versions/${current!.id}/approve`, {
        note: a.note,
        version: current!.version,
      }),
    [kpiKeys.catalogs],
  );

  if (versions.isPending) return <LoadingState />;
  if (versions.isError)
    return <ErrorState error={versions.error} onRetry={() => void versions.refetch()} />;
  if (!current) return <EmptyState title="Chưa có danh mục sản phẩm/công việc" />;

  const tabs: [Tab, string][] = [
    ['mine', 'Danh mục của tôi'],
    ...(canViewAll ? ([['all', 'Toàn bộ danh mục']] as [Tab, string][]) : []),
    ...(can('catalog.assign')
      ? ([['assign', 'Phân theo vị trí việc làm']] as [Tab, string][])
      : []),
  ];
  const job = myJob.data?.jobPosition;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Danh mục sản phẩm/công việc"
        description={`Mỗi cán bộ chỉ thấy sản phẩm/công việc phù hợp với vị trí việc làm của mình. Hệ số quy đổi = điểm sản phẩm / điểm sản phẩm chuẩn (${current.standardPoints}).`}
        actions={
          current.status === 'SUBMITTED' &&
          can('catalog.approve') && (
            <Button onClick={() => setApproving(true)}>Phê duyệt danh mục</Button>
          )
        }
      />
      {current.status !== 'APPROVED' && (
        <ProvisionalNotice>
          Danh mục chưa được phê duyệt — chỉ dùng để tính thử. Căn cứ: {current.legalBasis ?? '—'}
        </ProvisionalNotice>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="cat-version">Phiên bản</Label>
          <Select id="cat-version" value={current.id} onChange={(e) => setSelected(e.target.value)}>
            {versions.data.map((v) => (
              <option key={v.id} value={v.id}>
                {v.catalogCode} v{v.versionNo} ({v.itemCount} mục)
              </option>
            ))}
          </Select>
        </div>
        {shownTab !== 'assign' && (
          <div className="space-y-1.5">
            <Label htmlFor="cat-q">Tìm kiếm</Label>
            <Input
              id="cat-q"
              placeholder="Mã hoặc tên công việc"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-72"
            />
          </div>
        )}
        <StatusBadge kind="approval" status={current.status} />
      </div>

      {tabs.length > 1 && (
        <div role="tablist" aria-label="Chế độ xem danh mục" className="flex gap-1 border-b">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              role="tab"
              type="button"
              aria-selected={shownTab === key}
              className={cn(
                '-mb-px border-b-2 px-3 py-2 text-sm',
                shownTab === key
                  ? 'border-primary font-medium'
                  : 'border-transparent text-muted-foreground',
              )}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {shownTab === 'mine' && (
        <p className="text-sm">
          {job ? (
            <>
              Vị trí việc làm của bạn: <strong>{job.name}</strong>
            </>
          ) : myJob.isSuccess ? (
            'Tài khoản chưa gắn cán bộ hoặc chưa có vị trí việc làm — không có sản phẩm/công việc nào.'
          ) : null}
        </p>
      )}

      {shownTab === 'assign' ? (
        allItems.isPending ? (
          <LoadingState />
        ) : allItems.isError ? (
          <ErrorState error={allItems.error} />
        ) : (
          <JobPositionItemsPanel items={allItems.data} />
        )
      ) : items.isPending ? (
        <LoadingState />
      ) : items.isError ? (
        <ErrorState error={items.error} />
      ) : items.data.length === 0 ? (
        <EmptyState
          title={
            shownTab === 'mine'
              ? 'Chưa có sản phẩm/công việc nào được phân cho vị trí việc làm của bạn'
              : 'Không có mục phù hợp'
          }
        />
      ) : (
        <ItemsTable items={items.data} />
      )}
      <ConfirmDialog
        open={approving}
        title="Phê duyệt danh mục sản phẩm/công việc"
        confirmLabel="Phê duyệt"
        requireReason
        pending={approve.isPending}
        error={approve.error}
        onClose={() => setApproving(false)}
        onConfirm={(note) =>
          approve.mutate(
            { note },
            {
              onSuccess: () => {
                toast.success('Đã phê duyệt danh mục');
                setApproving(false);
              },
            },
          )
        }
      />
    </div>
  );
}
