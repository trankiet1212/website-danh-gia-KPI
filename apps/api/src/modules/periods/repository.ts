import type { PeriodType } from '@kpi/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { lockInTransaction } from '../../lib/db-lock.js';
import type { Db } from '../../lib/prisma.js';

const INCLUDE = {
  _count: { select: { evaluations: true } },
} satisfies Prisma.EvaluationPeriodInclude;
export type PeriodRow = Prisma.EvaluationPeriodGetPayload<{ include: typeof INCLUDE }>;

export function createPeriodsRepository(db: Db) {
  return {
    list(filter: { year?: number; type?: PeriodType }) {
      return db.evaluationPeriod.findMany({
        where: {
          ...(filter.year ? { year: filter.year } : {}),
          ...(filter.type ? { type: filter.type } : {}),
        },
        include: INCLUDE,
        orderBy: [{ year: 'desc' }, { startDate: 'asc' }, { type: 'desc' }],
      });
    },
    findById(id: string) {
      return db.evaluationPeriod.findUnique({ where: { id }, include: INCLUDE });
    },
    findByCode(code: string) {
      return db.evaluationPeriod.findUnique({ where: { code } });
    },
    create(data: Prisma.EvaluationPeriodUncheckedCreateInput) {
      return db.evaluationPeriod.create({ data });
    },
    /** Cập nhật có kiểm tra phiên bản; `onWrite` (ghi nhật ký) chạy trong CÙNG transaction. */
    updateVersioned(
      id: string,
      version: number,
      data: Prisma.EvaluationPeriodUpdateManyMutationInput,
      onWrite?: (tx: Prisma.TransactionClient) => Promise<void>,
    ) {
      return db.$transaction(async (tx) => {
        const { count } = await tx.evaluationPeriod.updateMany({
          where: { id, version },
          data: { ...data, version: { increment: 1 } },
        });
        if (count > 0 && onWrite) await onWrite(tx);
        return count;
      });
    },
    /** Transaction có khóa theo `lockKey` (ví dụ sinh cây kỳ của một năm) — các yêu cầu đồng thời chạy lần lượt. */
    transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>, lockKey?: string) {
      return db.$transaction(async (tx) => {
        if (lockKey) await lockInTransaction(tx, lockKey);
        return fn(tx);
      });
    },
  };
}
