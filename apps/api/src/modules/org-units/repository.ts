import type { Prisma } from '../../generated/prisma/client.js';
import type { Db } from '../../lib/prisma.js';

export function createOrgUnitsRepository(db: Db) {
  return {
    list(includeArchived: boolean) {
      return db.organizationalUnit.findMany({
        where: includeArchived ? {} : { status: 'ACTIVE' },
        include: {
          _count: { select: { assignments: { where: { isPrimary: true, endDate: null } } } },
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });
    },
    findById(id: string) {
      return db.organizationalUnit.findUnique({
        where: { id },
        include: {
          _count: { select: { assignments: { where: { isPrimary: true, endDate: null } } } },
        },
      });
    },
    /** Danh sách (id, parentId) để kiểm tra vòng lặp cây đơn vị. */
    allParents() {
      return db.organizationalUnit.findMany({ select: { id: true, parentId: true } });
    },
    create(data: Prisma.OrganizationalUnitUncheckedCreateInput) {
      return db.organizationalUnit.create({ data });
    },
    async updateVersioned(
      id: string,
      version: number,
      data: Prisma.OrganizationalUnitUncheckedUpdateManyInput,
    ) {
      const { count } = await db.organizationalUnit.updateMany({
        where: { id, version },
        data: { ...data, version: { increment: 1 } },
      });
      return count;
    },
    countActiveChildren(id: string) {
      return db.organizationalUnit.count({ where: { parentId: id, status: 'ACTIVE' } });
    },
    countActiveAssignments(id: string) {
      return db.employeeAssignment.count({ where: { unitId: id, endDate: null } });
    },
  };
}
