/**
 * Nạp thông tin người dùng, vai trò, quyền và phạm vi cho một phiên hợp lệ.
 * Đọc từ DB mỗi request → thay đổi quyền/khóa tài khoản có hiệu lực ngay.
 */
import type { PermissionCode, ScopeType } from '@kpi/shared';
import type { Db } from '../lib/prisma.js';
import type { AuthContext, AuthEmployee, AuthGrant } from './types.js';

export async function loadAuthContext(
  db: Db,
  session: { id: string; userId: string; expiresAt: Date; csrfTokenHash: string },
): Promise<AuthContext | null> {
  const now = new Date();
  const user = await db.user.findUnique({
    where: { id: session.userId },
    include: {
      employee: {
        include: {
          assignments: {
            where: { isPrimary: true, endDate: null },
            include: { unit: { select: { id: true, name: true } } },
            take: 1,
          },
        },
      },
      roles: {
        where: { validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gt: now } }] },
        include: {
          role: {
            include: { permissions: { include: { permission: { select: { code: true } } } } },
          },
          units: { include: { unit: { select: { id: true, code: true, name: true } } } },
        },
      },
    },
  });
  if (!user || user.status !== 'ACTIVE') return null;

  const grants: AuthGrant[] = user.roles.map((ur) => ({
    id: ur.id,
    roleId: ur.roleId,
    roleCode: ur.role.code,
    roleName: ur.role.name,
    scopeType: ur.scopeType as ScopeType,
    units: ur.units.map((u) => u.unit),
    permissions: new Set(ur.role.permissions.map((rp) => rp.permission.code as PermissionCode)),
  }));
  const permissions = new Set<PermissionCode>();
  for (const g of grants) for (const p of g.permissions) permissions.add(p);

  let employee: AuthEmployee | null = null;
  if (user.employee && user.employee.status === 'WORKING') {
    const current = user.employee.assignments[0];
    employee = {
      id: user.employee.id,
      employeeCode: user.employee.employeeCode,
      fullName: user.employee.fullName,
      unitId: current?.unit.id ?? null,
      unitName: current?.unit.name ?? null,
    };
  }

  return {
    sessionId: session.id,
    sessionExpiresAt: session.expiresAt,
    csrfTokenHash: session.csrfTokenHash,
    userId: user.id,
    username: user.username,
    displayName: user.employee?.fullName ?? user.displayName ?? user.username,
    mustChangePassword: user.mustChangePassword,
    employee,
    grants,
    permissions,
  };
}
