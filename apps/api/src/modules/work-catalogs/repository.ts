import type { Prisma } from '../../generated/prisma/client.js';
import type { Db } from '../../lib/prisma.js';

const INCLUDE = {
  catalog: true,
  _count: { select: { items: true } },
} satisfies Prisma.WorkCatalogVersionInclude;
export type CatalogVersionRow = Prisma.WorkCatalogVersionGetPayload<{ include: typeof INCLUDE }>;

const JOB_SELECT = { id: true, code: true, name: true, group: true } as const;

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
    /** Mục của phiên bản danh mục; `codes` = chỉ các mã này (null = tất cả). */
    items(versionId: string, q?: string, groupCode?: string, codes: string[] | null = null) {
      return db.workCatalogItem.findMany({
        where: {
          catalogVersionId: versionId,
          ...(codes ? { code: { in: codes } } : {}),
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
    /** VTVL theo phân công chính đang hiệu lực của cán bộ (đang công tác) thỏa điều kiện. */
    async jobPositionOf(where: Prisma.EmployeeWhereInput) {
      const e = await db.employee.findFirst({
        where: { AND: [where, { status: 'WORKING' }] },
        select: {
          assignments: {
            where: { isPrimary: true, endDate: null },
            select: { jobPosition: { select: JOB_SELECT } },
            take: 1,
          },
        },
      });
      return e ? { jobPosition: e.assignments[0]?.jobPosition ?? null } : null;
    },
    async codesFor(jobPositionId: string) {
      const rows = await db.jobPositionWorkItem.findMany({
        where: { jobPositionId },
        select: { itemCode: true },
        orderBy: { itemCode: 'asc' },
      });
      return rows.map((r) => r.itemCode);
    },
    jobPositionsWithItems() {
      return db.jobPosition.findMany({
        where: { status: 'ACTIVE' },
        select: {
          ...JOB_SELECT,
          workItems: { select: { itemCode: true }, orderBy: { itemCode: 'asc' } },
          _count: { select: { assignments: { where: { isPrimary: true, endDate: null } } } },
        },
        orderBy: [{ group: 'asc' }, { code: 'asc' }],
      });
    },
    findJobPosition(id: string) {
      return db.jobPosition.findUnique({ where: { id }, select: JOB_SELECT });
    },
    async allItemCodes() {
      const rows = await db.workCatalogItem.findMany({
        select: { code: true },
        distinct: ['code'],
      });
      return new Set(rows.map((r) => r.code));
    },
    /** Thay danh sách mã của một VTVL trong một transaction. */
    replaceItems(
      jobPositionId: string,
      codes: string[],
      userId: string,
      onWrite: (tx: Prisma.TransactionClient) => Promise<void>,
    ) {
      return db.$transaction(async (tx) => {
        await tx.jobPositionWorkItem.deleteMany({
          where: { jobPositionId, itemCode: { notIn: codes } },
        });
        await tx.jobPositionWorkItem.createMany({
          data: codes.map((itemCode) => ({ jobPositionId, itemCode, createdById: userId })),
          skipDuplicates: true,
        });
        await onWrite(tx);
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
