/**
 * Nhóm trường phân công công tác (đơn vị, chức vụ, VTVL, cấp quản lý, ngày bắt đầu, nhiệm vụ)
 * — dùng chung cho biểu mẫu thêm cán bộ và điều chuyển.
 */
import {
  Controller,
  type Control,
  type FieldErrors,
  type FieldValues,
  type Path,
  type UseFormRegister,
} from 'react-hook-form';
import { ErrorState } from '@/components/common/states';
import { FormField, Input, Select, Textarea } from '@/components/ui/form-controls';
import { fieldAria } from '@/components/ui/field-aria';
import { flattenUnitTree, useJobPositions, usePositions, useUnits } from '@/features/org/api';
import { EmployeePicker, type PickedEmployee } from './EmployeePicker';
import type { AssignmentFormValues } from './form-values';

export function AssignmentFields<T extends FieldValues>({
  prefix,
  register,
  control,
  errors,
  excludeEmployeeId,
}: {
  prefix: string;
  register: UseFormRegister<T>;
  control: Control<T>;
  errors?: FieldErrors<AssignmentFormValues>;
  excludeEmployeeId?: string;
}) {
  const units = useUnits();
  const positions = usePositions();
  const jobs = useJobPositions();
  const name = (f: keyof AssignmentFormValues) => (prefix ? `${prefix}.${f}` : f) as Path<T>;
  const fid = (f: string) => `${prefix || 'asg'}-${f}`;
  const loadError = units.error ?? positions.error ?? jobs.error;

  if (loadError) return <ErrorState error={loadError} />;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField id={fid('unit')} label="Đơn vị" required error={errors?.unitId?.message}>
        <Select {...fieldAria(fid('unit'), errors?.unitId?.message)} {...register(name('unitId'))}>
          <option value="">— Chọn đơn vị —</option>
          {flattenUnitTree(units.data ?? []).map((u) => (
            <option key={u.id} value={u.id}>
              {'— '.repeat(u.depth)}
              {u.name}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField id={fid('position')} label="Chức vụ" required error={errors?.positionId?.message}>
        <Select
          {...fieldAria(fid('position'), errors?.positionId?.message)}
          {...register(name('positionId'))}
        >
          <option value="">— Chọn chức vụ —</option>
          {(positions.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} (cấp {p.level})
            </option>
          ))}
        </Select>
      </FormField>
      <FormField id={fid('job')} label="Vị trí việc làm" error={errors?.jobPositionId?.message}>
        <Select
          {...fieldAria(fid('job'), errors?.jobPositionId?.message)}
          {...register(name('jobPositionId'))}
        >
          <option value="">— Chưa xác định —</option>
          {(jobs.data ?? []).map((j) => (
            <option key={j.id} value={j.id}>
              {j.name}
              {j.isProvisional ? ' (tạm)' : ''}
            </option>
          ))}
        </Select>
      </FormField>
      <FormField id={fid('start')} label="Ngày bắt đầu" required error={errors?.startDate?.message}>
        <Input
          {...fieldAria(fid('start'), errors?.startDate?.message)}
          type="date"
          {...register(name('startDate'))}
        />
      </FormField>
      <FormField
        id={fid('manager')}
        label="Cấp quản lý trực tiếp"
        error={errors?.manager?.message}
        className="sm:col-span-2"
        hint="Người trực tiếp phân công, đánh giá cán bộ."
      >
        <Controller
          control={control}
          name={name('manager')}
          render={({ field }) => (
            <EmployeePicker
              id={fid('manager')}
              value={field.value as PickedEmployee | null}
              onChange={field.onChange}
              excludeId={excludeEmployeeId}
            />
          )}
        />
      </FormField>
      <FormField id={fid('decision')} label="Số quyết định" error={errors?.decisionRef?.message}>
        <Input
          {...fieldAria(fid('decision'), errors?.decisionRef?.message)}
          {...register(name('decisionRef'))}
        />
      </FormField>
      <FormField
        id={fid('duties')}
        label="Lĩnh vực, nhiệm vụ phụ trách"
        error={errors?.duties?.message}
        className="sm:col-span-2"
      >
        <Textarea
          {...fieldAria(fid('duties'), errors?.duties?.message)}
          {...register(name('duties'))}
        />
      </FormField>
    </div>
  );
}
