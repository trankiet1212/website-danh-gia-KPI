import type { Prisma } from '../../generated/prisma/client.js';
import type { Db } from '../../lib/prisma.js';

export const DAILY_TASK_INCLUDE = {
  employee: { select: { id: true, employeeCode: true, fullName: true } },
  unit: { select: { id: true, name: true } },
} satisfies Prisma.DailyTaskInclude;
export type DailyTaskRow = Prisma.DailyTaskGetPayload<{ include: typeof DAILY_TASK_INCLUDE }>;

type OnWrite = (tx: Prisma.TransactionClient) => Promise<void>;

export function createDailyTasksRepository(db: Db) {
  return {
    list(where: Prisma.DailyTaskWhereInput) {
      return db.dailyTask.findMany({
        where,
        include: DAILY_TASK_INCLUDE,
        orderBy: [{ workDate: 'asc' }, { createdAt: 'asc' }],
        take: 2000,
      });
    },
    find(id: string, where: Prisma.DailyTaskWhereInput) {
      return db.dailyTask.findFirst({
        where: { AND: [{ id }, where] },
        include: DAILY_TASK_INCLUDE,
      });
    },
    /** Lọc danh sách id còn thỏa điều kiện (tính quyền thao tác cho nhiều dòng một lần). */
    async ids(where: Prisma.DailyTaskWhereInput) {
      return (await db.dailyTask.findMany({ where, select: { id: true } })).map((r) => r.id);
    },
    /** Cán bộ đang công tác kèm phân công chính hiệu lực. */
    employees(where: Prisma.EmployeeWhereInput) {
      return db.employee.findMany({
        where: { AND: [where, { status: 'WORKING' }] },
        select: {
          id: true,
          employeeCode: true,
          fullName: true,
          assignments: {
            where: { isPrimary: true, endDate: null },
            select: {
              unit: { select: { id: true, name: true } },
              position: { select: { name: true, level: true } },
            },
            take: 1,
          },
        },
        orderBy: { fullName: 'asc' },
      });
    },
    userNames(ids: string[]) {
      return db.user.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          username: true,
          displayName: true,
          employee: { select: { fullName: true } },
        },
      });
    },

    createMany(
      rows: Prisma.DailyTaskUncheckedCreateInput[],
      onWrite: (tx: Prisma.TransactionClient, ids: string[]) => Promise<void>,
    ) {
      return db.$transaction(async (tx) => {
        const ids: string[] = [];
        for (const data of rows) ids.push((await tx.dailyTask.create({ data })).id);
        await onWrite(tx, ids);
        return ids;
      });
    },

    /** Cập nhật có kiểm tra phiên bản + điều kiện trạng thái trong cùng câu lệnh. */
    update(args: {
      id: string;
      expectVersion: number;
      where: Prisma.DailyTaskWhereInput;
      data: Prisma.DailyTaskUncheckedUpdateManyInput;
      onWrite: OnWrite;
    }) {
      return db.$transaction(async (tx) => {
        const { count } = await tx.dailyTask.updateMany({
          where: { AND: [{ id: args.id, version: args.expectVersion }, args.where] },
          data: { ...args.data, version: { increment: 1 } },
        });
        if (count === 0) return false;
        await args.onWrite(tx);
        return true;
      });
    },

    remove(args: {
      id: string;
      expectVersion: number;
      where: Prisma.DailyTaskWhereInput;
      onWrite: OnWrite;
    }) {
      return db.$transaction(async (tx) => {
        const { count } = await tx.dailyTask.deleteMany({
          where: { AND: [{ id: args.id, version: args.expectVersion }, args.where] },
        });
        if (count === 0) return false;
        await args.onWrite(tx);
        return true;
      });
    },
  };
}
