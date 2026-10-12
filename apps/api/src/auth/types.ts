import type { PermissionCode, ScopeType } from '@kpi/shared';

export interface AuthConfig {
  /** Khóa bí mật dùng ký CSRF token (HMAC). */
  sessionSecret: string;
  idleMinutes: number;
  absoluteHours: number;
  maxFailedAttempts: number;
  lockMinutes: number;
  /** true khi chạy HTTPS (production) — cookie Secure + tiền tố __Host-. */
  secureCookies: boolean;
}

export interface AuthGrant {
  id: string;
  roleId: string;
  roleCode: string;
  roleName: string;
  scopeType: ScopeType;
  units: { id: string; code: string; name: string }[];
  permissions: ReadonlySet<PermissionCode>;
}

export interface AuthEmployee {
  id: string;
  employeeCode: string;
  fullName: string;
  /** Đơn vị theo phân công chính đang hiệu lực (null nếu chưa có). */
  unitId: string | null;
  unitName: string | null;
}

/** Thông tin người dùng đã xác thực, gắn vào req.auth cho mỗi request. */
export interface AuthContext {
  sessionId: string;
  sessionExpiresAt: Date;
  csrfTokenHash: string;
  userId: string;
  username: string;
  displayName: string;
  mustChangePassword: boolean;
  employee: AuthEmployee | null;
  grants: AuthGrant[];
  permissions: ReadonlySet<PermissionCode>;
}

/** Phạm vi dữ liệu hiệu lực của một quyền (hợp của mọi vai trò có quyền đó). */
export interface DataScope {
  all: boolean;
  unitIds: string[];
  /** Xem được cán bộ có cấp quản lý trực tiếp là người này. */
  managerEmployeeId: string | null;
  /** Xem được hồ sơ của chính mình. */
  selfEmployeeId: string | null;
}
