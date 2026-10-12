import type { Db } from '../../lib/prisma.js';

const ROLE_INCLUDE = {
  permissions: { include: { permission: { select: { code: true } } } },
  _count: { select: { userRoles: true } },
} as const;

export function createRolesRepository(db: Db) {
  return {
    list() {
      return db.role.findMany({
        include: ROLE_INCLUDE,
        orderBy: [{ isSystem: 'desc' }, { code: 'asc' }],
      });
    },
    findById(id: string) {
      return db.role.findUnique({ where: { id }, include: ROLE_INCLUDE });
    },
    listPermissions() {
      return db.permission.findMany({ orderBy: [{ module: 'asc' }, { code: 'asc' }] });
    },
    permissionIds(codes: string[]) {
      return db.permission.findMany({
        where: { code: { in: codes } },
        select: { id: true, code: true },
      });
    },
    create(data: {
      code: string;
      name: string;
      description: string | null;
      permissionIds: string[];
    }) {
      return db.role.create({
        data: {
          code: data.code,
          name: data.name,
          description: data.description,
          permissions: { create: data.permissionIds.map((permissionId) => ({ permissionId })) },
        },
        include: ROLE_INCLUDE,
      });
    },
    /** Thay toàn bộ danh sách quyền của vai trò trong một transaction. */
    update(
      id: string,
      data: { name: string; description: string | null; permissionIds: string[] },
    ) {
      return db.$transaction(async (tx) => {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        await tx.rolePermission.createMany({
          data: data.permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
        });
        return tx.role.update({
          where: { id },
          data: { name: data.name, description: data.description },
          include: ROLE_INCLUDE,
        });
      });
    },
    delete(id: string) {
      return db.role.delete({ where: { id } });
    },
  };
}
