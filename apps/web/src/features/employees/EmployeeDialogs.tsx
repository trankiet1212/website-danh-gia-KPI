/** Hộp thoại sửa thông tin, điều chuyển và kết thúc công tác cho hồ sơ cán bộ. */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import {
  archiveEmployeeSchema,
  EMPLOYEE_STATUS_LABELS,
  transferEmployeeSchema,
  updateEmployeeSchema,
  type EmployeeDetail,
} from '@kpi/shared';
import { FormError } from '@/components/common/states';
import { useToast } from '@/components/common/toast-context';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormField, Input, Select, Textarea } from '@/components/ui/form-controls';
import { fieldAria } from '@/components/ui/field-aria';
import { api } from '@/lib/api-client';
import { todayIso } from '@/lib/format';
import { applyServerErrors, validatePayload } from '@/lib/forms';
import { employeeKeys } from './api';
import { AssignmentFields } from './AssignmentFields';
import { ProfileFields } from './ProfileFields';
import {
  toAssignmentPayload,
  type AssignmentFormValues,
  type ProfileFormValues,
} from './form-values';

function useSaveEmployee(
  employee: EmployeeDetail,
  path: string,
  successMessage: string,
  onDone: () => void,
) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (payload: unknown) =>
      path === ''
        ? api.patch<EmployeeDetail>(`/employees/${employee.id}`, payload)
        : api.post<EmployeeDetail>(`/employees/${employee.id}/${path}`, payload),
    onSuccess: (updated) => {
      qc.setQueryData(employeeKeys.detail(employee.id), updated);
      void qc.invalidateQueries({ queryKey: ['employees', 'list'] });
      toast.success(successMessage);
      onDone();
    },
  });
}

function Actions({
  pending,
  onCancel,
  label,
}: {
  pending: boolean;
  onCancel: () => void;
  label: string;
}) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <Button variant="outline" onClick={onCancel} disabled={pending}>
        Hủy
      </Button>
      <Button type="submit" disabled={pending}>
        {pending ? 'Đang lưu...' : label}
      </Button>
    </div>
  );
}

// ------------------------------------------------------------ Sửa thông tin cá nhân
function EditForm({ employee, onDone }: { employee: EmployeeDetail; onDone: () => void }) {
  const form = useForm<ProfileFormValues>({
    defaultValues: {
      fullName: employee.fullName,
      gender: employee.gender ?? '',
      dateOfBirth: employee.dateOfBirth ?? '',
      email: employee.email ?? '',
      phone: employee.phone ?? '',
      partyPosition: employee.partyPosition ?? '',
      govPosition: employee.govPosition ?? '',
      unionPosition: employee.unionPosition ?? '',
    },
  });
  const save = useSaveEmployee(employee, '', 'Đã cập nhật thông tin cán bộ', onDone);
  const onSubmit = form.handleSubmit((v) => {
    const parsed = validatePayload(
      updateEmployeeSchema,
      { ...v, version: employee.version },
      form.setError,
    );
    if (parsed) save.mutate(parsed, { onError: (err) => applyServerErrors(err, form.setError) });
  });
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {save.error && <FormError error={save.error} />}
      <ProfileFields register={form.register} errors={form.formState.errors} />
      <Actions pending={save.isPending} onCancel={onDone} label="Lưu thay đổi" />
    </form>
  );
}

// ------------------------------------------------------------ Điều chuyển
const TRANSFER_RENAME = { managerEmployeeId: 'manager' };

function TransferForm({ employee, onDone }: { employee: EmployeeDetail; onDone: () => void }) {
  const current = employee.current;
  const form = useForm<AssignmentFormValues & { note: string }>({
    defaultValues: {
      unitId: current?.unit.id ?? '',
      positionId: current?.position.id ?? '',
      jobPositionId: current?.jobPosition?.id ?? '',
      manager: current?.manager
        ? {
            id: current.manager.id,
            label: `${current.manager.fullName} (${current.manager.employeeCode})`,
          }
        : null,
      startDate: todayIso(),
      duties: current?.duties ?? '',
      decisionRef: '',
      note: '',
    },
  });
  const save = useSaveEmployee(employee, 'transfer', 'Đã điều chuyển cán bộ', onDone);
  const onSubmit = form.handleSubmit((v) => {
    const payload = { ...toAssignmentPayload(v), note: v.note, version: employee.version };
    const parsed = validatePayload(transferEmployeeSchema, payload, form.setError, TRANSFER_RENAME);
    if (parsed)
      save.mutate(parsed, {
        onError: (err) => applyServerErrors(err, form.setError, TRANSFER_RENAME),
      });
  });
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <p className="rounded-md bg-muted px-3 py-2 text-sm">
        Phân công hiện tại sẽ kết thúc vào ngày trước ngày bắt đầu mới và được lưu vào lịch sử.
      </p>
      {save.error && <FormError error={save.error} />}
      <AssignmentFields
        prefix=""
        register={form.register}
        control={form.control}
        errors={form.formState.errors}
        excludeEmployeeId={employee.id}
      />
      <FormField id="transfer-note" label="Ghi chú" error={form.formState.errors.note?.message}>
        <Textarea
          {...fieldAria('transfer-note', form.formState.errors.note?.message)}
          {...form.register('note')}
        />
      </FormField>
      <Actions pending={save.isPending} onCancel={onDone} label="Điều chuyển" />
    </form>
  );
}

// ------------------------------------------------------------ Kết thúc công tác
interface EndValues {
  status: 'TRANSFERRED' | 'RETIRED' | 'ARCHIVED';
  endDate: string;
  reason: string;
}

function EndEmploymentForm({ employee, onDone }: { employee: EmployeeDetail; onDone: () => void }) {
  const form = useForm<EndValues>({
    defaultValues: { status: 'TRANSFERRED', endDate: todayIso(), reason: '' },
  });
  const { errors } = form.formState;
  const save = useSaveEmployee(
    employee,
    'end-employment',
    'Đã cập nhật trạng thái công tác',
    onDone,
  );
  const onSubmit = form.handleSubmit((v) => {
    const parsed = validatePayload(
      archiveEmployeeSchema,
      { ...v, version: employee.version },
      form.setError,
    );
    if (parsed) save.mutate(parsed, { onError: (err) => applyServerErrors(err, form.setError) });
  });
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
        Hồ sơ không bị xóa: phân công hiện tại được đóng, tài khoản đăng nhập liên kết (nếu có) bị
        ngừng sử dụng.
      </p>
      {save.error && <FormError error={save.error} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="end-status" label="Trạng thái mới" required error={errors.status?.message}>
          <Select {...fieldAria('end-status', errors.status?.message)} {...form.register('status')}>
            {(['TRANSFERRED', 'RETIRED', 'ARCHIVED'] as const).map((s) => (
              <option key={s} value={s}>
                {EMPLOYEE_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField id="end-date" label="Ngày kết thúc" required error={errors.endDate?.message}>
          <Input
            {...fieldAria('end-date', errors.endDate?.message)}
            type="date"
            {...form.register('endDate')}
          />
        </FormField>
      </div>
      <FormField id="end-reason" label="Lý do / căn cứ" required error={errors.reason?.message}>
        <Textarea
          {...fieldAria('end-reason', errors.reason?.message)}
          {...form.register('reason')}
        />
      </FormField>
      <Actions pending={save.isPending} onCancel={onDone} label="Xác nhận" />
    </form>
  );
}

export type EmployeeDialogKind = 'edit' | 'transfer' | 'end' | null;

export function EmployeeDialogs({
  employee,
  kind,
  onClose,
}: {
  employee: EmployeeDetail;
  kind: EmployeeDialogKind;
  onClose: () => void;
}) {
  return (
    <>
      <Dialog open={kind === 'edit'} onClose={onClose} title="Sửa thông tin cá nhân" size="lg">
        {kind === 'edit' && <EditForm employee={employee} onDone={onClose} />}
      </Dialog>
      <Dialog
        open={kind === 'transfer'}
        onClose={onClose}
        title="Điều chuyển / thay đổi phân công"
        size="lg"
      >
        {kind === 'transfer' && <TransferForm employee={employee} onDone={onClose} />}
      </Dialog>
      <Dialog
        open={kind === 'end'}
        onClose={onClose}
        title="Kết thúc công tác"
        description={employee.fullName}
        size="md"
      >
        {kind === 'end' && <EndEmploymentForm employee={employee} onDone={onClose} />}
      </Dialog>
    </>
  );
}
