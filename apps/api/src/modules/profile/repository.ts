/**
 * Hồ sơ cá nhân của người đang đăng nhập. Phạm vi luôn là BẢN THÂN: mọi truy vấn lọc theo
 * `userId` của phiên đăng nhập (không nhận id từ client) — tương đương scope SELF (ADR-0004).
 */
import type { Prisma } from '../../generated/prisma/client.js';
import type { Db } from '../../lib/prisma.js';
import { ASSIGNMENT_INCLUDE, type Tx } from '../employees/repository.js';

const OWN_PROFILE_SELECT = {
  username: true,
  status: true,
  createdAt: true,
  lastLoginAt: true,
  passwordChangedAt: true,
  employee: {
    include: {
      assignments: {
        where: { isPrimary: true, endDate: null },
        include: ASSIGNMENT_INCLUDE,
        take: 1,
      },
    },
  },
} satisfies Prisma.UserSelect;

export type OwnProfileRow = Prisma.UserGetPayload<{ select: typeof OWN_PROFILE_SELECT }>;

export function createProfileRepository(db: Db) {
  return {
    findOwn(userId: string) {
      return db.user.findUnique({ where: { id: userId }, select: OWN_PROFILE_SELECT });
    },

    findEmailOwner(email: string, excludeEmployeeId: string) {
      return db.employee.findFirst({
        where: { email: { equals: email, mode: 'insensitive' }, id: { not: excludeEmployeeId } },
        select: { id: true },
      });
    },

    /**
     * Cập nhật thông tin liên hệ — chỉ khi hồ sơ còn công tác và đúng phiên bản.
     * Ghi audit trong cùng transaction. Trả về false nếu xung đột phiên bản / không còn công tác.
     */
    updateContact(
      employeeId: string,
      version: number,
      data: { phone?: string | null; email?: string | null },
      onWrite: (tx: Tx) => Promise<void>,
    ) {
      return db.$transaction(async (tx) => {
        const { count } = await tx.employee.updateMany({
          where: { id: employeeId, version, status: 'WORKING' },
          data: { ...data, version: { increment: 1 } },
        });
        if (count === 0) return false;
        await onWrite(tx);
        return true;
      });
    },
  };
}
