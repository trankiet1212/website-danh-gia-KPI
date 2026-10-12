/**
 * Truy vấn hồ sơ cán bộ. MỌI hàm đọc nhận `scopeWhere` (phạm vi dữ liệu của người dùng) — ADR-0004.
 */
import type { EmployeeListQuery } from '@kpi/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Db } from '../../lib/prisma.js';

export const ASSIGNMENT_INCLUDE = {
  unit: { select: { id: true, code: true, name: true } },
  position: { select: { id: true, code: true, name: true, level: true } },
  jobPosition: { select: { id: true, code: true, name: true } },
  manager: { select: { id: true, employeeCode: true, fullName: true } },
} satisfies Prisma.EmployeeAssignmentInclude;

const LIST_INCLUDE = {
  assignments: {
    where: { isPrimary: true, endDate: null },
    include: ASSIGNMENT_INCLUDE,
    take: 1,
  },
  user: { select: { id: true } },
} satisfies Prisma.EmployeeInclude;

const DETAIL_INCLUDE = {
  assignments: {
    include: ASSIGNMENT_INCLUDE,
    orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
  },
  user: { select: { id: true } },
} satisfies Prisma.EmployeeInclude;

export type EmployeeListRow = Prisma.EmployeeGetPayload<{ include: typeof LIST_INCLUDE }>;
export type EmployeeDetailRow = Prisma.EmployeeGetPayload<{ include: typeof DETAIL_INCLUDE }>;
export type Tx = Parameters<Parameters<Db['$transaction']>[0]>[0];

export function createEmployeesRepository(db: Db) {
  return {
    async list(scopeWhere: Prisma.EmployeeWhereInput, query: EmployeeListQuery) {
      const currentAssignment = (
        extra: Prisma.EmployeeAssignmentWhereInput,
      ): Prisma.EmployeeWhereInput => ({
        assignments: { some: { isPrimary: true, endDate: null, ...extra } },
      });
      const filters: Prisma.EmployeeWhereInput[] = [scopeWhere];
      if (query.status) filters.push({ status: query.status });
      else if (!query.includeInactive) filters.push({ status: 'WORKING' });
      if (query.unitId) filters.push(currentAssignment({ unitId: query.unitId }));
      if (query.positionId) filters.push(currentAssignment({ positionId: query.positionId }));
      if (query.jobPositionId)
        filters.push(currentAssignment({ jobPositionId: query.jobPositionId }));
      if (query.q) {
        filters.push({
          OR: [
            { fullName: { contains: query.q, mode: 'insensitive' } },
            { employeeCode: { contains: query.q, mode: 'insensitive' } },
            { email: { contains: query.q, mode: 'insensitive' } },
          ],
        });
      }
      const where: Prisma.EmployeeWhereInput = { AND: filters };
      const orderBy: Prisma.EmployeeOrderByWithRelationInput = query.sort
        ? { [query.sort.field]: query.sort.dir }
        : { fullName: 'asc' };

      const [items, total] = await db.$transaction([
        db.employee.findMany({
          where,
          include: LIST_INCLUDE,
          orderBy: [orderBy, { id: 'asc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        db.employee.count({ where }),
      ]);
      return { items, total };
    },

    findInScope(id: string, scopeWhere: Prisma.EmployeeWhereInput) {
      return db.employee.findFirst({
        where: { AND: [{ id }, scopeWhere] },
        include: DETAIL_INCLUDE,
      });
    },

    existsInScope(id: string, scopeWhere: Prisma.EmployeeWhereInput) {
      return db.employee.count({ where: { AND: [{ id }, scopeWhere] } }).then((n) => n > 0);
    },

    findByCode(employeeCode: string) {
      return db.employee.findUnique({ where: { employeeCode }, select: { id: true } });
    },

    findByEmail(email: string, excludeId?: string) {
      return db.employee.findFirst({
        where: {
          email: { equals: email, mode: 'insensitive' },
          ...(excludeId ? { id: { not: excludeId } } : {}),
        },
        select: { id: true, employeeCode: true },
      });
    },

    activeUnit: (id: string) =>
      db.organizationalUnit.findFirst({ where: { id, status: 'ACTIVE' } }),
    activePosition: (id: string) => db.position.findFirst({ where: { id, status: 'ACTIVE' } }),
    activeJobPosition: (id: string) =>
      db.jobPosition.findFirst({ where: { id, status: 'ACTIVE' } }),
    workingEmployee: (id: string) =>
      db.employee.findFirst({ where: { id, status: 'WORKING' }, select: { id: true } }),

    // ------------------------------------------------------------------
    // Ghi dữ liệu — mỗi thao tác là một transaction; `onWrite(tx)` dùng để ghi audit
    // trong CÙNG transaction (không có thay đổi nào "mất dấu").
    // ------------------------------------------------------------------

    createWithAssignment(
      employee: Prisma.EmployeeUncheckedCreateInput,
      assignment: Omit<Prisma.EmployeeAssignmentUncheckedCreateInput, 'employeeId'>,
      onWrite: (tx: Tx, employeeId: string) => Promise<void>,
    ) {
      return db.$transaction(async (tx) => {
        const created = await tx.employee.create({ data: employee });
        await tx.employeeAssignment.create({
          data: { ...assignment, employeeId: created.id, isPrimary: true },
        });
        await onWrite(tx, created.id);
        return created.id;
      });
    },

    /** Cập nhật thông tin cá nhân có kiểm tra phiên bản. Trả về false nếu xung đột. */
    updateProfile(
      id: string,
      version: number,
      data: Prisma.EmployeeUpdateManyMutationInput,
      onWrite: (tx: Tx) => Promise<void>,
    ) {
      return db.$transaction(async (tx) => {
        const { count } = await tx.employee.updateMany({
          where: { id, version },
          data: { ...data, version: { increment: 1 } },
        });
        if (count === 0) return false;
        await onWrite(tx);
        return true;
      });
    },

    /**
     * Điều chuyển: kết thúc phân công chính hiện tại (end_date = ngày trước ngày bắt đầu mới)
     * và tạo phân công chính mới — trong cùng transaction.
     */
    transfer(input: {
      employeeId: string;
      version: number;
      currentAssignmentId: string;
      closeOn: Date;
      next: Omit<Prisma.EmployeeAssignmentUncheckedCreateInput, 'employeeId'>;
      onWrite: (tx: Tx) => Promise<void>;
    }) {
      return db.$transaction(async (tx) => {
        const { count } = await tx.employee.updateMany({
          where: { id: input.employeeId, version: input.version, status: 'WORKING' },
          data: { version: { increment: 1 } },
        });
        if (count === 0) return false;
        await tx.employeeAssignment.update({
          where: { id: input.currentAssignmentId },
          data: { endDate: input.closeOn },
        });
        await tx.employeeAssignment.create({
          data: { ...input.next, employeeId: input.employeeId, isPrimary: true },
        });
        await input.onWrite(tx);
        return true;
      });
    },

    /** Kết thúc công tác (điều chuyển ra ngoài / nghỉ hưu / lưu trữ): đóng phân công, khóa tài khoản liên kết. */
    endEmployment(input: {
      employeeId: string;
      version: number;
      status: 'TRANSFERRED' | 'RETIRED' | 'ARCHIVED';
      endDate: Date;
      onWrite: (tx: Tx, revokedSessions: number) => Promise<void>;
    }) {
      return db.$transaction(async (tx) => {
        const { count } = await tx.employee.updateMany({
          where: { id: input.employeeId, version: input.version, status: 'WORKING' },
          data: { status: input.status, version: { increment: 1 } },
        });
        if (count === 0) return false;
        await tx.employeeAssignment.updateMany({
          where: { employeeId: input.employeeId, endDate: null },
          data: { endDate: input.endDate },
        });
        const user = await tx.user.findUnique({ where: { employeeId: input.employeeId } });
        let revoked = 0;
        if (user) {
          await tx.user.update({
            where: { id: user.id },
            data: { status: 'DISABLED', version: { increment: 1 } },
          });
          revoked = (
            await tx.session.updateMany({
              where: { userId: user.id, revokedAt: null },
              data: { revokedAt: new Date() },
            })
          ).count;
        }
        await input.onWrite(tx, revoked);
        return true;
      });
    },
  };
}
