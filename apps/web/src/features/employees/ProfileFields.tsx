/** Nhóm trường thông tin cá nhân của hồ sơ cán bộ (dùng cho thêm mới và chỉnh sửa). */
import type { FieldErrors, UseFormRegister } from 'react-hook-form';
import { GENDERS, GENDER_LABELS } from '@kpi/shared';
import { FormField, Input, Select } from '@/components/ui/form-controls';
import { fieldAria } from '@/components/ui/field-aria';
import type { ProfileFormValues } from './form-values';

export function ProfileFields({
  register,
  errors,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: UseFormRegister<any>;
  errors: FieldErrors<ProfileFormValues>;
}) {
  const field = (
    name: keyof ProfileFormValues,
    label: string,
    opts: { required?: boolean; type?: string; hint?: string; autoComplete?: string } = {},
  ) => (
    <FormField
      id={`p-${name}`}
      label={label}
      required={opts.required}
      error={errors[name]?.message}
      hint={opts.hint}
    >
      <Input
        {...fieldAria(`p-${name}`, errors[name]?.message)}
        type={opts.type ?? 'text'}
        autoComplete={opts.autoComplete ?? 'off'}
        {...register(name)}
      />
    </FormField>
  );
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">{field('fullName', 'Họ và tên', { required: true })}</div>
      <FormField id="p-gender" label="Giới tính" error={errors.gender?.message}>
        <Select {...fieldAria('p-gender', errors.gender?.message)} {...register('gender')}>
          <option value="">— Chưa cập nhật —</option>
          {GENDERS.map((g) => (
            <option key={g} value={g}>
              {GENDER_LABELS[g]}
            </option>
          ))}
        </Select>
      </FormField>
      {field('dateOfBirth', 'Ngày sinh', { type: 'date' })}
      {field('phone', 'Số điện thoại', { type: 'tel' })}
      <div className="sm:col-span-2">{field('email', 'Email công vụ', { type: 'email' })}</div>
      {field('partyPosition', 'Chức vụ Đảng')}
      {field('govPosition', 'Chức vụ chính quyền')}
      {field('unionPosition', 'Chức vụ đoàn thể')}
    </div>
  );
}
