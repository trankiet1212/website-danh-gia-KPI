/**
 * Dữ liệu danh mục cho seed.
 * - Đơn vị, chức vụ: theo "Cây sơ đồ phân công nhiệm vụ BTCTU" (T9/2026) — docs/08-can-cu-nghiep-vu.md.
 * - Vị trí việc làm: file nguồn KHÔNG có danh mục VTVL chính thức → danh mục TẠM (isProvisional = true),
 *   chờ cơ quan cung cấp (docs/09-cau-hoi-mo.md).
 */
import type { JobPositionGroup, KpiProfile, UnitType } from '../../src/generated/prisma/client.js';

export interface UnitSeed {
  code: string;
  name: string;
  shortName: string;
  type: UnitType;
  parentCode: string | null;
  sortOrder: number;
}

export const UNITS: UnitSeed[] = [
  {
    code: 'BAN',
    name: 'Ban Tổ chức Tỉnh ủy',
    shortName: 'BTCTU',
    type: 'AGENCY',
    parentCode: null,
    sortOrder: 0,
  },
  {
    code: 'LDB',
    name: 'Lãnh đạo Ban',
    shortName: 'Lãnh đạo Ban',
    type: 'LEADERSHIP_BOARD',
    parentCode: 'BAN',
    sortOrder: 1,
  },
  {
    code: 'TCCB',
    name: 'Phòng Tổ chức cán bộ',
    shortName: 'P.TCCB',
    type: 'DEPARTMENT',
    parentCode: 'BAN',
    sortOrder: 2,
  },
  {
    code: 'VP',
    name: 'Văn phòng Ban',
    shortName: 'Văn phòng',
    type: 'OFFICE',
    parentCode: 'BAN',
    sortOrder: 3,
  },
  {
    code: 'TCDDV',
    name: 'Phòng Tổ chức đảng, đảng viên',
    shortName: 'P.TCĐ-ĐV',
    type: 'DEPARTMENT',
    parentCode: 'BAN',
    sortOrder: 4,
  },
  {
    code: 'BVCTNB',
    name: 'Phòng Bảo vệ chính trị nội bộ',
    shortName: 'P.BVCTNB',
    type: 'DEPARTMENT',
    parentCode: 'BAN',
    sortOrder: 5,
  },
];

export interface PositionSeed {
  code: string;
  name: string;
  level: number;
  isLeadership: boolean;
  kpiProfile: KpiProfile;
  sortOrder: number;
}

/** Cấp 1–5 theo cột "Cấp" của sơ đồ: 1 Trưởng ban, 2 Phó Ban, 3 Trưởng phòng, 4 Phó phòng, 5 Chuyên viên. */
export const POSITIONS: PositionSeed[] = [
  {
    code: 'TRUONG_BAN',
    name: 'Trưởng ban',
    level: 1,
    isLeadership: true,
    kpiProfile: 'LEADER',
    sortOrder: 1,
  },
  {
    code: 'PHO_TRUONG_BAN_TT',
    name: 'Phó Trưởng ban Thường trực',
    level: 2,
    isLeadership: true,
    kpiProfile: 'LEADER',
    sortOrder: 2,
  },
  {
    code: 'PHO_TRUONG_BAN',
    name: 'Phó Trưởng ban',
    level: 2,
    isLeadership: true,
    kpiProfile: 'LEADER',
    sortOrder: 3,
  },
  {
    code: 'TRUONG_PHONG',
    name: 'Trưởng phòng',
    level: 3,
    isLeadership: true,
    kpiProfile: 'LEADER',
    sortOrder: 4,
  },
  {
    code: 'CHANH_VAN_PHONG',
    name: 'Chánh Văn phòng',
    level: 3,
    isLeadership: true,
    kpiProfile: 'LEADER',
    sortOrder: 5,
  },
  {
    code: 'PHO_TRUONG_PHONG',
    name: 'Phó Trưởng phòng',
    level: 4,
    isLeadership: true,
    kpiProfile: 'LEADER',
    sortOrder: 6,
  },
  {
    code: 'PHO_CHANH_VAN_PHONG',
    name: 'Phó Chánh Văn phòng',
    level: 4,
    isLeadership: true,
    kpiProfile: 'LEADER',
    sortOrder: 7,
  },
  {
    code: 'CHUYEN_VIEN',
    name: 'Chuyên viên',
    level: 5,
    isLeadership: false,
    kpiProfile: 'STAFF',
    sortOrder: 8,
  },
  {
    code: 'NHAN_VIEN',
    name: 'Nhân viên',
    level: 5,
    isLeadership: false,
    kpiProfile: 'STAFF',
    sortOrder: 9,
  },
  {
    code: 'VAN_THU_LUU_TRU',
    name: 'Văn thư - Lưu trữ',
    level: 5,
    isLeadership: false,
    kpiProfile: 'STAFF',
    sortOrder: 10,
  },
];

export interface JobPositionSeed {
  code: string;
  name: string;
  group: JobPositionGroup;
}

export const JOB_POSITIONS: JobPositionSeed[] = [
  { code: 'VTVL-LD-BAN', name: 'Lãnh đạo Ban', group: 'LEADERSHIP' },
  { code: 'VTVL-LD-PHONG', name: 'Lãnh đạo, quản lý cấp phòng', group: 'LEADERSHIP' },
  { code: 'VTVL-CM-TCCB', name: 'Chuyên viên công tác tổ chức cán bộ', group: 'PROFESSIONAL' },
  {
    code: 'VTVL-CM-TCDDV',
    name: 'Chuyên viên công tác tổ chức đảng, đảng viên',
    group: 'PROFESSIONAL',
  },
  {
    code: 'VTVL-CM-BVCTNB',
    name: 'Chuyên viên công tác bảo vệ chính trị nội bộ',
    group: 'PROFESSIONAL',
  },
  { code: 'VTVL-CM-TONGHOP', name: 'Chuyên viên tổng hợp', group: 'PROFESSIONAL' },
  {
    code: 'VTVL-CM-CHINHSACH',
    name: 'Chuyên viên chính sách, bảo vệ sức khỏe cán bộ',
    group: 'PROFESSIONAL',
  },
  { code: 'VTVL-DC-KETOAN', name: 'Kế toán', group: 'SHARED_SUPPORT' },
  { code: 'VTVL-DC-VANTHU-HC', name: 'Văn thư, lưu trữ, hành chính', group: 'SHARED_SUPPORT' },
  { code: 'VTVL-DC-QUANTRI', name: 'Quản trị công sở', group: 'SHARED_SUPPORT' },
  { code: 'VTVL-DC-CNTT', name: 'Công nghệ thông tin, chuyển đổi số', group: 'SHARED_SUPPORT' },
];
