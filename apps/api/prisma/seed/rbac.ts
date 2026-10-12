/**
 * Danh mục quyền và vai trò hệ thống (nguồn: packages/shared/src/permissions.ts, docs/05-phan-quyen.md).
 * Idempotent; chỉ BỔ SUNG quyền mặc định còn thiếu, không gỡ quyền quản trị đã điều chỉnh.
 * Dùng chung cho seed và kiểm thử tích hợp.
 */
import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSIONS,
  ROLE_CODES,
  ROLE_LABELS,
  permissionModule,
} from '@kpi/shared';
import type { PermissionCode } from '@kpi/shared';
import type { Db } from '../../src/lib/prisma.js';

type Tx = Parameters<Parameters<Db['$transaction']>[0]>[0];

export async function seedPermissionsAndRoles(tx: Tx | Db): Promise<void> {
  for (const [code, description] of Object.entries(PERMISSIONS)) {
    await tx.permission.upsert({
      where: { code },
      update: { description, module: permissionModule(code as PermissionCode) },
      create: { code, description, module: permissionModule(code as PermissionCode) },
    });
  }
  const permIdByCode = new Map((await tx.permission.findMany()).map((p) => [p.code, p.id]));

  for (const code of ROLE_CODES) {
    const role = await tx.role.upsert({
      where: { code },
      update: { name: ROLE_LABELS[code], isSystem: true },
      create: { code, name: ROLE_LABELS[code], isSystem: true },
    });
    // Chỉ BỔ SUNG quyền mặc định còn thiếu; không gỡ quyền đã được quản trị điều chỉnh.
    await tx.rolePermission.createMany({
      data: DEFAULT_ROLE_PERMISSIONS[code].map((p) => ({
        roleId: role.id,
        permissionId: permIdByCode.get(p)!,
      })),
      skipDuplicates: true,
    });
  }
}
