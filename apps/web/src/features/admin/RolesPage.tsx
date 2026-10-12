/** Vai trò và ma trận quyền (docs/05-phan-quyen.md). */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { createRoleSchema, type PermissionCode, type RoleDto } from '@kpi/shared';
import { PageHeader } from '@/components/common/page-header';
import { ErrorState, FormError, LoadingState } from '@/components/common/states';
import { useToast } from '@/components/common/toast-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Checkbox, FormField, Input, Label, Textarea } from '@/components/ui/form-controls';
import { api } from '@/lib/api-client';
import { adminKeys, usePermissions, useRoles } from './api';

const MODULE_LABELS: Record<string, string> = {
  user: 'Tài khoản',
  role: 'Vai trò',
  setting: 'Cấu hình',
  template: 'Mẫu văn bản',
  audit: 'Nhật ký',
  org: 'Tổ chức',
  employee: 'Hồ sơ cán bộ',
  catalog: 'Danh mục SP/CV',
  criteria: 'Bộ tiêu chí',
  ruleset: 'Quy tắc tính điểm',
  period: 'Kỳ đánh giá',
  objective: 'Mục tiêu/KR',
  task: 'Nhiệm vụ',
  evidence: 'Minh chứng',
  evaluation: 'Đánh giá',
  dashboard: 'Dashboard',
  report: 'Báo cáo',
  draft: 'Dự thảo văn bản',
  notification: 'Thông báo',
};

function RoleForm({ role, onDone }: { role: RoleDto | null; onDone: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const permissions = usePermissions();
  const [code, setCode] = useState(role?.code ?? '');
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [selected, setSelected] = useState<Set<PermissionCode>>(new Set(role?.permissions ?? []));
  const [localError, setLocalError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (payload: object) =>
      role ? api.put<RoleDto>(`/roles/${role.id}`, payload) : api.post<RoleDto>('/roles', payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminKeys.roles });
      toast.success(role ? 'Đã cập nhật vai trò' : 'Đã tạo vai trò');
      onDone();
    },
  });

  const grouped = new Map<string, NonNullable<typeof permissions.data>>();
  for (const p of permissions.data ?? [])
    grouped.set(p.module, [...(grouped.get(p.module) ?? []), p]);

  const submit = () => {
    const payload = { code, name, description, permissions: [...selected] };
    const parsed = role
      ? createRoleSchema.omit({ code: true }).safeParse(payload)
      : createRoleSchema.safeParse(payload);
    if (!parsed.success) {
      setLocalError(parsed.error.issues.map((i) => i.message).join('; '));
      return;
    }
    setLocalError(null);
    save.mutate(parsed.data);
  };

  return (
    <div className="space-y-4">
      {save.error && <FormError error={save.error} />}
      {localError && <FormError error={new Error(localError)} />}
      {role?.isSystem && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm">
          Vai trò hệ thống: không xóa được; thay đổi quyền có hiệu lực ngay với {role.userCount} tài
          khoản đang giữ vai trò.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="r-code" label="Mã vai trò" required>
          <Input
            id="r-code"
            value={code}
            disabled={!!role}
            onChange={(e) => setCode(e.target.value)}
          />
        </FormField>
        <FormField id="r-name" label="Tên vai trò" required>
          <Input id="r-name" value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
      </div>
      <FormField id="r-desc" label="Mô tả">
        <Textarea
          id="r-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </FormField>
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Quyền ({selected.size})</legend>
        {permissions.isPending && <LoadingState />}
        <div className="grid gap-3 md:grid-cols-2">
          {[...grouped.entries()].map(([module, perms]) => (
            <div key={module} className="rounded-md border p-3">
              <p className="mb-2 text-sm font-semibold">{MODULE_LABELS[module] ?? module}</p>
              {perms.map((p) => (
                <Label key={p.code} className="flex items-start gap-2 py-1 font-normal">
                  <Checkbox
                    className="mt-0.5"
                    checked={selected.has(p.code)}
                    onChange={(e) =>
                      setSelected((s) => {
                        const next = new Set(s);
                        if (e.target.checked) next.add(p.code);
                        else next.delete(p.code);
                        return next;
                      })
                    }
                  />
                  <span>
                    {p.description}
                    <span className="block font-mono text-xs text-muted-foreground">{p.code}</span>
                  </span>
                </Label>
              ))}
            </div>
          ))}
        </div>
      </fieldset>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onDone}>
          Hủy
        </Button>
        <Button disabled={save.isPending} onClick={submit}>
          {save.isPending ? 'Đang lưu...' : 'Lưu'}
        </Button>
      </div>
    </div>
  );
}

export function RolesPage() {
  const roles = useRoles();
  const [editing, setEditing] = useState<RoleDto | null | 'new'>(null);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Vai trò và quyền"
        description="Quyền mặc định theo ma trận phân quyền đã thiết kế. Phạm vi dữ liệu được gán khi cấp vai trò cho từng tài khoản."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus aria-hidden /> Tạo vai trò
          </Button>
        }
      />
      {roles.isPending && <LoadingState />}
      {roles.error && <ErrorState error={roles.error} onRetry={() => void roles.refetch()} />}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {roles.data?.map((r) => (
          <Card key={r.id}>
            <CardHeader className="flex-row items-start justify-between gap-2">
              <div className="space-y-1">
                <CardTitle>{r.name}</CardTitle>
                <CardDescription className="font-mono text-xs">{r.code}</CardDescription>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Sửa ${r.name}`}
                onClick={() => setEditing(r)}
              >
                <Pencil />
              </Button>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex flex-wrap gap-2">
                {r.isSystem && <Badge variant="secondary">Hệ thống</Badge>}
                <Badge variant="outline">{r.permissions.length} quyền</Badge>
                <Badge variant="outline">{r.userCount} lượt cấp</Badge>
              </div>
              {r.description && <p className="text-muted-foreground">{r.description}</p>}
            </CardContent>
          </Card>
        ))}
      </div>
      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Tạo vai trò' : 'Sửa vai trò'}
        size="xl"
      >
        {editing !== null && (
          <RoleForm role={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />
        )}
      </Dialog>
    </div>
  );
}
