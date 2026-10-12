/**
 * Chức vụ và vị trí việc làm (VTVL). Không xóa cứng; chỉ lưu trữ khi không còn cán bộ đang giữ.
 */
import type {
  CreateJobPositionInput,
  CreatePositionInput,
  JobPositionDto,
  PositionDto,
  UpdateJobPositionInput,
  UpdatePositionInput,
} from '@kpi/shared';
import { diff, writeAudit, type AuditActor } from '../../lib/audit.js';
import { AppError } from '../../lib/errors.js';
import type { Db } from '../../lib/prisma.js';
import { withDbErrors } from '../../lib/db-errors.js';
import { createCatalogsRepository } from './repository.js';

type Repo = ReturnType<typeof createCatalogsRepository>;
type PositionRow = NonNullable<Awaited<ReturnType<Repo['findPosition']>>>;
type JobRow = NonNullable<Awaited<ReturnType<Repo['findJobPosition']>>>;

const positionDto = (p: PositionRow): PositionDto => ({
  id: p.id,
  code: p.code,
  name: p.name,
  level: p.level,
  isLeadership: p.isLeadership,
  kpiProfile: p.kpiProfile,
  sortOrder: p.sortOrder,
  status: p.status,
  version: p.version,
});

const jobDto = (j: JobRow): JobPositionDto => ({
  id: j.id,
  code: j.code,
  name: j.name,
  group: j.group,
  description: j.description,
  status: j.status,
  isProvisional: j.isProvisional,
  version: j.version,
});

export function createCatalogsService(db: Db) {
  const repo = createCatalogsRepository(db);

  async function position(id: string) {
    const p = await repo.findPosition(id);
    if (!p) throw new AppError('NOT_FOUND', 'Không tìm thấy chức vụ');
    return p;
  }
  async function job(id: string) {
    const j = await repo.findJobPosition(id);
    if (!j) throw new AppError('NOT_FOUND', 'Không tìm thấy vị trí việc làm');
    return j;
  }
  const conflict = (what: string) =>
    new AppError('CONFLICT_VERSION', `${what} đã được người khác cập nhật. Vui lòng tải lại.`);

  return {
    // ---------------- Chức vụ ----------------
    async listPositions(includeArchived: boolean) {
      return (await repo.listPositions(includeArchived)).map(positionDto);
    },
    async createPosition(input: CreatePositionInput, actor: AuditActor) {
      const p = await withDbErrors(() => repo.createPosition(input));
      await writeAudit(db, actor, {
        action: 'position.create',
        entityType: 'position',
        entityId: p.id,
        changes: input,
      });
      return positionDto(p);
    },
    async updatePosition(id: string, input: UpdatePositionInput, actor: AuditActor) {
      const before = await position(id);
      const { version, ...data } = input;
      if ((await repo.updatePosition(id, version, data)) === 0) throw conflict('Chức vụ');
      const after = await position(id);
      await writeAudit(db, actor, {
        action: 'position.update',
        entityType: 'position',
        entityId: id,
        changes: diff({ ...before }, { ...after }),
      });
      return positionDto(after);
    },
    async setPositionArchived(id: string, archived: boolean, actor: AuditActor) {
      const p = await position(id);
      if (archived && (await repo.countActiveByPosition(id)) > 0) {
        throw new AppError(
          'BUSINESS_RULE',
          'Chức vụ đang được cán bộ đảm nhiệm — không thể lưu trữ',
        );
      }
      await repo.updatePosition(id, p.version, { status: archived ? 'ARCHIVED' : 'ACTIVE' });
      await writeAudit(db, actor, {
        action: archived ? 'position.archive' : 'position.restore',
        entityType: 'position',
        entityId: id,
      });
      return positionDto(await position(id));
    },

    // ---------------- Vị trí việc làm ----------------
    async listJobPositions(includeArchived: boolean) {
      return (await repo.listJobPositions(includeArchived)).map(jobDto);
    },
    async createJobPosition(input: CreateJobPositionInput, actor: AuditActor) {
      const j = await withDbErrors(() =>
        repo.createJobPosition({ ...input, description: input.description ?? null }),
      );
      await writeAudit(db, actor, {
        action: 'job_position.create',
        entityType: 'job_position',
        entityId: j.id,
        changes: input,
      });
      return jobDto(j);
    },
    async updateJobPosition(id: string, input: UpdateJobPositionInput, actor: AuditActor) {
      const before = await job(id);
      const { version, ...data } = input;
      if (
        (await repo.updateJobPosition(id, version, {
          ...data,
          description: data.description ?? null,
        })) === 0
      ) {
        throw conflict('Vị trí việc làm');
      }
      const after = await job(id);
      await writeAudit(db, actor, {
        action: 'job_position.update',
        entityType: 'job_position',
        entityId: id,
        changes: diff({ ...before }, { ...after }),
      });
      return jobDto(after);
    },
    async setJobPositionArchived(id: string, archived: boolean, actor: AuditActor) {
      const j = await job(id);
      if (archived && (await repo.countActiveByJobPosition(id)) > 0) {
        throw new AppError(
          'BUSINESS_RULE',
          'Vị trí việc làm đang được cán bộ đảm nhiệm — không thể lưu trữ',
        );
      }
      await repo.updateJobPosition(id, j.version, { status: archived ? 'ARCHIVED' : 'ACTIVE' });
      await writeAudit(db, actor, {
        action: archived ? 'job_position.archive' : 'job_position.restore',
        entityType: 'job_position',
        entityId: id,
      });
      return jobDto(await job(id));
    },
  };
}
