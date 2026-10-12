import type { Prisma } from '../../generated/prisma/client.js';
import type { Db } from '../../lib/prisma.js';

const INCLUDE = {
  catalog: true,
  _count: { select: { items: true } },
} satisfies Prisma.WorkCatalogVersionInclude;
export type CatalogVersionRow = Prisma.WorkCatalogVersionGetPayload<{ include: typeof INCLUDE }>;

export function createWorkCatalogsRepository(db: Db) {
  return {
    listVersions() {
      return db.workCatalogVersion.findMany({
        include: INCLUDE,
        orderBy: [{ catalogId: 'asc' }, { versionNo: 'desc' }],
      });
    },
    findVersion(id: string) {
      return db.workCatalogVersion.findUnique({ where: { id }, include: INCLUDE });
    },
    items(versionId: string, q?: string, groupCode?: string) {
      return db.workCatalogItem.findMany({
        where: {
          catalogVersionId: versionId,
          ...(groupCode ? { groupCode } : {}),
          ...(q
            ? {
                OR: [
                  { name: { contains: q, mode: 'insensitive' } },
                  { code: { contains: q, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      });
    },
    /** Cập nhật có kiểm tra phiên bản; `onWrite` (ghi nhật ký) chạy trong CÙNG transaction. */
    updateVersioned(
      id: string,
      version: number,
      data: Prisma.WorkCatalogVersionUpdateManyMutationInput,
      onWrite?: (tx: Prisma.TransactionClient) => Promise<void>,
    ) {
      return db.$transaction(async (tx) => {
        const { count } = await tx.workCatalogVersion.updateMany({
          where: { id, version },
          data: { ...data, version: { increment: 1 } },
        });
        if (count > 0 && onWrite) await onWrite(tx);
        return count;
      });
    },
  };
}
