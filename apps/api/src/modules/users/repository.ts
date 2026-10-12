import type { ScopeType, UserListQuery } from '@kpi/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Db } from '../../lib/prisma.js';

export const USER_INCLUDE = {
  employee: { select: { id: true, employeeCode: true, fullName: true } },
  roles: {
    include: {
      role: { select: { id: true, code: true, name: true } },
      units: { include: { unit: { select: { id: true, code: true, name: true } } } },
    },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.UserInclude;

export type UserRecord = Prisma.UserGetPayload<{ include: typeof USER_INCLUDE }>;

export function createUsersRepository(db: Db) {
  return {
    async list(query: UserListQuery) {
      const where: Prisma.UserWhereInput = {
        ...(query.status ? { status: query.status } : {}),
        ...(query.roleCode ? { roles: { some: { role: { code: query.roleCode } } } } : {}),
        ...(query.q
          ? {
              OR: [
                { username: { contains: query.q, mode: 'insensitive' } },
                { displayName: { contains: query.q, mode: 'insensitive' } },
                { employee: { fullName: { contains: query.q, mode: 'insensitive' } } },
                { employee: { employeeCode: { contains: query.q, mode: 'insensitive' } } },
              ],
            }
          : {}),
      };
      // `nulls` chỉ hợp lệ với cột cho phép NULL (lastLoginAt) — Prisma báo lỗi nếu dùng cho cột bắt buộc.
      const orderBy: Prisma.UserOrderByWithRelationInput = !query.sort
        ? { username: 'asc' }
        : query.sort.field === 'lastLoginAt'
          ? { lastLoginAt: { sort: query.sort.dir, nulls: 'last' } }
          : { [query.sort.field]: query.sort.dir };
      const [items, total] = await db.$transaction([
        db.user.findMany({
          where,
          include: USER_INCLUDE,
          orderBy: [orderBy, { id: 'asc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        db.user.count({ where }),
      ]);
      return { items, total };
    },

    findById(id: string) {
      return db.user.findUnique({ where: { id }, include: USER_INCLUDE });
    },

    create(data: {
      username: string;
      displayName: string | null;
      employeeId: string | null;
      passwordHash: string;
    }) {
      return db.user.create({ data: { ...data, mustChangePassword: true }, include: USER_INCLUDE });
    },

    /** Cập nhật có kiểm tra phiên bản; trả về số bản ghi cập nhật (0 = xung đột/không tồn tại). */
    async updateVersioned(
      id: string,
      version: number,
      data: Prisma.UserUpdateManyMutationInput & { employeeId?: string | null },
    ) {
      const { count } = await db.user.updateMany({
        where: { id, version },
        data: { ...data, version: { increment: 1 } },
      });
      return count;
    },

    setStatus(id: string, status: 'ACTIVE' | 'LOCKED' | 'DISABLED') {
      return db.user.update({
        where: { id },
        data: {
          status,
          ...(status === 'ACTIVE' ? { failedLoginCount: 0, lockedUntil: null } : {}),
          version: { increment: 1 },
        },
        include: USER_INCLUDE,
      });
    },

    resetPassword(id: string, passwordHash: string) {
      return db.user.update({
        where: { id },
        data: {
          passwordHash,
          mustChangePassword: true,
          failedLoginCount: 0,
          lockedUntil: null,
          passwordChangedAt: new Date(),
          version: { increment: 1 },
        },
        include: USER_INCLUDE,
      });
    },

    findRole(id: string) {
      return db.role.findUnique({ where: { id } });
    },

    activeUnits(ids: string[]) {
      return db.organizationalUnit.findMany({ where: { id: { in: ids }, status: 'ACTIVE' } });
    },

    grantRole(input: {
      userId: string;
      roleId: string;
      scopeType: ScopeType;
      unitIds: string[];
      grantedById: string;
    }) {
      return db.userRole.create({
        data: {
          userId: input.userId,
          roleId: input.roleId,
          scopeType: input.scopeType,
          grantedById: input.grantedById,
          units: { create: input.unitIds.map((unitId) => ({ unitId })) },
        },
      });
    },

    findGrant(id: string) {
      return db.userRole.findUnique({ where: { id }, include: { role: true, units: true } });
    },

    deleteGrant(id: string) {
      return db.userRole.delete({ where: { id } });
    },

    /** Số tài khoản ACTIVE đang giữ vai trò SUPER_ADMIN (trừ một tài khoản nếu chỉ định). */
    countActiveSuperAdmins(excludeUserId?: string) {
      return db.user.count({
        where: {
          status: 'ACTIVE',
          ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
          roles: { some: { role: { code: 'SUPER_ADMIN' } } },
        },
      });
    },

    employeeExists(id: string) {
      return db.employee.findFirst({ where: { id, status: 'WORKING' }, select: { id: true } });
    },

    /** Danh sách cán bộ để gắn tài khoản — chỉ trường định danh (docs/05 §4.2). */
    employeeOptions(q: string | undefined) {
      return db.employee.findMany({
        where: {
          status: 'WORKING',
          ...(q
            ? {
                OR: [
                  { fullName: { contains: q, mode: 'insensitive' } },
                  { employeeCode: { contains: q, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        select: {
          id: true,
          employeeCode: true,
          fullName: true,
          assignments: {
            where: { isPrimary: true, endDate: null },
            select: { unit: { select: { name: true } } },
            take: 1,
          },
        },
        orderBy: { fullName: 'asc' },
        take: 20,
      });
    },
  };
}
