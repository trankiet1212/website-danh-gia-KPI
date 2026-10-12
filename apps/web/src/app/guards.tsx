/**
 * Bảo vệ route phía giao diện (chỉ để điều hướng — quyền thật kiểm tra ở backend):
 *  - RequireAuth: chưa đăng nhập → trang đăng nhập; mật khẩu tạm → bắt đổi mật khẩu.
 *  - RequirePermission: thiếu quyền → màn hình "không có quyền".
 */
import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import type { PermissionCode } from '@kpi/shared';
import { ErrorState, ForbiddenState, Spinner } from '@/components/common/states';
import { hasPermission, useMe } from '@/lib/auth';

export const CHANGE_PASSWORD_PATH = '/tai-khoan/doi-mat-khau';

export function RequireAuth() {
  const { data: me, isPending, error, refetch } = useMe();
  const location = useLocation();

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="Đang kiểm tra phiên đăng nhập..." />
      </div>
    );
  }
  if (error) {
    return (
      <div className="mx-auto max-w-md p-6">
        <ErrorState error={error} onRetry={() => void refetch()} />
      </div>
    );
  }
  if (!me) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/dang-nhap?next=${next}`} replace />;
  }
  if (me.user.mustChangePassword && location.pathname !== CHANGE_PASSWORD_PATH) {
    return <Navigate to={CHANGE_PASSWORD_PATH} replace />;
  }
  return <Outlet />;
}

export function RequirePermission({
  perms,
  children,
}: {
  perms: PermissionCode[];
  children: ReactNode;
}) {
  const { data: me } = useMe();
  return hasPermission(me, ...perms) ? <>{children}</> : <ForbiddenState />;
}
