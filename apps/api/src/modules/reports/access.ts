/**
 * Phạm vi dữ liệu khi xem/in/xuất báo cáo: lấy theo đúng quyền đang dùng
 * (dashboard.read | report.read | report.export) — docs/04 "Thiết kế triển khai GĐ6".
 */
import type { PermissionCode } from '@kpi/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { employeeScopeWhere, resolveScope } from '../../auth/scope.js';
import type { AuthContext, DataScope } from '../../auth/types.js';
import { evaluationScopeWhere } from '../evaluations/service.js';
import { objectiveScopeWhere } from '../objectives/service.js';

export interface DataAccess {
  scope: DataScope | null;
  evaluations: Prisma.EvaluationRecordWhereInput;
  employees: Prisma.EmployeeWhereInput;
  objectives: Prisma.ObjectiveWhereInput;
  label: string;
  /** Được xem số liệu theo đơn vị này không (toàn cơ quan, đơn vị được giao, hoặc đơn vị của chính mình). */
  canSeeUnit: (unitId: string) => boolean;
}

/** Mô tả phạm vi bằng lời (ghi vào báo cáo, file xuất). */
export function scopeLabel(auth: AuthContext, perm: PermissionCode): string {
  const parts = new Set<string>();
  for (const g of auth.grants.filter((x) => x.permissions.has(perm))) {
    if (g.scopeType === 'ALL') return 'Toàn cơ quan';
    if (g.scopeType === 'UNITS') for (const u of g.units) parts.add(u.name);
    if (g.scopeType === 'OWN_UNIT' && auth.employee?.unitName) parts.add(auth.employee.unitName);
    if (g.scopeType === 'MANAGED') parts.add('cán bộ do mình quản lý trực tiếp');
    if (g.scopeType === 'SELF') parts.add('bản thân');
  }
  return parts.size > 0 ? [...parts].join('; ') : 'Không có';
}

export function dataAccess(auth: AuthContext, perm: PermissionCode): DataAccess {
  const scope = resolveScope(auth, perm);
  const none = { id: { in: [] as string[] } };
  return {
    scope,
    evaluations: evaluationScopeWhere(scope),
    employees: scope ? employeeScopeWhere(scope) : none,
    objectives: objectiveScopeWhere(scope, auth.employee?.unitId ?? null),
    label: scopeLabel(auth, perm),
    canSeeUnit: (unitId) =>
      !!scope && (scope.all || scope.unitIds.includes(unitId) || auth.employee?.unitId === unitId),
  };
}
