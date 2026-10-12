/**
 * Trang chủ: Dashboard tổng hợp (quyền dashboard.read) và lối tắt tới chức năng người dùng có quyền.
 */
import { Building2, KeyRound, ShieldCheck, UserCircle, Users } from 'lucide-react';
import { Link } from 'react-router';
import { PageHeader } from '@/components/common/page-header';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dashboard } from '@/features/dashboard/Dashboard';
import { useCan, useMe } from '@/lib/auth';

export function HomePage() {
  const { data: me } = useMe();
  const can = useCan();
  const shortcuts = [
    {
      to: '/can-bo',
      title: 'Hồ sơ cán bộ',
      desc: 'Tra cứu hồ sơ, phân công và lịch sử điều chuyển',
      icon: Users,
      show: can('employee.read'),
    },
    {
      to: '/to-chuc',
      title: 'Cơ cấu tổ chức',
      desc: 'Đơn vị, chức vụ, vị trí việc làm',
      icon: Building2,
      show: can('org.read'),
    },
    {
      to: '/quan-tri/nguoi-dung',
      title: 'Tài khoản người dùng',
      desc: 'Tạo, khóa tài khoản, cấp vai trò',
      icon: UserCircle,
      show: can('user.manage'),
    },
    {
      to: '/quan-tri/vai-tro',
      title: 'Vai trò và quyền',
      desc: 'Ma trận quyền theo vai trò',
      icon: ShieldCheck,
      show: can('role.manage'),
    },
    {
      to: '/tai-khoan',
      title: 'Tài khoản của tôi',
      desc: 'Đổi mật khẩu, phiên đăng nhập',
      icon: KeyRound,
      show: true,
    },
  ].filter((s) => s.show);

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Xin chào, ${me?.user.displayName ?? ''}`}
        description={
          can('dashboard.read')
            ? 'Tổng hợp kết quả đánh giá KPI/OKR trong phạm vi dữ liệu của bạn.'
            : 'Các chức năng bạn có thể sử dụng.'
        }
      />
      {can('dashboard.read') && <Dashboard />}
      <h2 className="pt-2 text-sm font-semibold text-muted-foreground">Lối tắt</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {shortcuts.map(({ to, title, desc, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="rounded-lg focus-visible:outline-2 focus-visible:outline-ring"
          >
            <Card className="h-full transition-colors hover:bg-accent/50">
              <CardHeader className="flex-row items-start gap-3">
                <Icon className="mt-0.5 size-5 text-primary" aria-hidden />
                <div className="space-y-1">
                  <CardTitle>{title}</CardTitle>
                  <CardDescription>{desc}</CardDescription>
                </div>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
