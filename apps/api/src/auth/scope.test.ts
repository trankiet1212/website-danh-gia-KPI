import { describe, expect, it } from 'vitest';
import type { PermissionCode, ScopeType } from '@kpi/shared';
import { employeeScopeWhere, resolveScope, scopeCoversUnit } from './scope.js';
import type { AuthContext, AuthGrant } from './types.js';

function grant(scopeType: ScopeType, perms: PermissionCode[], unitIds: string[] = []): AuthGrant {
  return {
    id: `g-${scopeType}`,
    roleId: 'r',
    roleCode: 'R',
    roleName: 'R',
    scopeType,
    units: unitIds.map((id) => ({ id, code: id, name: id })),
    permissions: new Set(perms),
  };
}

function auth(grants: AuthGrant[], employee: AuthContext['employee'] = null): AuthContext {
  return {
    sessionId: 's',
    sessionExpiresAt: new Date(),
    csrfTokenHash: 'x',
    userId: 'u',
    username: 'u',
    displayName: 'U',
    mustChangePassword: false,
    employee,
    grants,
    permissions: new Set(grants.flatMap((g) => [...g.permissions])),
  };
}

const me = {
  id: 'emp-me',
  employeeCode: 'C',
  fullName: 'Tôi',
  unitId: 'unit-me',
  unitName: 'Phòng',
};

describe('resolveScope', () => {
  it('null khi không vai trò nào có quyền', () => {
    expect(resolveScope(auth([grant('ALL', ['org.read'])]), 'employee.read')).toBeNull();
  });

  it('hợp phạm vi của nhiều vai trò cùng có quyền', () => {
    const scope = resolveScope(
      auth([grant('UNITS', ['employee.read'], ['u1', 'u2']), grant('SELF', ['employee.read'])], me),
      'employee.read',
    )!;
    expect(scope).toEqual({
      all: false,
      unitIds: ['u1', 'u2'],
      managerEmployeeId: null,
      selfEmployeeId: 'emp-me',
    });
  });

  it('chỉ tính vai trò có quyền đang xét (vai trò khác không mở rộng phạm vi)', () => {
    const scope = resolveScope(
      auth([grant('ALL', ['org.read']), grant('SELF', ['employee.read'])], me),
      'employee.read',
    )!;
    expect(scope.all).toBe(false);
    expect(scope.selfEmployeeId).toBe('emp-me');
  });

  it('OWN_UNIT dùng đơn vị của phân công hiện tại; MANAGED gồm bản thân và cấp dưới trực tiếp', () => {
    const scope = resolveScope(
      auth([grant('OWN_UNIT', ['employee.read']), grant('MANAGED', ['employee.read'])], me),
      'employee.read',
    )!;
    expect(scope.unitIds).toEqual(['unit-me']);
    expect(scope.managerEmployeeId).toBe('emp-me');
    expect(scope.selfEmployeeId).toBe('emp-me');
  });

  it('tài khoản không gắn hồ sơ cán bộ: OWN_UNIT/SELF không mở ra dữ liệu nào', () => {
    const scope = resolveScope(
      auth([grant('OWN_UNIT', ['employee.read']), grant('SELF', ['employee.read'])]),
      'employee.read',
    )!;
    expect(employeeScopeWhere(scope)).toEqual({ id: { in: [] } });
  });
});

describe('employeeScopeWhere / scopeCoversUnit', () => {
  it('ALL → không lọc', () => {
    expect(
      employeeScopeWhere({ all: true, unitIds: [], managerEmployeeId: null, selfEmployeeId: null }),
    ).toEqual({});
  });

  it('kết hợp các điều kiện bằng OR', () => {
    const where = employeeScopeWhere({
      all: false,
      unitIds: ['u1'],
      managerEmployeeId: 'm',
      selfEmployeeId: 'm',
    });
    expect(where.OR).toHaveLength(3);
  });

  it('scopeCoversUnit chỉ đúng với ALL hoặc đơn vị trong danh sách', () => {
    expect(
      scopeCoversUnit(
        { all: true, unitIds: [], managerEmployeeId: null, selfEmployeeId: null },
        'x',
      ),
    ).toBe(true);
    expect(
      scopeCoversUnit(
        { all: false, unitIds: ['a'], managerEmployeeId: null, selfEmployeeId: null },
        'b',
      ),
    ).toBe(false);
  });
});
