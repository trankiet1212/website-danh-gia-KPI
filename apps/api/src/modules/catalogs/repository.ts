/** Danh mục chức vụ và vị trí việc làm. */
import type { Prisma } from '../../generated/prisma/client.js';
import type { Db } from '../../lib/prisma.js';

export function createCatalogsRepository(db: Db) {
  return {
    // ---- Chức vụ ----
    listPositions(includeArchived: boolean) {
      return db.position.findMany({
        where: includeArchived ? {} : { status: 'ACTIVE' },
        orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      });
    },
    findPosition(id: string) {
      return db.position.findUnique({ where: { id } });
    },
    createPosition(data: Prisma.PositionCreateInput) {
      return db.position.create({ data });
    },
    async updatePosition(
      id: string,
      version: number,
      data: Prisma.PositionUpdateManyMutationInput,
    ) {
      const { count } = await db.position.updateMany({
        where: { id, version },
        data: { ...data, version: { increment: 1 } },
      });
      return count;
    },
    countActiveByPosition(positionId: string) {
      return db.employeeAssignment.count({ where: { positionId, endDate: null } });
    },

    // ---- Vị trí việc làm ----
    listJobPositions(includeArchived: boolean) {
      return db.jobPosition.findMany({
        where: includeArchived ? {} : { status: 'ACTIVE' },
        orderBy: [{ group: 'asc' }, { code: 'asc' }],
      });
    },
    findJobPosition(id: string) {
      return db.jobPosition.findUnique({ where: { id } });
    },
    createJobPosition(data: Prisma.JobPositionCreateInput) {
      return db.jobPosition.create({ data });
    },
    async updateJobPosition(
      id: string,
      version: number,
      data: Prisma.JobPositionUpdateManyMutationInput,
    ) {
      const { count } = await db.jobPosition.updateMany({
        where: { id, version },
        data: { ...data, version: { increment: 1 } },
      });
      return count;
    },
    countActiveByJobPosition(jobPositionId: string) {
      return db.employeeAssignment.count({ where: { jobPositionId, endDate: null } });
    },
  };
}
