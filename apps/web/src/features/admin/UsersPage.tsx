import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router';
import type { z } from 'zod';
import {
  USER_STATUSES,
  USER_STATUS_LABELS,
  createUserSchema,
  type CreatedUserResult,
} from '@kpi/shared';
import { PageHeader } from '@/components/common/page-header';
import { Pagination } from '@/components/common/pagination';
import { EmptyState, ErrorState, FormError, LoadingState } from '@/components/common/states';
import { useToast } from '@/components/common/toast-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormField, Input, Select } from '@/components/ui/form-controls';
import { fieldAria } from '@/components/ui/field-aria';
import { TBody, THead, Table, Td, Th, Tr } from '@/components/ui/table';
import { api } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import { applyServerErrors } from '@/lib/forms';
import { useDebounce } from '@/lib/use-debounce';
import {
  USER_STATUS_VARIANT,
  adminKeys,
  useEmployeeOptions,
  useRoles,
  useUsers,
  type UserFilters,
} from './api';
import { TemporaryPasswordNotice } from './TemporaryPasswordNotice';

type CreateIn = z.input<typeof createUserSchema>;
type CreateOut = z.output<typeof createUserSchema>;

function CreateUserForm({
  onCreated,
  onCancel,
}: {
  onCreated: (r: CreatedUserResult) => void;
  onCancel: () => void;
}) {
  const qc = useQueryClient();
  const [empTerm, setEmpTerm] = useState('');
  const q = useDebounce(empTerm.trim());
  const options = useEmployeeOptions(q, q.length >= 2);
  const form = useForm<CreateIn, unknown, CreateOut>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { username: '', displayName: '', employeeId: '', initialPassword: '' },
  });
  const { errors } = form.formState;
  const create = useMutation({
    mutationFn: (v: CreateOut) => api.post<CreatedUserResult>('/users', v),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: adminKeys.users });
      onCreated(r);
    },
    onError: (err) => applyServerErrors(err, form.setError, { employee_id: 'employeeId' }),
  });

  return (
    <form onSubmit={form.handleSubmit((v) => create.mutate(v))} className="space-y-4" noValidate>
      {create.error && <FormError error={create.error} />}
      <FormField
        id="u-username"
        label="Tên đăng nhập"
        required
        error={errors.username?.message}
        hint="Chữ thường không dấu, số và . _ -"
      >
        <Input
          {...fieldAria('u-username', errors.username?.message)}
          autoComplete="off"
          {...form.register('username')}
        />
      </FormField>
      <FormField
        id="u-employee"
        label="Gắn với hồ sơ cán bộ"
        error={errors.employeeId?.message}
        hint="Tìm theo họ tên hoặc mã. Bỏ trống nếu là tài khoản kỹ thuật (nhập tên hiển thị)."
      >
        <div className="space-y-2">
          <Input
            placeholder="Nhập ít nhất 2 ký tự để tìm..."
            value={empTerm}
            onChange={(e) => setEmpTerm(e.target.value)}
            aria-label="Tìm cán bộ"
          />
          <Select
            {...fieldAria('u-employee', errors.employeeId?.message)}
            {...form.register('employeeId')}
          >
            <option value="">— Không gắn hồ sơ cán bộ —</option>
            {(options.data ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.fullName} ({o.employeeCode}){o.unitName ? ` — ${o.unitName}` : ''}
              </option>
            ))}
          </Select>
        </div>
      </FormField>
      <FormField id="u-display" label="Tên hiển thị" error={errors.displayName?.message}>
        <Input
          {...fieldAria('u-display', errors.displayName?.message)}
          {...form.register('displayName')}
        />
      </FormField>
      <FormField
        id="u-pass"
        label="Mật khẩu ban đầu"
        error={errors.initialPassword?.message}
        hint="Để trống để hệ thống sinh mật khẩu tạm ngẫu nhiên (khuyến nghị)."
      >
        <Input
          {...fieldAria('u-pass', errors.initialPassword?.message)}
          type="password"
          autoComplete="new-password"
          {...form.register('initialPassword')}
        />
      </FormField>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Hủy
        </Button>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Đang tạo...' : 'Tạo tài khoản'}
        </Button>
      </div>
    </form>
  );
}

export function UsersPage() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [term, setTerm] = useState(params.get('q') ?? '');
  const debounced = useDebounce(term.trim());
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedUserResult | null>(null);
  const roles = useRoles();

  const filters: UserFilters = {
    q: params.get('q') ?? undefined,
    status: params.get('status') ?? undefined,
    roleCode: params.get('roleCode') ?? undefined,
    sort: params.get('sort') ?? undefined,
    page: Number(params.get('page') ?? 1) || 1,
    pageSize: Number(params.get('pageSize') ?? 20) || 20,
  };
  const update = (patch: Record<string, string | undefined>, resetPage = true) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (!v) next.delete(k);
      else next.set(k, v);
    }
    if (resetPage) next.delete('page');
    setParams(next, { replace: true });
  };
  useEffect(() => {
    if ((params.get('q') ?? '') !== debounced) update({ q: debounced || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ đồng bộ khi ô tìm kiếm thay đổi
  }, [debounced]);

  const list = useUsers(filters);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tài khoản người dùng"
        description="Tạo tài khoản, khóa/mở khóa, đặt lại mật khẩu và cấp vai trò."
        actions={
          <Button
            onClick={() => {
              setCreated(null);
              setCreating(true);
            }}
          >
            <Plus aria-hidden /> Tạo tài khoản
          </Button>
        }
      />
      <div className="grid gap-3 rounded-lg border bg-card p-3 sm:grid-cols-3">
        <div className="relative">
          <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" aria-hidden />
          <Input
            aria-label="Tìm tài khoản"
            placeholder="Tên đăng nhập, họ tên, mã cán bộ..."
            className="pl-8"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
        </div>
        <Select
          aria-label="Lọc theo trạng thái"
          value={filters.status ?? ''}
          onChange={(e) => update({ status: e.target.value })}
        >
          <option value="">Mọi trạng thái</option>
          {USER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {USER_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Lọc theo vai trò"
          value={filters.roleCode ?? ''}
          onChange={(e) => update({ roleCode: e.target.value })}
        >
          <option value="">Mọi vai trò</option>
          {(roles.data ?? []).map((r) => (
            <option key={r.id} value={r.code}>
              {r.name}
            </option>
          ))}
        </Select>
      </div>

      {list.isPending && <LoadingState />}
      {list.error && <ErrorState error={list.error} onRetry={() => void list.refetch()} />}
      {list.data?.data.length === 0 && <EmptyState title="Không có tài khoản phù hợp" />}
      {list.data && list.data.data.length > 0 && (
        <div className="space-y-3">
          <Table>
            <THead>
              <Tr>
                <Th>Tài khoản</Th>
                <Th className="hidden md:table-cell">Vai trò</Th>
                <Th>Trạng thái</Th>
                <Th className="hidden lg:table-cell">Đăng nhập gần nhất</Th>
              </Tr>
            </THead>
            <TBody>
              {list.data.data.map((u) => (
                <Tr key={u.id}>
                  <Td>
                    <Link
                      to={`/quan-tri/nguoi-dung/${u.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {u.username}
                    </Link>
                    <p className="text-xs text-muted-foreground">{u.displayName}</p>
                  </Td>
                  <Td className="hidden md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {u.roles.length === 0 && <span className="text-muted-foreground">—</span>}
                      {u.roles.map((r) => (
                        <Badge key={r.id} variant="secondary">
                          {r.roleName}
                        </Badge>
                      ))}
                    </div>
                  </Td>
                  <Td>
                    <Badge variant={USER_STATUS_VARIANT[u.status]}>
                      {USER_STATUS_LABELS[u.status]}
                    </Badge>
                    {u.lockedUntil && (
                      <p className="text-xs text-destructive">
                        Tạm khóa đến {formatDateTime(u.lockedUntil)}
                      </p>
                    )}
                  </Td>
                  <Td className="hidden lg:table-cell">{formatDateTime(u.lastLoginAt)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          <Pagination
            meta={list.data.meta}
            onPage={(p) => update({ page: String(p) }, false)}
            onPageSize={(s) => update({ pageSize: String(s) })}
          />
        </div>
      )}

      <Dialog open={creating} onClose={() => setCreating(false)} title="Tạo tài khoản" size="md">
        {creating && !created && (
          <CreateUserForm
            onCancel={() => setCreating(false)}
            onCreated={(r) => {
              toast.success(`Đã tạo tài khoản ${r.user.username}`);
              if (r.temporaryPassword) setCreated(r);
              else setCreating(false);
            }}
          />
        )}
        {created?.temporaryPassword && (
          <div className="space-y-4">
            <TemporaryPasswordNotice
              username={created.user.username}
              password={created.temporaryPassword}
            />
            <div className="flex justify-end gap-2">
              <Link
                to={`/quan-tri/nguoi-dung/${created.user.id}`}
                className="text-sm text-primary hover:underline"
              >
                Cấp vai trò cho tài khoản này →
              </Link>
              <Button onClick={() => setCreating(false)}>Đóng</Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
