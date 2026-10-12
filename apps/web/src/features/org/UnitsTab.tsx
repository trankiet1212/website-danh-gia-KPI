import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { UNIT_TYPES, UNIT_TYPE_LABELS, createUnitSchema, type UnitDto } from '@kpi/shared';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { EmptyState, ErrorState, FormError, LoadingState } from '@/components/common/states';
import { useToast } from '@/components/common/toast-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, FormField, Input, Label, Select } from '@/components/ui/form-controls';
import { fieldAria } from '@/components/ui/field-aria';
import { TBody, THead, Table, Td, Th, Tr } from '@/components/ui/table';
import { api, errorMessage } from '@/lib/api-client';
import { applyServerErrors } from '@/lib/forms';
import { flattenUnitTree, useUnits } from './api';

type FormIn = z.input<typeof createUnitSchema>;
type FormOut = z.output<typeof createUnitSchema>;

function UnitForm({
  unit,
  units,
  onDone,
}: {
  unit: UnitDto | null;
  units: UnitDto[];
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const form = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(createUnitSchema),
    defaultValues: unit
      ? {
          code: unit.code,
          name: unit.name,
          shortName: unit.shortName ?? '',
          type: unit.type,
          parentId: unit.parentId ?? '',
          sortOrder: unit.sortOrder,
        }
      : { code: '', name: '', shortName: '', type: 'DEPARTMENT', parentId: '', sortOrder: 0 },
  });
  const { errors } = form.formState;
  const save = useMutation({
    mutationFn: (v: FormOut) =>
      unit
        ? api.patch<UnitDto>(`/org-units/${unit.id}`, {
            ...v,
            code: undefined,
            version: unit.version,
          })
        : api.post<UnitDto>('/org-units', v),
    onSuccess: () => {
      toast.success(unit ? 'Đã cập nhật đơn vị' : 'Đã thêm đơn vị');
      void qc.invalidateQueries({ queryKey: ['org', 'units'] });
      onDone();
    },
    onError: (err) => applyServerErrors(err, form.setError),
  });
  const parentOptions = flattenUnitTree(units).filter(
    (u) => u.id !== unit?.id && u.status === 'ACTIVE',
  );

  return (
    <form
      onSubmit={form.handleSubmit((v) => save.mutate({ ...v, parentId: v.parentId || null }))}
      className="space-y-4"
      noValidate
    >
      {save.error && <FormError error={save.error} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id="unit-code"
          label="Mã đơn vị"
          required
          error={errors.code?.message}
          hint={unit ? 'Không đổi được mã' : 'Ví dụ: TCCB'}
        >
          <Input
            {...fieldAria('unit-code', errors.code?.message)}
            disabled={!!unit}
            {...form.register('code')}
          />
        </FormField>
        <FormField id="unit-type" label="Loại đơn vị" required error={errors.type?.message}>
          <Select {...fieldAria('unit-type', errors.type?.message)} {...form.register('type')}>
            {UNIT_TYPES.map((t) => (
              <option key={t} value={t}>
                {UNIT_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
      <FormField id="unit-name" label="Tên đơn vị" required error={errors.name?.message}>
        <Input {...fieldAria('unit-name', errors.name?.message)} {...form.register('name')} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField
          id="unit-short"
          label="Tên viết tắt"
          error={errors.shortName?.message}
          className="sm:col-span-2"
        >
          <Input
            {...fieldAria('unit-short', errors.shortName?.message)}
            {...form.register('shortName')}
          />
        </FormField>
        <FormField id="unit-sort" label="Thứ tự" error={errors.sortOrder?.message}>
          <Input
            {...fieldAria('unit-sort', errors.sortOrder?.message)}
            type="number"
            min={0}
            {...form.register('sortOrder')}
          />
        </FormField>
      </div>
      <FormField id="unit-parent" label="Đơn vị cấp trên" error={errors.parentId?.message}>
        <Select
          {...fieldAria('unit-parent', errors.parentId?.message)}
          {...form.register('parentId')}
        >
          <option value="">— Không có (cấp cao nhất) —</option>
          {parentOptions.map((u) => (
            <option key={u.id} value={u.id}>
              {'— '.repeat(u.depth)}
              {u.name}
            </option>
          ))}
        </Select>
      </FormField>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onDone}>
          Hủy
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Đang lưu...' : 'Lưu'}
        </Button>
      </div>
    </form>
  );
}

export function UnitsTab({ canManage }: { canManage: boolean }) {
  const [showArchived, setShowArchived] = useState(false);
  const { data, isPending, error, refetch } = useUnits(showArchived);
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<UnitDto | null | 'new'>(null);
  const [archiving, setArchiving] = useState<UnitDto | null>(null);

  const toggle = useMutation({
    mutationFn: (u: UnitDto) =>
      api.post<UnitDto>(`/org-units/${u.id}/${u.status === 'ACTIVE' ? 'archive' : 'restore'}`),
    onSuccess: (u) => {
      toast.success(u.status === 'ARCHIVED' ? 'Đã lưu trữ đơn vị' : 'Đã khôi phục đơn vị');
      setArchiving(null);
      void qc.invalidateQueries({ queryKey: ['org', 'units'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="flex items-center gap-2 font-normal">
          <Checkbox checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Hiển thị cả đơn vị đã lưu trữ
        </Label>
        {canManage && (
          <Button onClick={() => setEditing('new')}>
            <Plus aria-hidden /> Thêm đơn vị
          </Button>
        )}
      </div>
      {isPending && <LoadingState />}
      {error && <ErrorState error={error} onRetry={() => void refetch()} />}
      {data && data.length === 0 && <EmptyState title="Chưa có đơn vị nào" />}
      {data && data.length > 0 && (
        <Table>
          <THead>
            <Tr>
              <Th>Tên đơn vị</Th>
              <Th className="hidden sm:table-cell">Mã</Th>
              <Th className="hidden md:table-cell">Loại</Th>
              <Th className="text-right">Cán bộ</Th>
              <Th>Trạng thái</Th>
              {canManage && <Th className="text-right">Thao tác</Th>}
            </Tr>
          </THead>
          <TBody>
            {flattenUnitTree(data).map((u) => (
              <Tr key={u.id}>
                <Td>
                  <span style={{ paddingLeft: `${u.depth * 1.25}rem` }} className="font-medium">
                    {u.name}
                  </span>
                </Td>
                <Td className="hidden font-mono text-xs sm:table-cell">{u.code}</Td>
                <Td className="hidden md:table-cell">{UNIT_TYPE_LABELS[u.type]}</Td>
                <Td className="text-right">{u.activeEmployeeCount}</Td>
                <Td>
                  <Badge variant={u.status === 'ACTIVE' ? 'success' : 'secondary'}>
                    {u.status === 'ACTIVE' ? 'Hoạt động' : 'Đã lưu trữ'}
                  </Badge>
                </Td>
                {canManage && (
                  <Td className="text-right whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Sửa ${u.name}`}
                      onClick={() => setEditing(u)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={
                        u.status === 'ACTIVE' ? `Lưu trữ ${u.name}` : `Khôi phục ${u.name}`
                      }
                      onClick={() => (u.status === 'ACTIVE' ? setArchiving(u) : toggle.mutate(u))}
                    >
                      {u.status === 'ACTIVE' ? <Archive /> : <ArchiveRestore />}
                    </Button>
                  </Td>
                )}
              </Tr>
            ))}
          </TBody>
        </Table>
      )}

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Thêm đơn vị' : 'Sửa đơn vị'}
        size="lg"
      >
        {editing !== null && data && (
          <UnitForm
            unit={editing === 'new' ? null : editing}
            units={data}
            onDone={() => setEditing(null)}
          />
        )}
      </Dialog>
      <ConfirmDialog
        open={archiving !== null}
        title={`Lưu trữ đơn vị "${archiving?.name ?? ''}"?`}
        description="Đơn vị lưu trữ không còn được chọn khi phân công. Chỉ lưu trữ được khi không còn đơn vị con và cán bộ đang công tác."
        confirmLabel="Lưu trữ"
        destructive
        pending={toggle.isPending}
        onConfirm={() => archiving && toggle.mutate(archiving)}
        onClose={() => setArchiving(null)}
      />
    </div>
  );
}
