import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { PASSWORD_MIN_LENGTH, changePasswordSchema, type ChangePasswordInput } from '@kpi/shared';
import { PageHeader } from '@/components/common/page-header';
import { FormError } from '@/components/common/states';
import { useToast } from '@/components/common/toast-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FormField, Input } from '@/components/ui/form-controls';
import { fieldAria } from '@/components/ui/field-aria';
import { useChangePassword, useMe } from '@/lib/auth';
import { applyServerErrors } from '@/lib/forms';

export function ChangePasswordPage() {
  const { data: me } = useMe();
  const change = useChangePassword();
  const toast = useToast();
  const navigate = useNavigate();
  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });
  const { errors } = form.formState;
  const forced = me?.user.mustChangePassword;

  const onSubmit = form.handleSubmit((values) =>
    change.mutate(values, {
      onSuccess: () => {
        toast.success('Đã đổi mật khẩu. Các phiên đăng nhập khác đã bị đăng xuất.');
        form.reset();
        if (forced) navigate('/trang-chu', { replace: true });
      },
      onError: (err) => applyServerErrors(err, form.setError),
    }),
  );

  return (
    <div className="max-w-xl space-y-4">
      <PageHeader
        title="Đổi mật khẩu"
        description={
          forced
            ? 'Bạn đang dùng mật khẩu tạm. Vui lòng đặt mật khẩu mới trước khi sử dụng hệ thống.'
            : 'Sau khi đổi, các phiên đăng nhập khác của bạn sẽ bị đăng xuất.'
        }
      />
      <Card>
        <CardContent className="pt-5">
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            {change.error && !applyServerErrors(change.error, () => undefined) && (
              <FormError error={change.error} />
            )}
            <FormField
              id="currentPassword"
              label="Mật khẩu hiện tại"
              required
              error={errors.currentPassword?.message}
            >
              <Input
                {...fieldAria('currentPassword', errors.currentPassword?.message)}
                type="password"
                autoComplete="current-password"
                {...form.register('currentPassword')}
              />
            </FormField>
            <FormField
              id="newPassword"
              label="Mật khẩu mới"
              required
              error={errors.newPassword?.message}
              hint={`Tối thiểu ${PASSWORD_MIN_LENGTH} ký tự, gồm ít nhất 3 trong 4 loại: chữ thường, chữ hoa, chữ số, ký tự đặc biệt.`}
            >
              <Input
                {...fieldAria('newPassword', errors.newPassword?.message)}
                type="password"
                autoComplete="new-password"
                {...form.register('newPassword')}
              />
            </FormField>
            <FormField
              id="confirmPassword"
              label="Nhập lại mật khẩu mới"
              required
              error={errors.confirmPassword?.message}
            >
              <Input
                {...fieldAria('confirmPassword', errors.confirmPassword?.message)}
                type="password"
                autoComplete="new-password"
                {...form.register('confirmPassword')}
              />
            </FormField>
            <Button type="submit" disabled={change.isPending}>
              {change.isPending ? 'Đang lưu...' : 'Đổi mật khẩu'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
