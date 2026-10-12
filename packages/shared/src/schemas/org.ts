/**
 * Schema tổ chức và nhân sự: đơn vị, chức vụ, vị trí việc làm, hồ sơ cán bộ, điều chuyển.
 */
import { z } from 'zod';
import {
  EMPLOYEE_STATUSES,
  GENDERS,
  JOB_POSITION_GROUPS,
  KPI_PROFILES,
  UNIT_TYPES,
} from '../enums.js';
import {
  codeField,
  dateOnly,
  optionalText,
  optionalUuid,
  pageParams,
  queryBoolean,
  requiredText,
  sortParam,
  uuid,
  versionField,
} from './common.js';

export const RECORD_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export type RecordStatus = (typeof RECORD_STATUSES)[number];

// ---------------- Đơn vị ----------------
export const unitListQuerySchema = z.object({ includeArchived: queryBoolean });

export const createUnitSchema = z.object({
  code: codeField('Mã đơn vị'),
  name: requiredText('Tên đơn vị', 300),
  shortName: optionalText('Tên viết tắt', 100),
  type: z.enum(UNIT_TYPES, { error: 'Loại đơn vị không hợp lệ' }),
  parentId: optionalUuid,
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});
export type CreateUnitInput = z.infer<typeof createUnitSchema>;

export const updateUnitSchema = createUnitSchema
  .omit({ code: true })
  .extend({ version: versionField });
export type UpdateUnitInput = z.infer<typeof updateUnitSchema>;

// ---------------- Chức vụ ----------------
export const createPositionSchema = z.object({
  code: codeField('Mã chức vụ'),
  name: requiredText('Tên chức vụ', 200),
  level: z.coerce
    .number({ error: 'Cấp chức vụ không hợp lệ' })
    .int()
    .min(1, 'Cấp từ 1 đến 5')
    .max(5, 'Cấp từ 1 đến 5'),
  isLeadership: z.boolean(),
  kpiProfile: z.enum(KPI_PROFILES, { error: 'Nhóm đánh giá không hợp lệ' }),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});
export type CreatePositionInput = z.infer<typeof createPositionSchema>;
export const updatePositionSchema = createPositionSchema
  .omit({ code: true })
  .extend({ version: versionField });
export type UpdatePositionInput = z.infer<typeof updatePositionSchema>;

// ---------------- Vị trí việc làm ----------------
export const createJobPositionSchema = z.object({
  code: codeField('Mã vị trí việc làm'),
  name: requiredText('Tên vị trí việc làm', 300),
  group: z.enum(JOB_POSITION_GROUPS, { error: 'Nhóm vị trí việc làm không hợp lệ' }),
  description: optionalText('Mô tả', 2000),
});
export type CreateJobPositionInput = z.infer<typeof createJobPositionSchema>;
export const updateJobPositionSchema = createJobPositionSchema
  .omit({ code: true })
  .extend({ version: versionField });
export type UpdateJobPositionInput = z.infer<typeof updateJobPositionSchema>;

export const catalogListQuerySchema = z.object({ includeArchived: queryBoolean });

// ---------------- Hồ sơ cán bộ ----------------
const phone = z
  .string()
  .transform((v) => v.replace(/[\s.]/g, ''))
  .pipe(z.string().regex(/^(\+?\d{8,15})?$/, 'Số điện thoại không hợp lệ'))
  .transform((v) => (v === '' ? null : v))
  .nullish();

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.union([z.literal(''), z.email({ error: 'Email không hợp lệ' })]))
  .transform((v) => (v === '' ? null : v))
  .nullish();

export const employeeProfileFields = {
  fullName: requiredText('Họ và tên', 200),
  gender: z
    .enum(GENDERS, { error: 'Giới tính không hợp lệ' })
    .nullish()
    .or(z.literal('').transform(() => null)),
  dateOfBirth: dateOnly.nullish().or(z.literal('').transform(() => null)),
  email,
  phone,
  partyPosition: optionalText('Chức vụ Đảng', 200),
  govPosition: optionalText('Chức vụ chính quyền', 200),
  unionPosition: optionalText('Chức vụ đoàn thể', 200),
};

export const assignmentFields = {
  unitId: uuid,
  positionId: uuid,
  jobPositionId: optionalUuid,
  managerEmployeeId: optionalUuid,
  startDate: dateOnly,
  duties: optionalText('Lĩnh vực, nhiệm vụ phụ trách', 4000),
  decisionRef: optionalText('Số quyết định', 200),
};

export const createEmployeeSchema = z.object({
  employeeCode: codeField('Mã cán bộ'),
  ...employeeProfileFields,
  assignment: z.object(assignmentFields),
});
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

export const updateEmployeeSchema = z.object({ ...employeeProfileFields, version: versionField });
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;

/**
 * Cán bộ tự cập nhật thông tin liên hệ của mình (docs/05 — "Thông tin cá nhân và vòng đời tài khoản").
 * Chỉ số điện thoại, email; các trường lý lịch, công tác do cán bộ tổng hợp cập nhật.
 */
export const updateOwnProfileSchema = z.object({ phone, email, version: versionField });
export type UpdateOwnProfileInput = z.infer<typeof updateOwnProfileSchema>;

/** Điều chuyển / thay đổi chức vụ: kết thúc phân công hiện tại, tạo phân công mới. */
export const transferEmployeeSchema = z.object({
  ...assignmentFields,
  note: optionalText('Ghi chú', 1000),
  version: versionField,
});
export type TransferEmployeeInput = z.infer<typeof transferEmployeeSchema>;

export const archiveEmployeeSchema = z.object({
  status: z.enum(['TRANSFERRED', 'RETIRED', 'ARCHIVED'] as const, {
    error: 'Trạng thái không hợp lệ',
  }),
  endDate: dateOnly,
  reason: requiredText('Lý do', 1000),
  version: versionField,
});
export type ArchiveEmployeeInput = z.infer<typeof archiveEmployeeSchema>;

export const employeeListQuerySchema = z.object({
  ...pageParams,
  unitId: uuid.optional(),
  positionId: uuid.optional(),
  jobPositionId: uuid.optional(),
  status: z.enum(EMPLOYEE_STATUSES).optional(),
  includeInactive: queryBoolean,
  sort: sortParam(['fullName', 'employeeCode', 'createdAt'] as const),
});
export type EmployeeListQuery = z.infer<typeof employeeListQuerySchema>;
