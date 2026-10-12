import { zodResolver } from '@hookform/resolvers/zod';
import { LogIn } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { loginSchema, type LoginInput } from '@kpi/shared';
import { FormError, Spinner } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField, Input } from '@/components/ui/form-controls';
import { fieldAria } from '@/components/ui/field-aria';
import { useLogin, useMe } from '@/lib/auth';

/** Chỉ cho phép chuyển hướng nội bộ sau đăng nhập (chống open redirect). */
function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/trang-chu';
}

export function LoginPage() {
  const { data: me, isPending } = useMe();
  const login = useLogin();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
  });
  const { errors } = form.formState;

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (me) return <Navigate to={next} replace />;

  const onSubmit = form.handleSubmit((values) =>
    login.mutate(values, { onSuccess: () => navigate(next, { replace: true }) }),
  );

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/40 p-4">
      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-lg bg-brand text-lg font-bold text-brand-foreground">
          TC
        </div>
        <div className="leading-tight">
          <p className="font-semibold">Hệ thống quản lý và đánh giá KPI/OKR</p>
          <p className="text-sm text-muted-foreground">Ban Tổ chức Tỉnh ủy</p>
        </div>
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Đăng nhập</CardTitle>
          <CardDescription>Sử dụng tài khoản được quản trị hệ thống cấp.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <FormError error={login.error} />
            <FormField id="username" label="Tên đăng nhập" error={errors.username?.message}>
              <Input
                {...fieldAria('username', errors.username?.message)}
                autoComplete="username"
                autoFocus
                {...form.register('username')}
              />
            </FormField>
            <FormField id="password" label="Mật khẩu" error={errors.password?.message}>
              <Input
                {...fieldAria('password', errors.password?.message)}
                type="password"
                autoComplete="current-password"
                {...form.register('password')}
              />
            </FormField>
            <Button type="submit" className="w-full" disabled={login.isPending}>
              <LogIn aria-hidden />
              {login.isPending ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </Button>
          </form>
        </CardContent>
      </Card>
      <p className="max-w-sm text-center text-xs text-muted-foreground">
        Hệ thống không dùng để xử lý thông tin, tài liệu thuộc bí mật nhà nước.
      </p>
    </div>
  );
}
