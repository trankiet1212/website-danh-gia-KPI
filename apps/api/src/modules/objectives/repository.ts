import type { Prisma } from '../../generated/prisma/client.js';
import type { Db } from '../../lib/prisma.js';

export const OBJECTIVE_INCLUDE = {
  period: { select: { id: true, code: true, name: true } },
  ownerEmployee: { select: { id: true, fullName: true, employeeCode: true } },
  ownerUnit: { select: { id: true, name: true } },
  keyResults: {
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    include: { checkins: { orderBy: { checkedAt: 'desc' }, take: 20 } },
  },
} satisfies Prisma.ObjectiveInclude;
export type ObjectiveRow = Prisma.ObjectiveGetPayload<{ include: typeof OBJECTIVE_INCLUDE }>;

export function createObjectivesRepository(db: Db) {
  return {
    list(where: Prisma.ObjectiveWhereInput) {
      return db.objective.findMany({
        where,
        include: OBJECTIVE_INCLUDE,
        orderBy: [{ period: { startDate: 'desc' } }, { code: 'asc' }],
        take: 500,
      });
    },
    find(id: string, where: Prisma.ObjectiveWhereInput) {
      return db.objective.findFirst({
        where: { AND: [{ id }, where] },
        include: OBJECTIVE_INCLUDE,
      });
    },
    count(where: Prisma.ObjectiveWhereInput) {
      return db.objective.count({ where });
    },
    findKeyResult(id: string, objectiveWhere: Prisma.ObjectiveWhereInput) {
      return db.keyResult.findFirst({ where: { id, objective: objectiveWhere } });
    },
    periodExists(id: string) {
      return db.evaluationPeriod.count({ where: { id } }).then((n) => n > 0);
    },
    employeeExists(id: string) {
      return db.employee.count({ where: { id } }).then((n) => n > 0);
    },
    employeeInScope(id: string, where: Prisma.EmployeeWhereInput) {
      return db.employee.count({ where: { AND: [{ id }, where] } }).then((n) => n > 0);
    },
    unitExists(id: string) {
      return db.organizationalUnit.count({ where: { id } }).then((n) => n > 0);
    },
    create(data: Prisma.ObjectiveUncheckedCreateInput) {
      return db.objective.create({ data });
    },
    /** Cập nhật có kiểm tra phiên bản; `onWrite` (ghi nhật ký) chạy trong CÙNG transaction. */
    updateVersioned(
      id: string,
      version: number,
      data: Prisma.ObjectiveUncheckedUpdateManyInput,
      onWrite?: (tx: Prisma.TransactionClient) => Promise<void>,
    ) {
      return db.$transaction(async (tx) => {
        const { count } = await tx.objective.updateMany({
          where: { id, version },
          data: { ...data, version: { increment: 1 } },
        });
        if (count > 0 && onWrite) await onWrite(tx);
        return count;
      });
    },
    createKeyResult(data: Prisma.KeyResultUncheckedCreateInput) {
      return db.keyResult.create({ data });
    },
    /** Cập nhật có kiểm tra phiên bản; `onWrite` (ghi nhật ký) chạy trong CÙNG transaction. */
    updateKeyResultVersioned(
      id: string,
      version: number,
      data: Prisma.KeyResultUncheckedUpdateManyInput,
      onWrite?: (tx: Prisma.TransactionClient) => Promise<void>,
    ) {
      return db.$transaction(async (tx) => {
        const { count } = await tx.keyResult.updateMany({
          where: { id, version },
          data: { ...data, version: { increment: 1 } },
        });
        if (count > 0 && onWrite) await onWrite(tx);
        return count;
      });
    },
    /** Ghi một lần cập nhật kết quả (append-only) và cập nhật giá trị hiện tại của KR. */
    checkin(
      keyResultId: string,
      value: number,
      note: string | null,
      userId: string,
      onWrite: (tx: Prisma.TransactionClient) => Promise<void>,
    ) {
      return db.$transaction(async (tx) => {
        await tx.keyResultCheckin.create({
          data: { keyResultId, value, note, checkedById: userId },
        });
        await tx.keyResult.update({
          where: { id: keyResultId },
          data: { currentValue: value, version: { increment: 1 } },
        });
        await onWrite(tx);
      });
    },
  };
}
