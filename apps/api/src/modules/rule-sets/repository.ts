import type { Prisma } from '../../generated/prisma/client.js';
import { lockInTransaction } from '../../lib/db-lock.js';
import type { Db } from '../../lib/prisma.js';

export function createRuleSetsRepository(db: Db) {
  return {
    list() {
      return db.ruleSet.findMany({
        include: { versions: { orderBy: { versionNo: 'desc' } } },
        orderBy: { code: 'asc' },
      });
    },
    findSet(id: string) {
      return db.ruleSet.findUnique({
        where: { id },
        include: { versions: { orderBy: { versionNo: 'desc' } } },
      });
    },
    findVersion(id: string) {
      return db.ruleSetVersion.findUnique({ where: { id }, include: { ruleSet: true } });
    },
    createSet(data: Prisma.RuleSetCreateInput) {
      return db.ruleSet.create({ data });
    },
    /** Cấp số phiên bản tiếp theo và tạo bản ghi trong một transaction có khóa (tránh trùng số khi gửi đồng thời). */
    createNextVersion(
      ruleSetId: string,
      data: Omit<Prisma.RuleSetVersionUncheckedCreateInput, 'ruleSetId' | 'versionNo'>,
    ) {
      return db.$transaction(async (tx) => {
        await lockInTransaction(tx, `rule_set_version:${ruleSetId}`);
        const last = await tx.ruleSetVersion.findFirst({
          where: { ruleSetId },
          orderBy: { versionNo: 'desc' },
        });
        return tx.ruleSetVersion.create({
          data: { ...data, ruleSetId, versionNo: (last?.versionNo ?? 0) + 1 },
          include: { ruleSet: true },
        });
      });
    },
    /** Cập nhật có kiểm tra phiên bản; `onWrite` (ghi nhật ký) chạy trong CÙNG transaction. */
    updateVersioned(
      id: string,
      version: number,
      data: Prisma.RuleSetVersionUpdateManyMutationInput,
      onWrite?: (tx: Prisma.TransactionClient) => Promise<void>,
    ) {
      return db.$transaction(async (tx) => {
        const { count } = await tx.ruleSetVersion.updateMany({
          where: { id, version },
          data: { ...data, version: { increment: 1 } },
        });
        if (count > 0 && onWrite) await onWrite(tx);
        return count;
      });
    },
    countUsage(id: string) {
      return db.criteriaVersion.count({ where: { ruleSetVersionId: id } });
    },
  };
}
