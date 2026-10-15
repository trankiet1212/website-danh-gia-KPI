/**
 * Danh mục mã quyền và quyền mặc định của từng vai trò.
 * Nguồn: docs/05-phan-quyen.md §4.2. Mọi thay đổi phải cập nhật tài liệu trước.
 *
 * Lưu ý: đây chỉ là quyền mặc định khi seed. Phạm vi dữ liệu (ALL/UNITS/OWN_UNIT/MANAGED/SELF)
 * được gán khi cấp vai trò cho từng người (bảng user_roles), không nằm ở đây.
 */
import type { RoleCode } from './enums.js';

export const PERMISSIONS = {
  // Quản trị
  'user.manage': 'Quản lý tài khoản người dùng',
  'role.manage': 'Quản lý vai trò và phân quyền',
  'setting.manage': 'Cấu hình hệ thống',
  'template.manage': 'Quản lý mẫu văn bản',
  'audit.read': 'Xem nhật ký hệ thống',
  // Tổ chức, nhân sự
  'org.read': 'Xem cơ cấu tổ chức, chức vụ, vị trí việc làm',
  'org.manage': 'Quản lý cơ cấu tổ chức, chức vụ, vị trí việc làm',
  'employee.read': 'Xem hồ sơ cán bộ (theo phạm vi)',
  'employee.write': 'Thêm, sửa, lưu trữ hồ sơ cán bộ',
  'employee.import': 'Nhập hồ sơ cán bộ từ Excel',
  // Danh mục, tiêu chí, quy tắc
  'catalog.read': 'Xem danh mục sản phẩm/công việc',
  'catalog.write': 'Soạn danh mục sản phẩm/công việc',
  'catalog.approve': 'Phê duyệt danh mục sản phẩm/công việc',
  'catalog.assign': 'Phân danh mục sản phẩm/công việc theo vị trí việc làm',
  'criteria.read': 'Xem bộ tiêu chí',
  'criteria.write': 'Soạn bộ tiêu chí',
  'criteria.approve': 'Phê duyệt bộ tiêu chí',
  'ruleset.read': 'Xem quy tắc tính điểm, xếp loại',
  'ruleset.write': 'Soạn quy tắc tính điểm theo văn bản',
  'ruleset.confirm': 'Xác nhận áp dụng quy tắc tính điểm, xếp loại',
  'period.manage': 'Quản lý kỳ đánh giá',
  // KPI/OKR, nhiệm vụ
  'objective.read': 'Xem mục tiêu, kết quả then chốt',
  'objective.write': 'Quản lý mục tiêu, kết quả then chốt',
  'task.read': 'Xem nhiệm vụ',
  'task.assign': 'Giao nhiệm vụ',
  'task.update': 'Cập nhật tiến độ, kết quả nhiệm vụ',
  'task.quality.record': 'Ghi nhận làm lại, chậm tiến độ',
  'task.quality.exempt': 'Xác nhận miễn trừ do nguyên nhân khách quan',
  'evidence.upload': 'Tải lên minh chứng',
  'evidence.read': 'Xem, tải minh chứng',
  // Đánh giá, phê duyệt
  'evaluation.read': 'Xem hồ sơ đánh giá',
  'evaluation.self': 'Tự đánh giá',
  'evaluation.review': 'Nhận xét, chấm điểm, trả lại hồ sơ',
  'evaluation.verify': 'Thẩm định hồ sơ đánh giá',
  'evaluation.approve': 'Phê duyệt kết quả đánh giá',
  'evaluation.reopen': 'Mở lại kết quả đã phê duyệt',
  'evaluation.record_external': 'Ghi nhận quyết định xếp loại của cấp có thẩm quyền',
  // Báo cáo, văn bản
  'dashboard.read': 'Xem Dashboard',
  'report.read': 'Xem báo cáo',
  'report.export': 'Xuất báo cáo Excel/PDF',
  'draft.create': 'Tạo dự thảo văn bản',
  'draft.approve': 'Duyệt dự thảo văn bản',
  'notification.read': 'Xem thông báo',
} as const;

export type PermissionCode = keyof typeof PERMISSIONS;
export const PERMISSION_CODES = Object.keys(PERMISSIONS) as PermissionCode[];

/** Mô-đun của quyền = phần trước dấu chấm đầu tiên. */
export function permissionModule(code: PermissionCode): string {
  return code.split('.')[0] ?? code;
}

/**
 * Quyền mặc định theo vai trò (docs/05-phan-quyen.md §4.2).
 * Các quyền đánh dấu (*) trong tài liệu còn chờ cơ quan xác nhận (docs/09-cau-hoi-mo.md #9).
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<RoleCode, readonly PermissionCode[]> = {
  // Quản trị kỹ thuật: KHÔNG có quyền đọc dữ liệu nghiệp vụ (điểm, minh chứng, đánh giá).
  SUPER_ADMIN: [
    'user.manage',
    'role.manage',
    'setting.manage',
    'template.manage',
    'audit.read',
    'org.read',
    'org.manage',
    'period.manage',
    'notification.read',
  ],
  AGENCY_LEADER: [
    'org.read',
    'employee.read',
    'catalog.read',
    'catalog.approve',
    'criteria.read',
    'criteria.approve',
    'ruleset.read',
    'ruleset.confirm',
    'period.manage',
    'objective.read',
    'objective.write',
    'task.read',
    'task.assign',
    'task.quality.record',
    'task.quality.exempt',
    'evidence.read',
    'evaluation.read',
    'evaluation.self',
    'evaluation.review',
    'evaluation.approve',
    'evaluation.reopen',
    'dashboard.read',
    'report.read',
    'report.export',
    'draft.approve',
    'notification.read',
  ],
  UNIT_LEADER: [
    'org.read',
    'employee.read',
    'catalog.read',
    'catalog.write',
    'criteria.read',
    'criteria.write',
    'ruleset.read',
    'objective.read',
    'objective.write',
    'task.read',
    'task.assign',
    'task.update',
    'task.quality.record',
    'evidence.upload',
    'evidence.read',
    'evaluation.read',
    'evaluation.self',
    'evaluation.review',
    'dashboard.read',
    'report.read',
    'report.export',
    'notification.read',
  ],
  EVAL_OFFICER: [
    'org.read',
    'employee.read',
    'employee.write',
    'employee.import',
    'catalog.read',
    'catalog.write',
    'catalog.assign',
    'criteria.read',
    'criteria.write',
    'ruleset.read',
    'ruleset.write',
    'period.manage',
    'objective.read',
    'task.read',
    'evidence.read',
    'evaluation.read',
    'evaluation.self',
    'evaluation.verify',
    'evaluation.record_external',
    'dashboard.read',
    'report.read',
    'report.export',
    'draft.create',
    'notification.read',
  ],
  EMPLOYEE: [
    'org.read',
    'employee.read',
    'catalog.read',
    'criteria.read',
    'objective.read',
    'objective.write',
    'task.read',
    'task.update',
    'evidence.upload',
    'evidence.read',
    'evaluation.read',
    'evaluation.self',
    'dashboard.read',
    'report.read',
    'report.export',
    'notification.read',
  ],
};
