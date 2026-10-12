/** Danh mục sản phẩm/công việc chuẩn ([HD05] Phụ lục 1): hệ số quy đổi = điểm / điểm chuẩn. */
import { useState } from 'react';
import type { CatalogVersionDto } from '@kpi/shared';
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
import { kpiKeys, useAction, useCatalogItems, useCatalogVersions } from './api';
import { Num, ProvisionalNotice, StatusBadge } from './components';

export function CatalogPage() {
  const versions = useCatalogVersions();
  const can = useCan();
  const toast = useToast();
  const [selected, setSelected] = useState<string>('');
  const [q, setQ] = useState('');
  const debounced = useDebounce(q, 300);
  const current: CatalogVersionDto | undefined =
    versions.data?.find((v) => v.id === selected) ?? versions.data?.[0];
  const items = useCatalogItems(current?.id, debounced);
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

  return (
    <div className="space-y-4">
      <PageHeader
        title="Danh mục sản phẩm/công việc"
        description={`Hệ số quy đổi = điểm sản phẩm / điểm sản phẩm chuẩn (${current.standardPoints}).`}
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
        <StatusBadge kind="approval" status={current.status} />
      </div>
      {items.isPending ? (
        <LoadingState />
      ) : items.isError ? (
        <ErrorState error={items.error} />
      ) : items.data.length === 0 ? (
        <EmptyState title="Không có mục phù hợp" />
      ) : (
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
              {items.data.map((i) => (
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
