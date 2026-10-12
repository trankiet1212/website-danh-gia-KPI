/**
 * Đơn vị (phòng ban) dạng cây. Không xóa cứng — chỉ lưu trữ khi không còn đơn vị con và cán bộ đang công tác.
 */
import type { CreateUnitInput, UnitDto, UpdateUnitInput } from '@kpi/shared';
import { diff, writeAudit, type AuditActor } from '../../lib/audit.js';
import { AppError } from '../../lib/errors.js';
import type { Db } from '../../lib/prisma.js';
import { withDbErrors } from '../../lib/db-errors.js';
import { createOrgUnitsRepository } from './repository.js';

type UnitRow = NonNullable<
  Awaited<ReturnType<ReturnType<typeof createOrgUnitsRepository>['findById']>>
>;

const toDto = (u: UnitRow): UnitDto => ({
  id: u.id,
  code: u.code,
  name: u.name,
  shortName: u.shortName,
  type: u.type,
  parentId: u.parentId,
  sortOrder: u.sortOrder,
  status: u.status,
  activeEmployeeCount: u._count.assignments,
  version: u.version,
});

export function createOrgUnitsService(db: Db) {
  const repo = createOrgUnitsRepository(db);

  async function getOrThrow(id: string) {
    const unit = await repo.findById(id);
    if (!unit) throw new AppError('NOT_FOUND', 'Không tìm thấy đơn vị');
    return unit;
  }

  async function assertValidParent(unitId: string | null, parentId: string | null | undefined) {
    if (!parentId) return;
    const parent = await repo.findById(parentId);
    if (!parent || parent.status !== 'ACTIVE') {
      throw new AppError('BUSINESS_RULE', 'Đơn vị cấp trên không tồn tại hoặc đã lưu trữ');
    }
    if (!unitId) return;
    // Không cho chọn chính nó hoặc đơn vị con cháu làm cấp trên (tạo vòng lặp)
    const parentOf = new Map((await repo.allParents()).map((u) => [u.id, u.parentId]));
    let cursor: string | null | undefined = parentId;
    while (cursor) {
      if (cursor === unitId)
        throw new AppError('BUSINESS_RULE', 'Không thể chọn đơn vị con của chính nó làm cấp trên');
      cursor = parentOf.get(cursor);
    }
  }

  return {
    async list(includeArchived: boolean): Promise<UnitDto[]> {
      return (await repo.list(includeArchived)).map(toDto);
    },

    async get(id: string) {
      return toDto(await getOrThrow(id));
    },

    async create(input: CreateUnitInput, actor: AuditActor) {
      await assertValidParent(null, input.parentId);
      const created = await withDbErrors(() =>
        repo.create({
          ...input,
          shortName: input.shortName ?? null,
          parentId: input.parentId ?? null,
        }),
      );
      await writeAudit(db, actor, {
        action: 'org_unit.create',
        entityType: 'org_unit',
        entityId: created.id,
        changes: input,
      });
      return toDto(await getOrThrow(created.id));
    },

    async update(id: string, input: UpdateUnitInput, actor: AuditActor) {
      const before = await getOrThrow(id);
      await assertValidParent(id, input.parentId);
      const data = {
        name: input.name,
        shortName: input.shortName ?? null,
        type: input.type,
        parentId: input.parentId ?? null,
        sortOrder: input.sortOrder,
      };
      if ((await repo.updateVersioned(id, input.version, data)) === 0) {
        throw new AppError(
          'CONFLICT_VERSION',
          'Đơn vị đã được người khác cập nhật. Vui lòng tải lại.',
        );
      }
      const after = await getOrThrow(id);
      await writeAudit(db, actor, {
        action: 'org_unit.update',
        entityType: 'org_unit',
        entityId: id,
        changes: diff({ ...before }, { ...after }),
      });
      return toDto(after);
    },

    async setArchived(id: string, archived: boolean, actor: AuditActor) {
      const unit = await getOrThrow(id);
      if (archived) {
        if ((await repo.countActiveChildren(id)) > 0) {
          throw new AppError(
            'BUSINESS_RULE',
            'Đơn vị còn đơn vị con đang hoạt động — lưu trữ đơn vị con trước',
          );
        }
        if ((await repo.countActiveAssignments(id)) > 0) {
          throw new AppError(
            'BUSINESS_RULE',
            'Đơn vị còn cán bộ đang công tác — điều chuyển cán bộ trước khi lưu trữ',
          );
        }
      } else {
        await assertValidParent(id, unit.parentId);
      }
      await repo.updateVersioned(id, unit.version, { status: archived ? 'ARCHIVED' : 'ACTIVE' });
      await writeAudit(db, actor, {
        action: archived ? 'org_unit.archive' : 'org_unit.restore',
        entityType: 'org_unit',
        entityId: id,
      });
      return toDto(await getOrThrow(id));
    },
  };
}
