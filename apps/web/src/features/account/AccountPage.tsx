import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Monitor, Pencil } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import {
  EMPLOYEE_STATUS_LABELS,
  GENDER_LABELS,
  SCOPE_LABELS,
  updateOwnProfileSchema,
  type OwnProfileDto,
  type SessionDto,
} from '@kpi/shared';
import { PageHeader } from '@/components/common/page-header';
import { ErrorState, FormError, LoadingState } from '@/components/common/states';
import { useToast } from '@/components/common/toast-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { fieldAria } from '@/components/ui/field-aria';
import { FormField, Input } from '@/components/ui/form-controls';
import { api, errorMessage } from '@/lib/api-client';
import { useMe } from '@/lib/auth';
import { formatDate, formatDateTime } from '@/lib/format';
import { applyServerErrors, validatePayload } from '@/lib/forms';

const profileKey = ['profile'] as const;

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words">{children || '—'}</dd>
    </>
  );
}

const infoGrid = 'grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm';

export function AccountPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const profile = useQuery({
    queryKey: profileKey,
    queryFn: () => api.get<OwnProfileDto>('/profile'),
  });
  const sessions = useQuery({
    queryKey: ['auth', 'sessions'],
    queryFn: () => api.get<SessionDto[]>('/auth/sessions'),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api.del(`/auth/sessions/${id}`),
    onSuccess: () => {
      toast.success('Đã đăng xuất phiên đã chọn');
      void qc.invalidateQueries({ queryKey: ['auth', 'sessions'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (!me) return null;
  const p = profile.data;
  const e = p?.employee ?? null;
  const cur = e?.current ?? null;
  const canEdit = (p?.editableFields.length ?? 0) > 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tài khoản của tôi"
        actions={
          <Link to="/tai-khoan/doi-mat-khau" className={buttonVariants({ variant: 'outline' })}>
            <KeyRound aria-hidden /> Đổi mật khẩu
          </Link>
        }
      />

      {profile.isPending && <LoadingState />}
      {profile.error && <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />}

      {p && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle>Thông tin cá nhân</CardTitle>
              {canEdit && (
                <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                  <Pencil aria-hidden /> Sửa thông tin liên hệ
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {e ? (
                <>
                  <dl className={infoGrid}>
                    <Info label="Mã cán bộ">
                      {e.employeeCode} {e.isDemo && <Badge variant="warning">DỮ LIỆU DEMO</Badge>}
                    </Info>
                    <Info label="Họ và tên">{e.fullName}</Info>
                    <Info label="Giới tính">{e.gender ? GENDER_LABELS[e.gender] : null}</Info>
                    <Info label="Ngày sinh">{formatDate(e.dateOfBirth)}</Info>
                    <Info label="Số điện thoại">{e.phone}</Info>
                    <Info label="Email">{e.email}</Info>
                    <Info label="Cập nhật lần cuối">{formatDateTime(e.updatedAt)}</Info>
                  </dl>
                  <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                    Bạn tự sửa được số điện thoại, email. Họ tên, giới tính, ngày sinh, chức vụ, đơn
                    vị do cán bộ phụ trách tổng hợp cập nhật — liên hệ khi cần điều chỉnh.
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Tài khoản này không gắn với hồ sơ cán bộ (tài khoản quản trị kỹ thuật).
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Thông tin công tác</CardTitle>
            </CardHeader>
            <CardContent>
              {e ? (
                <dl className={infoGrid}>
                  <Info label="Đơn vị">{cur?.unit.name}</Info>
                  <Info label="Chức vụ">{cur?.position.name}</Info>
                  <Info label="Vị trí việc làm">{cur?.jobPosition?.name}</Info>
                  <Info label="Cấp quản lý trực tiếp">{cur?.manager?.fullName}</Info>
                  <Info label="Chức vụ Đảng">{e.partyPosition}</Info>
                  <Info label="Chức vụ chính quyền">{e.govPosition}</Info>
                  <Info label="Chức vụ đoàn thể">{e.unionPosition}</Info>
                  <Info label="Ngày bắt đầu phân công">{formatDate(cur?.startDate)}</Info>
                  <Info label="Trạng thái">{EMPLOYEE_STATUS_LABELS[e.status]}</Info>
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">Không có thông tin công tác.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Thông tin tài khoản</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className={infoGrid}>
                <Info label="Tên đăng nhập">{p.account.username}</Info>
                <Info label="Ngày tạo tài khoản">{formatDateTime(p.account.createdAt)}</Info>
                <Info label="Đăng nhập gần nhất">{formatDateTime(p.account.lastLoginAt)}</Info>
                <Info label="Đổi mật khẩu gần nhất">
                  {formatDateTime(p.account.passwordChangedAt)}
                </Info>
                <Info label="Phiên hết hạn">
                  {formatDateTime(me.session.expiresAt)} (tự đăng xuất sau{' '}
                  {me.session.idleTimeoutMinutes} phút không thao tác)
                </Info>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Vai trò được cấp</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {me.roles.length === 0 && (
                <p className="text-sm text-muted-foreground">Chưa được cấp vai trò nào.</p>
              )}
              {me.roles.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant="secondary">{r.roleName}</Badge>
                  <span className="text-muted-foreground">
                    Phạm vi: {SCOPE_LABELS[r.scopeType]}
                    {r.units.length > 0 && ` (${r.units.map((u) => u.name).join(', ')})`}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Phiên đăng nhập đang hoạt động</CardTitle>
        </CardHeader>
        <CardContent>
          {sessions.isPending && <LoadingState />}
          {sessions.error && (
            <ErrorState error={sessions.error} onRetry={() => void sessions.refetch()} />
          )}
          <ul className="divide-y">
            {sessions.data?.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <Monitor className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {s.userAgent ?? 'Không rõ trình duyệt'}{' '}
                      {s.current && <Badge variant="success">Phiên hiện tại</Badge>}
                    </p>
                    <p className="text-muted-foreground">
                      IP {s.ip ?? '—'} · Đăng nhập {formatDateTime(s.createdAt)} · Hoạt động{' '}
                      {formatDateTime(s.lastSeenAt)}
                    </p>
                  </div>
                </div>
                {!s.current && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={revoke.isPending}
                    onClick={() => revoke.mutate(s.id)}
                  >
                    Đăng xuất phiên này
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {e && (
        <Dialog
          open={editing}
          onClose={() => setEditing(false)}
          title="Sửa thông tin liên hệ"
          description="Thay đổi được lưu vào hồ sơ cán bộ và ghi nhật ký."
        >
          <ContactForm employee={e} onDone={() => setEditing(false)} />
        </Dialog>
      )}
    </div>
  );
}

interface ContactValues {
  phone: string;
  email: string;
}

function ContactForm({
  employee,
  onDone,
}: {
  employee: NonNullable<OwnProfileDto['employee']>;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const form = useForm<ContactValues>({
    defaultValues: { phone: employee.phone ?? '', email: employee.email ?? '' },
  });
  const save = useMutation({
    mutationFn: (payload: unknown) => api.patch<OwnProfileDto>('/profile', payload),
    onSuccess: (updated) => {
      qc.setQueryData(profileKey, updated);
      toast.success('Đã cập nhật thông tin liên hệ');
      onDone();
    },
  });
  const onSubmit = form.handleSubmit((v) => {
    const parsed = validatePayload(
      updateOwnProfileSchema,
      { ...v, version: employee.version },
      form.setError,
    );
    if (parsed) save.mutate(parsed, { onError: (err) => applyServerErrors(err, form.setError) });
  });
  const errors = form.formState.errors;
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {save.error && <FormError error={save.error} />}
      <FormField id="c-phone" label="Số điện thoại" error={errors.phone?.message}>
        <Input
          {...fieldAria('c-phone', errors.phone?.message)}
          type="tel"
          autoComplete="tel"
          {...form.register('phone')}
        />
      </FormField>
      <FormField id="c-email" label="Email công vụ" error={errors.email?.message}>
        <Input
          {...fieldAria('c-email', errors.email?.message)}
          type="email"
          autoComplete="email"
          {...form.register('email')}
        />
      </FormField>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onDone} disabled={save.isPending}>
          Hủy
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Đang lưu...' : 'Lưu thay đổi'}
        </Button>
      </div>
    </form>
  );
}
