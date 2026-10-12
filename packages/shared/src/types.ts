/**
 * Kiểu dữ liệu phản hồi API (DTO) dùng chung cho API và Web.
 * Ngày nghiệp vụ trả về dạng 'YYYY-MM-DD'; thời điểm trả về chuỗi ISO 8601 (UTC).
 */
import type {
  EmployeeStatus,
  Gender,
  JobPositionGroup,
  KpiProfile,
  RoleCode,
  ScopeType,
  UnitType,
} from './enums.js';
import type { PermissionCode } from './permissions.js';
import type { UserStatus } from './schemas/admin.js';
import type { RecordStatus } from './schemas/org.js';

export interface RoleGrantDto {
  id: string;
  roleId: string;
  roleCode: RoleCode | string;
  roleName: string;
  scopeType: ScopeType;
  units: { id: string; code: string; name: string }[];
}

export interface AuthMe {
  user: {
    id: string;
    username: string;
    displayName: string;
    mustChangePassword: boolean;
    employee: {
      id: string;
      employeeCode: string;
      fullName: string;
      unitName: string | null;
    } | null;
  };
  roles: RoleGrantDto[];
  permissions: PermissionCode[];
  csrfToken: string;
  session: { id: string; expiresAt: string; idleTimeoutMinutes: number };
}

export interface SessionDto {
  id: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  current: boolean;
}

export interface UserListItem {
  id: string;
  username: string;
  displayName: string;
  status: UserStatus;
  lockedUntil: string | null;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  employee: { id: string; employeeCode: string; fullName: string } | null;
  roles: RoleGrantDto[];
  version: number;
}

export interface CreatedUserResult {
  user: UserListItem;
  /** Mật khẩu tạm — chỉ trả về một lần khi tạo/đặt lại. */
  temporaryPassword: string | null;
}

export interface RoleDto {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: PermissionCode[];
  userCount: number;
}

export interface PermissionDto {
  code: PermissionCode;
  module: string;
  description: string;
}

export interface UnitDto {
  id: string;
  code: string;
  name: string;
  shortName: string | null;
  type: UnitType;
  parentId: string | null;
  sortOrder: number;
  status: RecordStatus;
  activeEmployeeCount: number;
  version: number;
}

export interface PositionDto {
  id: string;
  code: string;
  name: string;
  level: number;
  isLeadership: boolean;
  kpiProfile: KpiProfile;
  sortOrder: number;
  status: RecordStatus;
  version: number;
}

export interface JobPositionDto {
  id: string;
  code: string;
  name: string;
  group: JobPositionGroup;
  description: string | null;
  status: RecordStatus;
  isProvisional: boolean;
  version: number;
}

export interface AssignmentDto {
  id: string;
  unit: { id: string; code: string; name: string };
  position: { id: string; code: string; name: string; level: number };
  jobPosition: { id: string; code: string; name: string } | null;
  manager: { id: string; employeeCode: string; fullName: string } | null;
  isPrimary: boolean;
  startDate: string;
  endDate: string | null;
  duties: string | null;
  decisionRef: string | null;
  note: string | null;
}

export interface EmployeeListItem {
  id: string;
  employeeCode: string;
  fullName: string;
  status: EmployeeStatus;
  isDemo: boolean;
  email: string | null;
  current: AssignmentDto | null;
  hasAccount: boolean;
  version: number;
}

export interface EmployeeDetail extends EmployeeListItem {
  gender: Gender | null;
  dateOfBirth: string | null;
  phone: string | null;
  partyPosition: string | null;
  govPosition: string | null;
  unionPosition: string | null;
  createdAt: string;
  updatedAt: string;
  assignments: AssignmentDto[];
  /** Quyền thao tác của người đang xem trên hồ sơ này (giao diện dùng để ẩn/hiện nút). */
  can: { edit: boolean; transfer: boolean; archive: boolean };
}

/** Hồ sơ cá nhân của người đang đăng nhập (GET /profile). */
export interface OwnProfileDto {
  account: {
    username: string;
    status: UserStatus;
    createdAt: string;
    lastLoginAt: string | null;
    passwordChangedAt: string | null;
  };
  /** null nếu tài khoản không gắn hồ sơ cán bộ (ví dụ quản trị kỹ thuật). */
  employee: {
    id: string;
    employeeCode: string;
    fullName: string;
    gender: Gender | null;
    dateOfBirth: string | null;
    email: string | null;
    phone: string | null;
    partyPosition: string | null;
    govPosition: string | null;
    unionPosition: string | null;
    status: EmployeeStatus;
    isDemo: boolean;
    current: AssignmentDto | null;
    updatedAt: string;
    version: number;
  } | null;
  /** Trường cán bộ được tự sửa; rỗng nếu không gắn hồ sơ hoặc hồ sơ không còn công tác. */
  editableFields: ('phone' | 'email')[];
}

export interface EmployeeOption {
  id: string;
  employeeCode: string;
  fullName: string;
  unitName: string | null;
}
