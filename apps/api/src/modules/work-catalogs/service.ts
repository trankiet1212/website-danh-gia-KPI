/**
 * Danh mục sản phẩm/công việc chuẩn ([HD05] Phụ lục 1): hệ số quy đổi = điểm sản phẩm / điểm sản phẩm chuẩn.
 * Phê duyệt danh mục thuộc thẩm quyền tập thể giao việc ([HD05] IV.2.3) — quyền catalog.approve.
 */
import type { AuthContext } from '../../auth/types.js';
import type { CatalogItemDto, CatalogVersionDto, DecisionInput } from '@kpi/shared';
import { writeAudit, type AuditActor } from '../../lib/audit.js';
import { AppError } from '../../lib/errors.js';
import type { Db } from '../../lib/prisma.js';
import { createWorkCatalogsRepository, type CatalogVersionRow } from './repository.js';

const toVersionDto = (v: CatalogVersionRow): CatalogVersionDto => ({
  id: v.id,
  catalogCode: v.catalog.code,
  catalogName: v.catalog.name,
  versionNo: v.versionNo,
  status: v.status,
  standardPoints: v.standardPoints.toNumber(),
  legalBasis: v.legalBasis,
  approvedBy: v.approvedById,
  approvedAt: v.approvedAt?.toISOString() ?? null,
  itemCount: v._count.items,
  version: v.version,
});

export function createWorkCatalogsService(db: Db) {
  const repo = createWorkCatalogsRepository(db);
  const get = async (id: string) => {
    const v = await repo.findVersion(id);
    if (!v) throw new AppError('NOT_FOUND', 'Không tìm thấy phiên bản danh mục');
    return v;
  };

  return {
    async listVersions() {
      return (await repo.listVersions()).map(toVersionDto);
    },

    async items(versionId: string, q?: string, groupCode?: string): Promise<CatalogItemDto[]> {
      await get(versionId);
      return (await repo.items(versionId, q, groupCode)).map((i) => ({
        id: i.id,
        code: i.code,
        groupCode: i.groupCode,
        name: i.name,
        product: i.product,
        complexityLevel: i.complexityLevel,
        maxHoursText: i.maxHoursText,
        points: i.points.toNumber(),
        coefficient: i.coefficient.toNumber(),
        note: i.note,
      }));
    },

    async approve(auth: AuthContext, id: string, input: DecisionInput, actor: AuditActor) {
      const v = await get(id);
      if (v.status !== 'SUBMITTED')
        throw new AppError('INVALID_TRANSITION', 'Chỉ phê duyệt được danh mục đang chờ phê duyệt');
      const ok = await repo.updateVersioned(
        id,
        input.version,
        {
          status: 'APPROVED',
          approvedById: auth.userId,
          approvedAt: new Date(),
          approveNote: input.note,
        },
        (tx) =>
          writeAudit(tx, actor, {
            action: 'work_catalog.approve',
            entityType: 'work_catalog_version',
            entityId: id,
            changes: { note: input.note },
          }),
      );
      if (ok === 0)
        throw new AppError(
          'CONFLICT_VERSION',
          'Danh mục đã được người khác cập nhật. Vui lòng tải lại.',
        );
      return toVersionDto(await get(id));
    },
  };
}
