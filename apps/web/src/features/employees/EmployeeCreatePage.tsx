import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { createEmployeeSchema, type EmployeeDetail } from '@kpi/shared';
import { PageHeader } from '@/components/common/page-header';
import { FormError } from '@/components/common/states';
import { useToast } from '@/components/common/toast-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField, Input } from '@/components/ui/form-controls';
import { fieldAria } from '@/components/ui/field-aria';
import { api } from '@/lib/api-client';
import { todayIso } from '@/lib/format';
import { applyServerErrors, validatePayload } from '@/lib/forms';
import { employeeKeys } from './api';
import { AssignmentFields } from './AssignmentFields';
import { ProfileFields } from './ProfileFields';
import {
  emptyProfile,
  toAssignmentPayload,
  type AssignmentFormValues,
  type ProfileFormValues,
} from './form-values';

type FormValues = ProfileFormValues & { employeeCode: string; assignment: AssignmentFormValues };

const RENAME = { 'assignment.managerEmployeeId': 'assignment.manager' };

export function EmployeeCreatePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const form = useForm<FormValues>({
    defaultValues: {
      ...emptyProfile,
      employeeCode: '',
      assignment: {
        unitId: '',
        positionId: '',
        jobPositionId: '',
        manager: null,
        startDate: todayIso(),
        duties: '',
        decisionRef: '',
      },
    },
  });
  const { errors } = form.formState;

  const create = useMutation({
    mutationFn: (payload: unknown) => api.post<EmployeeDetail>('/employees', payload),
    onSuccess: (e) => {
      toast.success(`Đã thêm hồ sơ ${e.fullName}`);
      void qc.invalidateQueries({ queryKey: employeeKeys.all });
      navigate(`/can-bo/${e.id}`);
    },
    onError: (err) => applyServerErrors(err, form.setError, RENAME),
  });

  const onSubmit = form.handleSubmit((v) => {
    const payload = { ...v, assignment: toAssignmentPayload(v.assignment) };
    const parsed = validatePayload(createEmployeeSchema, payload, form.setError, RENAME);
    if (parsed) create.mutate(parsed);
  });

  return (
    <form onSubmit={onSubmit} className="max-w-4xl space-y-4" noValidate>
      <PageHeader
        title="Thêm hồ sơ cán bộ"
        description="Thông tin cá nhân và phân công công tác ban đầu."
      />
      {create.error && <FormError error={create.error} />}
      <Card>
        <CardHeader>
          <CardTitle>Thông tin cá nhân</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField
            id="employeeCode"
            label="Mã cán bộ"
            required
            error={errors.employeeCode?.message}
            hint="Chữ không dấu, số, dấu . _ - ; tự chuyển thành chữ hoa."
          >
            <Input
              {...fieldAria('employeeCode', errors.employeeCode?.message)}
              className="max-w-xs"
              {...form.register('employeeCode')}
            />
          </FormField>
          <ProfileFields register={form.register} errors={errors} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Phân công công tác</CardTitle>
        </CardHeader>
        <CardContent>
          <AssignmentFields
            prefix="assignment"
            register={form.register}
            control={form.control}
            errors={errors.assignment}
          />
        </CardContent>
      </Card>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate('/can-bo')}>
          Hủy
        </Button>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Đang lưu...' : 'Lưu hồ sơ'}
        </Button>
      </div>
    </form>
  );
}
