/**
 * Phạm vi dữ liệu (docs/05-phan-quyen.md §4.1, ADR-0004).
 * Phạm vi hiệu lực của một quyền = HỢP phạm vi của mọi vai trò được cấp có quyền đó.
 */
import type { PermissionCode } from '@kpi/shared';
import type { Prisma } from '../generated/prisma/client.js';
import type { AuthContext, DataScope } from './types.js';

export function resolveScope(auth: AuthContext, permission: PermissionCode): DataScope | null {
  const grants = auth.grants.filter((g) => g.permissions.has(permission));
  if (grants.length === 0) return null;

  const scope: DataScope = {
    all: false,
    unitIds: [],
    managerEmployeeId: null,
    selfEmployeeId: null,
  };
  const units = new Set<string>();
  for (const g of grants) {
    switch (g.scopeType) {
      case 'ALL':
        scope.all = true;
        break;
      case 'UNITS':
        for (const u of g.units) units.add(u.id);
        break;
      case 'OWN_UNIT':
        if (auth.employee?.unitId) units.add(auth.employee.unitId);
        break;
      case 'MANAGED':
        if (auth.employee) {
          scope.managerEmployeeId = auth.employee.id;
          scope.selfEmployeeId = auth.employee.id;
        }
        break;
      case 'SELF':
        if (auth.employee) scope.selfEmployeeId = auth.employee.id;
        break;
      case 'NONE':
        break;
    }
  }
  scope.unitIds = [...units];
  return scope;
}

/** Điều kiện Prisma lọc hồ sơ cán bộ theo phạm vi (dựa trên phân công chính đang hiệu lực). */
export function employeeScopeWhere(scope: DataScope): Prisma.EmployeeWhereInput {
  if (scope.all) return {};
  const or: Prisma.EmployeeWhereInput[] = [];
  if (scope.unitIds.length > 0) {
    or.push({
      assignments: { some: { isPrimary: true, endDate: null, unitId: { in: scope.unitIds } } },
    });
  }
  if (scope.managerEmployeeId) {
    or.push({
      assignments: {
        some: { isPrimary: true, endDate: null, managerEmployeeId: scope.managerEmployeeId },
      },
    });
  }
  if (scope.selfEmployeeId) or.push({ id: scope.selfEmployeeId });
  return or.length > 0 ? { OR: or } : { id: { in: [] } };
}

/**
 * Cán bộ có chức vụ THẤP hơn người thực hiện (positions.level lớn hơn) theo phân công chính đang hiệu lực.
 * Dùng cho nguyên tắc "cấp trên đánh giá cấp dưới" (docs/05).
 * Người thực hiện chưa có cấp chức vụ (không gắn cán bộ / chưa phân công) → không ai.
 */
export function subordinateEmployeeWhere(
  actorLevel: number | null | undefined,
): Prisma.EmployeeWhereInput {
  if (!actorLevel) return { id: { in: [] } };
  return {
    assignments: {
      some: { isPrimary: true, endDate: null, position: { level: { gt: actorLevel } } },
    },
  };
}

/** Đơn vị có nằm trong phạm vi "theo đơn vị" không (dùng khi tạo/điều chuyển cán bộ). */
export function scopeCoversUnit(scope: DataScope, unitId: string): boolean {
  return scope.all || scope.unitIds.includes(unitId);
}
