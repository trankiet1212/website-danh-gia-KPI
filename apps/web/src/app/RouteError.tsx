import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { buttonVariants } from '@/components/ui/button-variants';

function ErrorScreen({
  code,
  title,
  description,
}: {
  code: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-5xl font-bold text-muted-foreground">{code}</p>
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      <Link to="/" className={buttonVariants({ variant: 'outline' })}>
        Về trang chủ
      </Link>
    </div>
  );
}

/** Đường dẫn không tồn tại (route "*"). */
export function NotFoundPage() {
  return (
    <ErrorScreen
      code="404"
      title="Không tìm thấy trang"
      description="Đường dẫn không tồn tại hoặc chức năng chưa được triển khai."
    />
  );
}

/** errorElement của router: lỗi khi hiển thị trang (không lộ chi tiết kỹ thuật). */
export function RouteError() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;
  return (
    <ErrorScreen
      code="Lỗi"
      title="Đã xảy ra lỗi khi hiển thị trang"
      description="Vui lòng tải lại trang. Nếu lỗi tiếp diễn, liên hệ quản trị hệ thống."
    />
  );
}
