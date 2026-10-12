import { describe, expect, it } from 'vitest';
import { ROLE_CODES } from './enums.js';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSION_CODES } from './permissions.js';

describe('DEFAULT_ROLE_PERMISSIONS', () => {
  it('khai báo đủ cho mọi vai trò', () => {
    expect(Object.keys(DEFAULT_ROLE_PERMISSIONS).sort()).toEqual([...ROLE_CODES].sort());
  });

  it('chỉ dùng mã quyền có trong danh mục và không trùng lặp', () => {
    for (const [role, perms] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      expect(new Set(perms).size, `trùng quyền ở ${role}`).toBe(perms.length);
      for (const p of perms) expect(PERMISSION_CODES).toContain(p);
    }
  });

  it('Quản trị hệ thống không có quyền đọc dữ liệu nghiệp vụ (tách bạch nhiệm vụ)', () => {
    const admin = DEFAULT_ROLE_PERMISSIONS.SUPER_ADMIN;
    for (const p of [
      'evaluation.read',
      'evidence.read',
      'employee.read',
      'report.read',
      'dashboard.read',
    ] as const) {
      expect(admin).not.toContain(p);
    }
  });

  it('chỉ Lãnh đạo cơ quan được phê duyệt, mở lại và xác nhận quy tắc', () => {
    for (const p of ['evaluation.approve', 'evaluation.reopen', 'ruleset.confirm'] as const) {
      const holders = Object.entries(DEFAULT_ROLE_PERMISSIONS)
        .filter(([, perms]) => perms.includes(p))
        .map(([role]) => role);
      expect(holders).toEqual(['AGENCY_LEADER']);
    }
  });
});
