/**
 * Schema quản trị: tài khoản người dùng, vai trò, phân quyền phạm vi dữ liệu.
 */
import { z } from 'zod';
import { SCOPE_TYPES } from '../enums.js';
import { PERMISSION_CODES } from '../permissions.js';
import { checkPasswordStrength, usernameField } from './auth.js';
import {
  codeField,
  optionalText,
  optionalUuid,
  pageParams,
  requiredText,
  sortParam,
  uuid,
  versionField,
} from './common.js';

export const USER_STATUSES = ['ACTIVE', 'LOCKED', 'DISABLED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];
export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  ACTIVE: 'Đang hoạt động',
  LOCKED: 'Bị khóa',
  DISABLED: 'Ngừng sử dụng',
};

export const userListQuerySchema = z.object({
  ...pageParams,
  status: z.enum(USER_STATUSES).optional(),
  roleCode: z.string().max(50).optional(),
  sort: sortParam(['username', 'createdAt', 'lastLoginAt'] as const),
});
export type UserListQuery = z.infer<typeof userListQuerySchema>;

export const createUserSchema = z
  .object({
    username: usernameField,
    displayName: optionalText('Tên hiển thị', 200),
    employeeId: optionalUuid,
    /** Bỏ trống → hệ thống sinh mật khẩu tạm ngẫu nhiên và trả về MỘT LẦN. */
    initialPassword: z
      .string()
      .max(128)
      .optional()
      .or(z.literal('').transform(() => undefined)),
  })
  .superRefine((v, ctx) => {
    if (!v.employeeId && !v.displayName) {
      ctx.addIssue({
        code: 'custom',
        path: ['displayName'],
        message: 'Nhập tên hiển thị hoặc chọn cán bộ gắn với tài khoản',
      });
    }
    if (v.initialPassword) {
      for (const msg of checkPasswordStrength(v.initialPassword, v.username)) {
        ctx.addIssue({ code: 'custom', path: ['initialPassword'], message: msg });
      }
    }
  });
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  displayName: optionalText('Tên hiển thị', 200),
  employeeId: optionalUuid.optional(),
  version: versionField,
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const userStatusActionSchema = z.object({
  reason: requiredText('Lý do', 500),
});

export const grantRoleSchema = z
  .object({
    roleId: uuid,
    scopeType: z.enum(SCOPE_TYPES),
    unitIds: z.array(uuid).max(50).default([]),
  })
  .superRefine((v, ctx) => {
    if (v.scopeType === 'UNITS' && v.unitIds.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['unitIds'],
        message: 'Phạm vi "Các đơn vị" cần chọn ít nhất 1 đơn vị',
      });
    }
    if (v.scopeType !== 'UNITS' && v.unitIds.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['unitIds'],
        message: 'Chỉ chọn đơn vị khi phạm vi là "Các đơn vị"',
      });
    }
  });
export type GrantRoleInput = z.infer<typeof grantRoleSchema>;

export const createRoleSchema = z.object({
  code: codeField('Mã vai trò', 50),
  name: requiredText('Tên vai trò', 200),
  description: optionalText('Mô tả', 1000),
  permissions: z
    .array(z.enum(PERMISSION_CODES as [string, ...string[]]))
    .max(200)
    .default([]),
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = z.object({
  name: requiredText('Tên vai trò', 200),
  description: optionalText('Mô tả', 1000),
  permissions: z.array(z.enum(PERMISSION_CODES as [string, ...string[]])).max(200),
});
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
