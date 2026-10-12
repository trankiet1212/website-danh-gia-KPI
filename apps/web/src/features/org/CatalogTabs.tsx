/** Tab Chức vụ và Vị trí việc làm. */
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import {
  JOB_POSITION_GROUPS,
  JOB_POSITION_GROUP_LABELS,
  KPI_PROFILES,
  KPI_PROFILE_LABELS,
  createJobPositionSchema,
  createPositionSchema,
  type JobPositionDto,
  type PositionDto,
} from '@kpi/shared';
import { EmptyState, ErrorState, FormError, LoadingState } from '@/components/common/states';
import { useToast } from '@/components/common/toast-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, FormField, Input, Label, Select, Textarea } from '@/components/ui/form-controls';
import { fieldAria } from '@/components/ui/field-aria';
import { TBody, THead, Table, Td, Th, Tr } from '@/components/ui/table';
import { api, errorMessage } from '@/lib/api-client';
import { applyServerErrors } from '@/lib/forms';
import { useJobPositions, usePositions } from './api';

function StatusBadge({ status }: { status: 'ACTIVE' | 'ARCHIVED' }) {
  return (
    <Badge variant={status === 'ACTIVE' ? 'success' : 'secondary'}>
      {status === 'ACTIVE' ? 'Đang dùng' : 'Đã lưu trữ'}
    </Badge>
  );
}

function useArchiveToggle(path: string, queryPrefix: string) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (item: { id: string; status: 'ACTIVE' | 'ARCHIVED' }) =>
      api.post(`/${path}/${item.id}/${item.status === 'ACTIVE' ? 'archive' : 'restore'}`),
    onSuccess: (_d, item) => {
      toast.success(item.status === 'ACTIVE' ? 'Đã lưu trữ' : 'Đã khôi phục');
      void qc.invalidateQueries({ queryKey: ['org', queryPrefix] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

// ---------------------------------------------------------------- Chức vụ
type PosIn = z.input<typeof createPositionSchema>;
type PosOut = z.output<typeof createPositionSchema>;

function PositionForm({ item, onDone }: { item: PositionDto | null; onDone: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const form = useForm<PosIn, unknown, PosOut>({
    resolver: zodResolver(createPositionSchema),
    defaultValues: item ?? {
      code: '',
      name: '',
      level: 5,
      isLeadership: false,
      kpiProfile: 'STAFF',
      sortOrder: 0,
    },
  });
  const { errors } = form.formState;
  const save = useMutation({
    mutationFn: (v: PosOut) =>
      item
        ? api.patch(`/positions/${item.id}`, { ...v, code: undefined, version: item.version })
        : api.post('/positions', v),
    onSuccess: () => {
      toast.success(item ? 'Đã cập nhật chức vụ' : 'Đã thêm chức vụ');
      void qc.invalidateQueries({ queryKey: ['org', 'positions'] });
      onDone();
    },
    onError: (err) => applyServerErrors(err, form.setError),
  });
  return (
    <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4" noValidate>
      {save.error && <FormError error={save.error} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="pos-code" label="Mã chức vụ" required error={errors.code?.message}>
          <Input
            {...fieldAria('pos-code', errors.code?.message)}
            disabled={!!item}
            {...form.register('code')}
          />
        </FormField>
        <FormField
          id="pos-level"
          label="Cấp (1 cao nhất – 5)"
          required
          error={errors.level?.message}
        >
          <Input
            {...fieldAria('pos-level', errors.level?.message)}
            type="number"
            min={1}
            max={5}
            {...form.register('level')}
          />
        </FormField>
      </div>
      <FormField id="pos-name" label="Tên chức vụ" required error={errors.name?.message}>
        <Input {...fieldAria('pos-name', errors.name?.message)} {...form.register('name')} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id="pos-profile"
          label="Nhóm đánh giá KPI"
          required
          error={errors.kpiProfile?.message}
        >
          <Select
            {...fieldAria('pos-profile', errors.kpiProfile?.message)}
            {...form.register('kpiProfile')}
          >
            {KPI_PROFILES.map((p) => (
              <option key={p} value={p}>
                {KPI_PROFILE_LABELS[p]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField id="pos-sort" label="Thứ tự" error={errors.sortOrder?.message}>
          <Input
            {...fieldAria('pos-sort', errors.sortOrder?.message)}
            type="number"
            min={0}
            {...form.register('sortOrder')}
          />
        </FormField>
      </div>
      <Label className="flex items-center gap-2 font-normal">
        <Checkbox {...form.register('isLeadership')} /> Là chức vụ lãnh đạo, quản lý
      </Label>
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

export function PositionsTab({ canManage }: { canManage: boolean }) {
  const [showArchived, setShowArchived] = useState(false);
  const { data, isPending, error, refetch } = usePositions(showArchived);
  const [editing, setEditing] = useState<PositionDto | null | 'new'>(null);
  const toggle = useArchiveToggle('positions', 'positions');
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="flex items-center gap-2 font-normal">
          <Checkbox checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />{' '}
          Hiển thị cả mục đã lưu trữ
        </Label>
        {canManage && (
          <Button onClick={() => setEditing('new')}>
            <Plus aria-hidden /> Thêm chức vụ
          </Button>
        )}
      </div>
      {isPending && <LoadingState />}
      {error && <ErrorState error={error} onRetry={() => void refetch()} />}
      {data?.length === 0 && <EmptyState title="Chưa có chức vụ" />}
      {data && data.length > 0 && (
        <Table>
          <THead>
            <Tr>
              <Th>Tên chức vụ</Th>
              <Th className="hidden sm:table-cell">Mã</Th>
              <Th>Cấp</Th>
              <Th className="hidden md:table-cell">Nhóm đánh giá</Th>
              <Th>Trạng thái</Th>
              {canManage && <Th className="text-right">Thao tác</Th>}
            </Tr>
          </THead>
          <TBody>
            {data.map((p) => (
              <Tr key={p.id}>
                <Td className="font-medium">{p.name}</Td>
                <Td className="hidden font-mono text-xs sm:table-cell">{p.code}</Td>
                <Td>{p.level}</Td>
                <Td className="hidden md:table-cell">{KPI_PROFILE_LABELS[p.kpiProfile]}</Td>
                <Td>
                  <StatusBadge status={p.status} />
                </Td>
                {canManage && (
                  <Td className="text-right whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Sửa ${p.name}`}
                      onClick={() => setEditing(p)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={
                        p.status === 'ACTIVE' ? `Lưu trữ ${p.name}` : `Khôi phục ${p.name}`
                      }
                      disabled={toggle.isPending}
                      onClick={() => toggle.mutate(p)}
                    >
                      {p.status === 'ACTIVE' ? <Archive /> : <ArchiveRestore />}
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
        title={editing === 'new' ? 'Thêm chức vụ' : 'Sửa chức vụ'}
      >
        {editing !== null && (
          <PositionForm item={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />
        )}
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------- Vị trí việc làm
type JobIn = z.input<typeof createJobPositionSchema>;
type JobOut = z.output<typeof createJobPositionSchema>;

function JobPositionForm({ item, onDone }: { item: JobPositionDto | null; onDone: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const form = useForm<JobIn, unknown, JobOut>({
    resolver: zodResolver(createJobPositionSchema),
    defaultValues: item
      ? { code: item.code, name: item.name, group: item.group, description: item.description ?? '' }
      : { code: '', name: '', group: 'PROFESSIONAL', description: '' },
  });
  const { errors } = form.formState;
  const save = useMutation({
    mutationFn: (v: JobOut) =>
      item
        ? api.patch(`/job-positions/${item.id}`, { ...v, code: undefined, version: item.version })
        : api.post('/job-positions', v),
    onSuccess: () => {
      toast.success(item ? 'Đã cập nhật vị trí việc làm' : 'Đã thêm vị trí việc làm');
      void qc.invalidateQueries({ queryKey: ['org', 'job-positions'] });
      onDone();
    },
    onError: (err) => applyServerErrors(err, form.setError),
  });
  return (
    <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4" noValidate>
      {save.error && <FormError error={save.error} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="job-code" label="Mã VTVL" required error={errors.code?.message}>
          <Input
            {...fieldAria('job-code', errors.code?.message)}
            disabled={!!item}
            {...form.register('code')}
          />
        </FormField>
        <FormField id="job-group" label="Nhóm" required error={errors.group?.message}>
          <Select {...fieldAria('job-group', errors.group?.message)} {...form.register('group')}>
            {JOB_POSITION_GROUPS.map((g) => (
              <option key={g} value={g}>
                {JOB_POSITION_GROUP_LABELS[g]}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
      <FormField id="job-name" label="Tên vị trí việc làm" required error={errors.name?.message}>
        <Input {...fieldAria('job-name', errors.name?.message)} {...form.register('name')} />
      </FormField>
      <FormField id="job-desc" label="Mô tả" error={errors.description?.message}>
        <Textarea
          {...fieldAria('job-desc', errors.description?.message)}
          {...form.register('description')}
        />
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

export function JobPositionsTab({ canManage }: { canManage: boolean }) {
  const [showArchived, setShowArchived] = useState(false);
  const { data, isPending, error, refetch } = useJobPositions(showArchived);
  const [editing, setEditing] = useState<JobPositionDto | null | 'new'>(null);
  const toggle = useArchiveToggle('job-positions', 'job-positions');
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="flex items-center gap-2 font-normal">
          <Checkbox checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />{' '}
          Hiển thị cả mục đã lưu trữ
        </Label>
        {canManage && (
          <Button onClick={() => setEditing('new')}>
            <Plus aria-hidden /> Thêm vị trí việc làm
          </Button>
        )}
      </div>
      {data?.some((j) => j.isProvisional) && (
        <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          Một số vị trí việc làm là <strong>danh mục tạm</strong> (chưa có danh mục VTVL chính thức
          được phê duyệt).
        </p>
      )}
      {isPending && <LoadingState />}
      {error && <ErrorState error={error} onRetry={() => void refetch()} />}
      {data?.length === 0 && <EmptyState title="Chưa có vị trí việc làm" />}
      {data && data.length > 0 && (
        <Table>
          <THead>
            <Tr>
              <Th>Tên vị trí việc làm</Th>
              <Th className="hidden sm:table-cell">Mã</Th>
              <Th className="hidden md:table-cell">Nhóm</Th>
              <Th>Trạng thái</Th>
              {canManage && <Th className="text-right">Thao tác</Th>}
            </Tr>
          </THead>
          <TBody>
            {data.map((j) => (
              <Tr key={j.id}>
                <Td className="font-medium">
                  {j.name} {j.isProvisional && <Badge variant="warning">Tạm</Badge>}
                </Td>
                <Td className="hidden font-mono text-xs sm:table-cell">{j.code}</Td>
                <Td className="hidden md:table-cell">{JOB_POSITION_GROUP_LABELS[j.group]}</Td>
                <Td>
                  <StatusBadge status={j.status} />
                </Td>
                {canManage && (
                  <Td className="text-right whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Sửa ${j.name}`}
                      onClick={() => setEditing(j)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={
                        j.status === 'ACTIVE' ? `Lưu trữ ${j.name}` : `Khôi phục ${j.name}`
                      }
                      disabled={toggle.isPending}
                      onClick={() => toggle.mutate(j)}
                    >
                      {j.status === 'ACTIVE' ? <Archive /> : <ArchiveRestore />}
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
        title={editing === 'new' ? 'Thêm vị trí việc làm' : 'Sửa vị trí việc làm'}
      >
        {editing !== null && (
          <JobPositionForm
            item={editing === 'new' ? null : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </Dialog>
    </div>
  );
}
