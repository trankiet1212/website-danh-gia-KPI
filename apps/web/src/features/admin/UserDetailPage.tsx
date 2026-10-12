import { useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Lock, LogOut, Trash2, Unlock, UserMinus } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  SCOPE_LABELS,
  SCOPE_TYPES,
  USER_STATUS_LABELS,
  grantRoleSchema,
  type CreatedUserResult,
  type RoleGrantDto,
  type ScopeType,
  type UserListItem,
} from '@kpi/shared';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { PageHeader } from '@/components/common/page-header';
import { ErrorState, FormError, LoadingState } from '@/components/common/states';
import { useToast } from '@/components/common/toast-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, FormField, Label, Select } from '@/components/ui/form-controls';
import { flattenUnitTree, useUnits } from '@/features/org/api';
import { api, errorMessage } from '@/lib/api-client';
import { useCan, useMe } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { USER_STATUS_VARIANT, adminKeys, useRoles, useUser } from './api';
import { TemporaryPasswordNotice } from './TemporaryPasswordNotice';

type Action = 'lock' | 'disable' | 'unlock' | 'reset' | 'revoke-sessions' | null;

function GrantRoleForm({ user, onDone }: { user: UserListItem; onDone: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const roles = useRoles();
  const units = useUnits();
  const [roleId, setRoleId] = useState('');
  const [scopeType, setScopeType] = useState<ScopeType>('OWN_UNIT');
  const [unitIds, setUnitIds] = useState<string[]>([]);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const grant = useMutation({
    mutationFn: (payload: unknown) => api.post<UserListItem>(`/users/${user.id}/roles`, payload),
    onSuccess: (u) => {
      qc.setQueryData(adminKeys.user(user.id), u);
      void qc.invalidateQueries({ queryKey: adminKeys.users });
      toast.success('Đã cấp vai trò');
      onDone();
    },
  });
  const needsEmployee = ['OWN_UNIT', 'MANAGED', 'SELF'].includes(scopeType) && !user.employee;

  const submit = () => {
    const parsed = grantRoleSchema.safeParse({
      roleId,
      scopeType,
      unitIds: scopeType === 'UNITS' ? unitIds : [],
    });
    if (!parsed.success) {
      setFieldError(parsed.error.issues.map((i) => i.message).join('; '));
      return;
    }
    setFieldError(null);
    grant.mutate(parsed.data);
  };

  return (
    <div className="space-y-4">
      {grant.error && <FormError error={grant.error} />}
      {fieldError && <FormError error={new Error(fieldError)} />}
      <FormField id="g-role" label="Vai trò" required>
        <Select id="g-role" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
          <option value="">— Chọn vai trò —</option>
          {(roles.data ?? []).map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField
        id="g-scope"
        label="Phạm vi dữ liệu"
        required
        hint={
          needsEmployee
            ? 'Phạm vi này cần tài khoản gắn với hồ sơ cán bộ.'
            : 'Giới hạn dữ liệu nghiệp vụ mà vai trò được thao tác.'
        }
      >
        <Select
          id="g-scope"
          value={scopeType}
          onChange={(e) => setScopeType(e.target.value as ScopeType)}
        >
          {SCOPE_TYPES.map((s) => (
            <option key={s} value={s}>
              {SCOPE_LABELS[s]}
            </option>
          ))}
        </Select>
      </FormField>
      {scopeType === 'UNITS' && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Các đơn vị được phân công</legend>
          <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
            {flattenUnitTree(units.data ?? []).map((u) => (
              <Label
                key={u.id}
                className="flex items-center gap-2 py-1 font-normal"
                style={{ paddingLeft: `${u.depth}rem` }}
              >
                <Checkbox
                  checked={unitIds.includes(u.id)}
                  onChange={(e) =>
                    setUnitIds((ids) =>
                      e.target.checked ? [...ids, u.id] : ids.filter((x) => x !== u.id),
                    )
                  }
                />
                {u.name}
              </Label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onDone}>
          Hủy
        </Button>
        <Button disabled={grant.isPending || !roleId} onClick={submit}>
          {grant.isPending ? 'Đang cấp...' : 'Cấp vai trò'}
        </Button>
      </div>
    </div>
  );
}

export function UserDetailPage() {
  const { id = '' } = useParams();
  const { data: user, isPending, error, refetch } = useUser(id);
  const { data: me } = useMe();
  const can = useCan();
  const qc = useQueryClient();
  const toast = useToast();
  const [action, setAction] = useState<Action>(null);
  const [granting, setGranting] = useState(false);
  const [revoking, setRevoking] = useState<RoleGrantDto | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const refresh = (u?: UserListItem) => {
    if (u) qc.setQueryData(adminKeys.user(id), u);
    void qc.invalidateQueries({ queryKey: adminKeys.users });
  };

  const run = useMutation({
    mutationFn: async ({ kind, reason }: { kind: Exclude<Action, null>; reason: string }) => {
      if (kind === 'lock' || kind === 'disable')
        return api.post<UserListItem>(`/users/${id}/${kind}`, { reason });
      if (kind === 'unlock') return api.post<UserListItem>(`/users/${id}/unlock`);
      if (kind === 'reset') return api.post<CreatedUserResult>(`/users/${id}/reset-password`);
      return api.post<{ revoked: number }>(`/users/${id}/revoke-sessions`);
    },
    onSuccess: (result, { kind }) => {
      setAction(null);
      if (kind === 'reset') {
        const r = result as CreatedUserResult;
        refresh(r.user);
        setTempPassword(r.temporaryPassword);
        toast.success('Đã đặt lại mật khẩu');
      } else if (kind === 'revoke-sessions') {
        toast.success(`Đã đăng xuất ${(result as { revoked: number }).revoked} phiên`);
      } else {
        refresh(result as UserListItem);
        toast.success('Đã cập nhật trạng thái tài khoản');
      }
    },
  });

  const revoke = useMutation({
    mutationFn: (grantId: string) => api.del<UserListItem>(`/users/${id}/roles/${grantId}`),
    onSuccess: (u) => {
      refresh(u);
      setRevoking(null);
      toast.success('Đã thu hồi vai trò');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (isPending) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;
  const isSelf = me?.user.id === user.id;
  const canGrant = can('role.manage');

  const ACTIONS: Record<
    Exclude<Action, null>,
    { title: string; description: string; reason: boolean; destructive?: boolean; label: string }
  > = {
    lock: {
      title: 'Khóa tài khoản?',
      description: 'Người dùng bị đăng xuất ngay và không đăng nhập được cho đến khi mở khóa.',
      reason: true,
      destructive: true,
      label: 'Khóa',
    },
    disable: {
      title: 'Ngừng sử dụng tài khoản?',
      description: 'Dùng khi cán bộ chuyển công tác/nghỉ việc. Người dùng bị đăng xuất ngay.',
      reason: true,
      destructive: true,
      label: 'Ngừng sử dụng',
    },
    unlock: {
      title: 'Mở khóa tài khoản?',
      description: 'Tài khoản hoạt động trở lại, xóa trạng thái khóa tạm do đăng nhập sai.',
      reason: false,
      label: 'Mở khóa',
    },
    reset: {
      title: 'Đặt lại mật khẩu?',
      description:
        'Hệ thống sinh mật khẩu tạm mới, đăng xuất mọi phiên; người dùng phải đổi mật khẩu khi đăng nhập.',
      reason: false,
      destructive: true,
      label: 'Đặt lại',
    },
    'revoke-sessions': {
      title: 'Đăng xuất mọi phiên?',
      description: 'Mọi thiết bị đang đăng nhập bằng tài khoản này sẽ bị đăng xuất.',
      reason: false,
      label: 'Đăng xuất tất cả',
    },
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={user.username}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {user.displayName}
            <Badge variant={USER_STATUS_VARIANT[user.status]}>
              {USER_STATUS_LABELS[user.status]}
            </Badge>
            {user.mustChangePassword && <Badge variant="warning">Chờ đổi mật khẩu</Badge>}
            {isSelf && <Badge variant="outline">Tài khoản của bạn</Badge>}
          </span>
        }
        actions={
          <>
            {user.status === 'ACTIVE' && !user.lockedUntil ? (
              <>
                <Button variant="outline" disabled={isSelf} onClick={() => setAction('lock')}>
                  <Lock aria-hidden /> Khóa
                </Button>
                <Button variant="outline" disabled={isSelf} onClick={() => setAction('disable')}>
                  <UserMinus aria-hidden /> Ngừng sử dụng
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => setAction('unlock')}>
                <Unlock aria-hidden /> Mở khóa
              </Button>
            )}
            <Button variant="outline" onClick={() => setAction('reset')}>
              <KeyRound aria-hidden /> Đặt lại mật khẩu
            </Button>
            <Button variant="outline" onClick={() => setAction('revoke-sessions')}>
              <LogOut aria-hidden /> Đăng xuất mọi phiên
            </Button>
          </>
        }
      />

      {tempPassword && <TemporaryPasswordNotice username={user.username} password={tempPassword} />}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Thông tin tài khoản</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Hồ sơ cán bộ</dt>
              <dd>
                {user.employee ? (
                  can('employee.read') ? (
                    <Link
                      to={`/can-bo/${user.employee.id}`}
                      className="text-primary hover:underline"
                    >
                      {user.employee.fullName} ({user.employee.employeeCode})
                    </Link>
                  ) : (
                    `${user.employee.fullName} (${user.employee.employeeCode})`
                  )
                ) : (
                  'Không gắn (tài khoản kỹ thuật)'
                )}
              </dd>
              <dt className="text-muted-foreground">Tạo lúc</dt>
              <dd>{formatDateTime(user.createdAt)}</dd>
              <dt className="text-muted-foreground">Đăng nhập gần nhất</dt>
              <dd>{formatDateTime(user.lastLoginAt)}</dd>
              {user.lockedUntil && (
                <>
                  <dt className="text-muted-foreground">Tạm khóa đến</dt>
                  <dd className="text-destructive">{formatDateTime(user.lockedUntil)}</dd>
                </>
              )}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Vai trò và phạm vi dữ liệu</CardTitle>
            {canGrant && (
              <Button size="sm" onClick={() => setGranting(true)}>
                Cấp vai trò
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {user.roles.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Chưa được cấp vai trò — tài khoản chưa dùng được chức năng nghiệp vụ.
              </p>
            )}
            <ul className="divide-y">
              {user.roles.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                  <div>
                    <p className="font-medium">{r.roleName}</p>
                    <p className="text-muted-foreground">
                      {SCOPE_LABELS[r.scopeType]}
                      {r.units.length > 0 && `: ${r.units.map((u) => u.name).join(', ')}`}
                    </p>
                  </div>
                  {canGrant && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Thu hồi vai trò ${r.roleName}`}
                      onClick={() => setRevoking(r)}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {action && (
        <ConfirmDialog
          open
          title={ACTIONS[action].title}
          description={ACTIONS[action].description}
          confirmLabel={ACTIONS[action].label}
          destructive={ACTIONS[action].destructive}
          requireReason={ACTIONS[action].reason}
          pending={run.isPending}
          error={run.error}
          onConfirm={(reason) => run.mutate({ kind: action, reason })}
          onClose={() => {
            run.reset();
            setAction(null);
          }}
        />
      )}
      <ConfirmDialog
        open={revoking !== null}
        title={`Thu hồi vai trò "${revoking?.roleName ?? ''}"?`}
        confirmLabel="Thu hồi"
        destructive
        pending={revoke.isPending}
        onConfirm={() => revoking && revoke.mutate(revoking.id)}
        onClose={() => setRevoking(null)}
      />
      <Dialog
        open={granting}
        onClose={() => setGranting(false)}
        title="Cấp vai trò"
        description={user.username}
      >
        {granting && <GrantRoleForm user={user} onDone={() => setGranting(false)} />}
      </Dialog>
    </div>
  );
}
