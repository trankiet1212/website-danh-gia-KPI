/**
 * Khung giao diện: header (người dùng, đăng xuất), sidebar theo quyền, breadcrumb, nội dung.
 * Trên điện thoại sidebar thu vào nút menu. Chỉ hiển thị chức năng đã có và người dùng có quyền.
 */
import {
  Activity,
  BookOpenCheck,
  Building2,
  CalendarRange,
  ClipboardCheck,
  FileBarChart,
  FileText,
  Goal,
  ListChecks,
  Scale,
  ChevronRight,
  Home,
  KeyRound,
  LogOut,
  Menu,
  ShieldCheck,
  UserCircle,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Suspense, useState } from 'react';
import { NavLink, Outlet, useMatches, useNavigate } from 'react-router';
import type { PermissionCode } from '@kpi/shared';
import { LoadingState } from '@/components/common/states';
import { hasPermission, useLogout, useMe } from '@/lib/auth';
import { cn } from '@/lib/utils';
import type { RouteHandle } from '../router';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  perms?: PermissionCode[];
}

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  { title: 'Chung', items: [{ to: '/trang-chu', label: 'Trang chủ', icon: Home }] },
  {
    title: 'KPI/OKR và đánh giá',
    items: [
      {
        to: '/danh-gia',
        label: 'Hồ sơ đánh giá',
        icon: ClipboardCheck,
        perms: ['evaluation.read'],
      },
      { to: '/okr', label: 'Mục tiêu, kết quả then chốt', icon: Goal, perms: ['objective.read'] },
      { to: '/bao-cao', label: 'Báo cáo', icon: FileBarChart, perms: ['report.read'] },
      {
        to: '/du-thao',
        label: 'Dự thảo văn bản',
        icon: FileText,
        perms: ['draft.create', 'report.read'],
      },
      { to: '/ky-danh-gia', label: 'Kỳ đánh giá', icon: CalendarRange },
      { to: '/bo-tieu-chi', label: 'Bộ tiêu chí', icon: ListChecks, perms: ['criteria.read'] },
      { to: '/quy-tac', label: 'Quy tắc tính điểm', icon: Scale, perms: ['ruleset.read'] },
      { to: '/danh-muc-sp', label: 'Danh mục SP/CV', icon: BookOpenCheck, perms: ['catalog.read'] },
    ],
  },
  {
    title: 'Tổ chức, nhân sự',
    items: [
      { to: '/can-bo', label: 'Hồ sơ cán bộ', icon: Users, perms: ['employee.read'] },
      { to: '/to-chuc', label: 'Cơ cấu tổ chức', icon: Building2, perms: ['org.read'] },
    ],
  },
  {
    title: 'Quản trị',
    items: [
      {
        to: '/quan-tri/nguoi-dung',
        label: 'Tài khoản người dùng',
        icon: UserCircle,
        perms: ['user.manage'],
      },
      {
        to: '/quan-tri/vai-tro',
        label: 'Vai trò và quyền',
        icon: ShieldCheck,
        perms: ['role.manage'],
      },
    ],
  },
  {
    title: 'Cá nhân',
    items: [
      { to: '/tai-khoan', label: 'Tài khoản của tôi', icon: KeyRound },
      { to: '/he-thong/trang-thai', label: 'Trạng thái hệ thống', icon: Activity },
    ],
  },
];

function Breadcrumb() {
  const crumbs = useMatches()
    .map((m) => (m.handle as RouteHandle | undefined)?.crumb)
    .filter((c): c is string => Boolean(c));
  return (
    <nav
      aria-label="Đường dẫn"
      className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground"
    >
      <span>Trang chủ</span>
      {crumbs.map((c, i) => (
        <span key={`${c}-${i}`} className="flex items-center gap-1">
          <ChevronRight className="size-3.5" aria-hidden />
          <span className={i === crumbs.length - 1 ? 'text-foreground' : undefined}>{c}</span>
        </span>
      ))}
    </nav>
  );
}

export function AppLayout() {
  const { data: me } = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const groups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.perms || hasPermission(me, ...i.perms)),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 flex h-14 print:hidden items-center gap-3 bg-brand px-3 text-brand-foreground shadow md:px-4">
        <button
          type="button"
          className="rounded p-1.5 hover:bg-brand-foreground/15 md:hidden"
          aria-label="Mở menu chức năng"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <Menu className="size-5" />
        </button>
        <div className="flex size-8 shrink-0 items-center justify-center rounded bg-brand-foreground/15 text-sm font-bold">
          TC
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-semibold">Hệ thống quản lý và đánh giá KPI/OKR</p>
          <p className="truncate text-xs opacity-90">Ban Tổ chức Tỉnh ủy</p>
        </div>
        {me && (
          <div className="flex items-center gap-2">
            <div className="hidden text-right leading-tight sm:block">
              <p className="text-sm font-medium">{me.user.displayName}</p>
              <p className="text-xs opacity-90">
                {me.roles.map((r) => r.roleName).join(', ') || 'Chưa được cấp vai trò'}
              </p>
            </div>
            <button
              type="button"
              className="flex items-center gap-1 rounded px-2 py-1.5 text-sm hover:bg-brand-foreground/15"
              disabled={logout.isPending}
              onClick={() =>
                logout.mutate(undefined, {
                  onSettled: () => navigate('/dang-nhap', { replace: true }),
                })
              }
            >
              <LogOut className="size-4" aria-hidden />
              <span className="hidden sm:inline">Đăng xuất</span>
            </button>
          </div>
        )}
      </header>

      <div className="flex flex-1 flex-col md:flex-row">
        <aside
          className={cn(
            'border-b bg-card print:hidden md:sticky md:top-14 md:block md:h-[calc(100vh-3.5rem)] md:w-64 md:shrink-0 md:overflow-y-auto md:border-r md:border-b-0',
            menuOpen ? 'block' : 'hidden',
          )}
        >
          <nav aria-label="Chức năng" className="space-y-4 p-3">
            {groups.map((g) => (
              <div key={g.title} className="space-y-1">
                <p className="px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {g.title}
                </p>
                {g.items.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={() => setMenuOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent',
                        isActive && 'bg-secondary text-primary',
                      )
                    }
                  >
                    <Icon className="size-4" aria-hidden />
                    {label}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 space-y-4 p-4 md:p-6">
          <div className="print:hidden">
            <Breadcrumb />
          </div>
          <Suspense fallback={<LoadingState />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
