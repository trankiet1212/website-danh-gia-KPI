/**
 * Định tuyến. Mỗi trang được tải lười (code splitting) để giảm dung lượng tải ban đầu.
 * Chỉ khai báo route đã có trang thật — không có liên kết tới chức năng chưa triển khai.
 */
import { lazy, type ComponentType } from 'react';
import { createBrowserRouter, Navigate } from 'react-router';
import type { PermissionCode } from '@kpi/shared';
import { CHANGE_PASSWORD_PATH, RequireAuth, RequirePermission } from './guards';
import { AppLayout } from './layout/AppLayout';
import { NotFoundPage, RouteError } from './RouteError';

/** Metadata gắn với route — dùng để dựng breadcrumb. */
export interface RouteHandle {
  crumb?: string;
}

const page = <K extends string>(loader: () => Promise<Record<K, ComponentType>>, name: K) =>
  lazy(async () => ({ default: (await loader())[name] }));

const LoginPage = page(() => import('@/features/auth/LoginPage'), 'LoginPage');
const HomePage = page(() => import('@/features/home/HomePage'), 'HomePage');
const AccountPage = page(() => import('@/features/account/AccountPage'), 'AccountPage');
const ChangePasswordPage = page(
  () => import('@/features/account/ChangePasswordPage'),
  'ChangePasswordPage',
);
const EmployeeListPage = page(
  () => import('@/features/employees/EmployeeListPage'),
  'EmployeeListPage',
);
const EmployeeCreatePage = page(
  () => import('@/features/employees/EmployeeCreatePage'),
  'EmployeeCreatePage',
);
const EmployeeDetailPage = page(
  () => import('@/features/employees/EmployeeDetailPage'),
  'EmployeeDetailPage',
);
const OrgPage = page(() => import('@/features/org/OrgPage'), 'OrgPage');
const UsersPage = page(() => import('@/features/admin/UsersPage'), 'UsersPage');
const UserDetailPage = page(() => import('@/features/admin/UserDetailPage'), 'UserDetailPage');
const RolesPage = page(() => import('@/features/admin/RolesPage'), 'RolesPage');
const SystemStatusPage = page(
  () => import('@/features/system/SystemStatusPage'),
  'SystemStatusPage',
);

const PeriodsPage = page(() => import('@/features/kpi/PeriodsPage'), 'PeriodsPage');
const RuleSetsPage = page(() => import('@/features/kpi/RuleSetsPage'), 'RuleSetsPage');
const RuleSetVersionPage = page(
  () => import('@/features/kpi/RuleSetVersionPage'),
  'RuleSetVersionPage',
);
const CriteriaPage = page(() => import('@/features/kpi/CriteriaPage'), 'CriteriaPage');
const CriteriaVersionPage = page(
  () => import('@/features/kpi/CriteriaVersionPage'),
  'CriteriaVersionPage',
);
const CatalogPage = page(() => import('@/features/kpi/CatalogPage'), 'CatalogPage');
const ObjectivesPage = page(() => import('@/features/kpi/ObjectivesPage'), 'ObjectivesPage');
const DailyTasksPage = page(() => import('@/features/daily/DailyTasksPage'), 'DailyTasksPage');
const EvaluationsPage = page(() => import('@/features/kpi/EvaluationsPage'), 'EvaluationsPage');
const EvaluationDetailPage = page(
  () => import('@/features/kpi/EvaluationDetailPage'),
  'EvaluationDetailPage',
);

const ReportsPage = page(() => import('@/features/reports/ReportsPage'), 'ReportsPage');
const DraftsPage = page(() => import('@/features/reports/DraftsPage'), 'DraftsPage');

const guarded = (perms: PermissionCode[], Component: ComponentType) => (
  <RequirePermission perms={perms}>
    <Component />
  </RequirePermission>
);

const crumb = (text: string): RouteHandle => ({ crumb: text });

export const router = createBrowserRouter([
  { path: '/dang-nhap', element: <LoginPage />, errorElement: <RouteError /> },
  {
    element: <RequireAuth />,
    errorElement: <RouteError />,
    children: [
      {
        path: '/',
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/trang-chu" replace /> },
          { path: 'trang-chu', element: <HomePage />, handle: crumb('Tổng quan') },
          {
            path: 'can-bo',
            handle: crumb('Hồ sơ cán bộ'),
            children: [
              { index: true, element: guarded(['employee.read'], EmployeeListPage) },
              {
                path: 'them',
                element: guarded(['employee.read', 'employee.write'], EmployeeCreatePage),
                handle: crumb('Thêm mới'),
              },
              {
                path: ':id',
                element: guarded(['employee.read'], EmployeeDetailPage),
                handle: crumb('Chi tiết'),
              },
            ],
          },
          {
            path: 'to-chuc',
            element: guarded(['org.read'], OrgPage),
            handle: crumb('Cơ cấu tổ chức'),
          },
          {
            path: 'danh-gia',
            handle: crumb('Hồ sơ đánh giá'),
            children: [
              { index: true, element: guarded(['evaluation.read'], EvaluationsPage) },
              {
                path: ':id',
                element: guarded(['evaluation.read'], EvaluationDetailPage),
                handle: crumb('Chi tiết'),
              },
            ],
          },
          {
            path: 'bao-cao',
            element: guarded(['report.read'], ReportsPage),
            handle: crumb('Báo cáo'),
          },
          {
            path: 'du-thao',
            element: guarded(['draft.create', 'report.read'], DraftsPage),
            handle: crumb('Dự thảo văn bản'),
          },
          {
            path: 'giao-viec',
            element: guarded(['task.read'], DailyTasksPage),
            handle: crumb('Giao việc hằng ngày'),
          },
          {
            path: 'okr',
            element: guarded(['objective.read'], ObjectivesPage),
            handle: crumb('Mục tiêu, kết quả then chốt'),
          },
          { path: 'ky-danh-gia', element: <PeriodsPage />, handle: crumb('Kỳ đánh giá') },
          {
            path: 'bo-tieu-chi',
            handle: crumb('Bộ tiêu chí'),
            children: [
              { index: true, element: guarded(['criteria.read'], CriteriaPage) },
              {
                path: ':id',
                element: guarded(['criteria.read'], CriteriaVersionPage),
                handle: crumb('Phiên bản'),
              },
            ],
          },
          {
            path: 'quy-tac',
            handle: crumb('Quy tắc tính điểm'),
            children: [
              { index: true, element: guarded(['ruleset.read'], RuleSetsPage) },
              {
                path: ':id',
                element: guarded(['ruleset.read'], RuleSetVersionPage),
                handle: crumb('Phiên bản'),
              },
            ],
          },
          {
            path: 'danh-muc-sp',
            element: guarded(['catalog.read'], CatalogPage),
            handle: crumb('Danh mục sản phẩm/công việc'),
          },
          {
            path: 'quan-tri',
            handle: crumb('Quản trị'),
            children: [
              {
                path: 'nguoi-dung',
                element: guarded(['user.manage'], UsersPage),
                handle: crumb('Tài khoản người dùng'),
              },
              {
                path: 'nguoi-dung/:id',
                element: guarded(['user.manage'], UserDetailPage),
                handle: crumb('Chi tiết tài khoản'),
              },
              {
                path: 'vai-tro',
                element: guarded(['role.manage'], RolesPage),
                handle: crumb('Vai trò và quyền'),
              },
            ],
          },
          {
            path: 'tai-khoan',
            handle: crumb('Tài khoản của tôi'),
            children: [
              { index: true, element: <AccountPage /> },
              {
                path: CHANGE_PASSWORD_PATH.replace('/tai-khoan/', ''),
                element: <ChangePasswordPage />,
                handle: crumb('Đổi mật khẩu'),
              },
            ],
          },
          {
            path: 'he-thong/trang-thai',
            element: <SystemStatusPage />,
            handle: crumb('Trạng thái hệ thống'),
          },
          { path: '*', element: <NotFoundPage />, handle: crumb('Không tìm thấy') },
        ],
      },
    ],
  },
]);
