/**
 * Enum nghiệp vụ dùng chung. Giá trị phải khớp enum trong apps/api/prisma/schema.prisma.
 * Nhãn tiếng Việt dùng cho giao diện và báo cáo.
 */

export const ROLE_CODES = [
  'SUPER_ADMIN',
  'AGENCY_LEADER',
  'UNIT_LEADER',
  'EVAL_OFFICER',
  'EMPLOYEE',
] as const;
export type RoleCode = (typeof ROLE_CODES)[number];

export const ROLE_LABELS: Record<RoleCode, string> = {
  SUPER_ADMIN: 'Quản trị hệ thống',
  AGENCY_LEADER: 'Lãnh đạo cơ quan',
  UNIT_LEADER: 'Lãnh đạo phòng chuyên môn',
  EVAL_OFFICER: 'Cán bộ phụ trách đánh giá, tổng hợp',
  EMPLOYEE: 'Cán bộ, công chức',
};

/** Phạm vi dữ liệu gắn với một vai trò được cấp (docs/05-phan-quyen.md §4.1). */
export const SCOPE_TYPES = ['ALL', 'UNITS', 'OWN_UNIT', 'MANAGED', 'SELF', 'NONE'] as const;
export type ScopeType = (typeof SCOPE_TYPES)[number];

export const UNIT_TYPES = ['AGENCY', 'LEADERSHIP_BOARD', 'DEPARTMENT', 'OFFICE'] as const;
export type UnitType = (typeof UNIT_TYPES)[number];

export const KPI_PROFILES = ['LEADER', 'STAFF'] as const;
export type KpiProfile = (typeof KPI_PROFILES)[number];

export const JOB_POSITION_GROUPS = ['LEADERSHIP', 'PROFESSIONAL', 'SHARED_SUPPORT'] as const;
export type JobPositionGroup = (typeof JOB_POSITION_GROUPS)[number];

export const EMPLOYEE_STATUSES = ['WORKING', 'TRANSFERRED', 'RETIRED', 'ARCHIVED'] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export const EMPLOYEE_STATUS_LABELS: Record<EmployeeStatus, string> = {
  WORKING: 'Đang công tác',
  TRANSFERRED: 'Đã điều chuyển',
  RETIRED: 'Đã nghỉ hưu / thôi việc',
  ARCHIVED: 'Lưu trữ',
};

export const GENDERS = ['MALE', 'FEMALE'] as const;
export type Gender = (typeof GENDERS)[number];

export const GENDER_LABELS: Record<Gender, string> = { MALE: 'Nam', FEMALE: 'Nữ' };

export const PERIOD_TYPES = ['MONTH', 'QUARTER', 'HALF_YEAR', 'YEAR'] as const;
export type PeriodType = (typeof PERIOD_TYPES)[number];

export const PERIOD_TYPE_LABELS: Record<PeriodType, string> = {
  MONTH: 'Tháng',
  QUARTER: 'Quý',
  HALF_YEAR: '6 tháng',
  YEAR: 'Năm',
};

export const PERIOD_STATUSES = ['PLANNING', 'OPEN', 'SELF_ASSESSMENT', 'REVIEW', 'CLOSED'] as const;
export type PeriodStatus = (typeof PERIOD_STATUSES)[number];

export const PERIOD_STATUS_LABELS: Record<PeriodStatus, string> = {
  PLANNING: 'Đang lập kế hoạch',
  OPEN: 'Đang thực hiện',
  SELF_ASSESSMENT: 'Tự đánh giá',
  REVIEW: 'Đang xem xét, phê duyệt',
  CLOSED: 'Đã đóng',
};

export const SCOPE_LABELS: Record<ScopeType, string> = {
  ALL: 'Toàn cơ quan',
  UNITS: 'Các đơn vị được phân công',
  OWN_UNIT: 'Đơn vị của mình',
  MANAGED: 'Cán bộ do mình quản lý trực tiếp',
  SELF: 'Bản thân',
  NONE: 'Không có dữ liệu nghiệp vụ',
};

export const UNIT_TYPE_LABELS: Record<UnitType, string> = {
  AGENCY: 'Cơ quan',
  LEADERSHIP_BOARD: 'Lãnh đạo cơ quan',
  DEPARTMENT: 'Phòng chuyên môn',
  OFFICE: 'Văn phòng',
};

export const KPI_PROFILE_LABELS: Record<KpiProfile, string> = {
  LEADER: 'Lãnh đạo, quản lý',
  STAFF: 'Chuyên viên, nhân viên',
};

export const JOB_POSITION_GROUP_LABELS: Record<JobPositionGroup, string> = {
  LEADERSHIP: 'Lãnh đạo, quản lý',
  PROFESSIONAL: 'Chuyên môn, nghiệp vụ',
  SHARED_SUPPORT: 'Chuyên môn dùng chung, hỗ trợ',
};
