import type { Prisma } from '../../generated/prisma/client.js';
import { lockInTransaction } from '../../lib/db-lock.js';
import type { Db } from '../../lib/prisma.js';

export const VERSION_INCLUDE = {
  criteriaSet: { include: { jobPosition: { select: { id: true, name: true } } } },
  ruleSetVersion: { include: { ruleSet: true } },
  items: { orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] },
} satisfies Prisma.CriteriaVersionInclude;
export type CriteriaVersionRow = Prisma.CriteriaVersionGetPayload<{
  include: typeof VERSION_INCLUDE;
}>;

export function createCriteriaRepository(db: Db) {
  return {
    listSets() {
      return db.criteriaSet.findMany({
        include: {
          jobPosition: { select: { id: true, name: true } },
          versions: {
            include: { ruleSetVersion: { include: { ruleSet: true } } },
            orderBy: { versionNo: 'desc' },
          },
        },
        orderBy: { code: 'asc' },
      });
    },
    findSet(id: string) {
      return db.criteriaSet.findUnique({
        where: { id },
        include: { versions: { orderBy: { versionNo: 'desc' } } },
      });
    },
    findVersion(id: string) {
      return db.criteriaVersion.findUnique({ where: { id }, include: VERSION_INCLUDE });
    },
    findRuleSetVersion(id: string) {
      return db.ruleSetVersion.findUnique({ where: { id } });
    },
    findCatalogVersion(id: string) {
      return db.workCatalogVersion.findUnique({ where: { id } });
    },
    jobPositionExists(id: string) {
      return db.jobPosition.count({ where: { id } }).then((n) => n > 0);
    },
    createSet(data: Prisma.CriteriaSetUncheckedCreateInput) {
      return db.criteriaSet.create({ data });
    },

    /** Tạo phiên bản nháp, sao chép toàn bộ cây mục từ phiên bản nguồn (nếu có). */
    /** Cấp số phiên bản tiếp theo (có khóa theo bộ tiêu chí) và sao chép cây mục trong cùng transaction. */
    cloneVersion(source: CriteriaVersionRow | null, criteriaSetId: string, createdById: string) {
      return db.$transaction(async (tx) => {
        await lockInTransaction(tx, `criteria_version:${criteriaSetId}`);
        const last = await tx.criteriaVersion.findFirst({
          where: { criteriaSetId },
          orderBy: { versionNo: 'desc' },
        });
        const versionNo = (last?.versionNo ?? 0) + 1;
        const created = await tx.criteriaVersion.create({
          data: {
            criteriaSetId,
            versionNo,
            status: 'DRAFT',
            periodTypes: source?.periodTypes ?? ['QUARTER'],
            generalMax: source?.generalMax ?? 30,
            resultMax: source?.resultMax ?? 70,
            ruleSetVersionId: source?.ruleSetVersionId ?? null,
            workCatalogVersionId: source?.workCatalogVersionId ?? null,
            createdById,
          },
        });
        const idMap = new Map<string, string>();
        const pending = [...(source?.items ?? [])];
        while (pending.length > 0) {
          const ready = pending.filter((i) => !i.parentId || idMap.has(i.parentId));
          if (ready.length === 0) break;
          for (const i of ready) {
            const { id, criteriaVersionId: _v, parentId, ...rest } = i;
            const row = await tx.criteriaItem.create({
              data: {
                ...rest,
                criteriaVersionId: created.id,
                parentId: parentId ? idMap.get(parentId)! : null,
              },
            });
            idMap.set(id, row.id);
            pending.splice(pending.indexOf(i), 1);
          }
        }
        return { id: created.id, versionNo };
      });
    },

    /** Thay toàn bộ cây mục của phiên bản nháp trong một transaction. */
    replaceItems(
      versionId: string,
      expectVersion: number,
      meta: Prisma.CriteriaVersionUncheckedUpdateManyInput,
      items: (Omit<Prisma.CriteriaItemUncheckedCreateInput, 'criteriaVersionId' | 'parentId'> & {
        key: string;
        parentKey: string | null;
      })[],
      onWrite: (tx: Prisma.TransactionClient) => Promise<void>,
    ) {
      return db.$transaction(async (tx) => {
        const { count } = await tx.criteriaVersion.updateMany({
          where: { id: versionId, version: expectVersion, status: 'DRAFT' },
          data: { ...meta, version: { increment: 1 } },
        });
        if (count === 0) return false;
        // Xóa con trước, cha sau (quan hệ cha–con)
        await tx.criteriaItem.deleteMany({
          where: { criteriaVersionId: versionId, parentId: { not: null } },
        });
        await tx.criteriaItem.deleteMany({ where: { criteriaVersionId: versionId } });
        const idByKey = new Map<string, string>();
        const pending = [...items];
        while (pending.length > 0) {
          const ready = pending.filter((i) => !i.parentKey || idByKey.has(i.parentKey));
          if (ready.length === 0) throw new Error('CYCLE');
          for (const i of ready) {
            const { key, parentKey, ...data } = i;
            const row = await tx.criteriaItem.create({
              data: {
                ...data,
                criteriaVersionId: versionId,
                parentId: parentKey ? idByKey.get(parentKey)! : null,
              },
            });
            idByKey.set(key, row.id);
            pending.splice(pending.indexOf(i), 1);
          }
        }
        await onWrite(tx);
        return true;
      });
    },

    /** Cập nhật có kiểm tra phiên bản; `onWrite` (ghi nhật ký) chạy trong CÙNG transaction. */
    updateVersioned(
      id: string,
      version: number,
      data: Prisma.CriteriaVersionUncheckedUpdateManyInput,
      onWrite?: (tx: Prisma.TransactionClient) => Promise<void>,
    ) {
      return db.$transaction(async (tx) => {
        const { count } = await tx.criteriaVersion.updateMany({
          where: { id, version },
          data: { ...data, version: { increment: 1 } },
        });
        if (count > 0 && onWrite) await onWrite(tx);
        return count;
      });
    },
  };
}
