/**
 * Danh mục sản phẩm/công việc chuẩn ([HD05] Phụ lục 1): hệ số quy đổi = điểm sản phẩm / điểm sản phẩm chuẩn.
 * Phê duyệt danh mục thuộc thẩm quyền tập thể giao việc ([HD05] IV.2.3) — quyền catalog.approve.
 *
 * Danh mục theo vị trí việc làm (docs/05): mỗi người chỉ xem mục được phân cho VTVL của mình; xem toàn bộ
 * cần catalog.assign (hoặc catalog.approve khi phiên bản đang chờ phê duyệt); phân mục cho VTVL: catalog.assign.
 */
import type {
  AssignJobPositionItemsInput,
  CatalogItemDto,
  CatalogItemsQuery,
  CatalogVersionDto,
  DecisionInput,
  JobPositionWorkItemsDto,
  MyJobPositionDto,
} from '@kpi/shared';
import { employeeScopeWhere, resolveScope } from '../../auth/scope.js';
import type { AuthContext } from '../../auth/types.js';
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

type JobRow = Awaited<
  ReturnType<ReturnType<typeof createWorkCatalogsRepository>['jobPositionsWithItems']>
>[number];
const toJobDto = (j: JobRow): JobPositionWorkItemsDto => ({
  jobPosition: { id: j.id, code: j.code, name: j.name, group: j.group },
  itemCodes: j.workItems.map((w) => w.itemCode),
  employeeCount: j._count.assignments,
});

export function createWorkCatalogsService(db: Db) {
  const repo = createWorkCatalogsRepository(db);
  const get = async (id: string) => {
    const v = await repo.findVersion(id);
    if (!v) throw new AppError('NOT_FOUND', 'Không tìm thấy phiên bản danh mục');
    return v;
  };
  /** VTVL của người dùng (theo phân công chính đang hiệu lực); null nếu không gắn cán bộ/chưa có VTVL. */
  const ownJobPosition = async (auth: AuthContext) =>
    auth.employee
      ? ((await repo.jobPositionOf({ id: auth.employee.id }))?.jobPosition ?? null)
      : null;

  return {
    async listVersions() {
      return (await repo.listVersions()).map(toVersionDto);
    },

    async items(
      auth: AuthContext,
      versionId: string,
      query: CatalogItemsQuery,
    ): Promise<CatalogItemDto[]> {
      const v = await get(versionId);
      let codes: string[] | null;
      if (query.employeeId) {
        // Danh mục theo VTVL của cán bộ được đánh giá/giao việc — cán bộ phải trong phạm vi xem
        const scope = resolveScope(auth, 'employee.read');
        const found = scope
          ? await repo.jobPositionOf({
              AND: [{ id: query.employeeId }, employeeScopeWhere(scope)],
            })
          : null;
        if (!found) throw new AppError('NOT_FOUND', 'Không tìm thấy cán bộ');
        codes = found.jobPosition ? await repo.codesFor(found.jobPosition.id) : [];
      } else if (query.scope === 'all') {
        const canViewAll =
          auth.permissions.has('catalog.assign') ||
          (auth.permissions.has('catalog.approve') && v.status === 'SUBMITTED');
        if (!canViewAll)
          throw new AppError(
            'FORBIDDEN',
            'Bạn chỉ được xem các sản phẩm/công việc của vị trí việc làm của mình',
          );
        codes = null;
      } else {
        const own = await ownJobPosition(auth);
        codes = own ? await repo.codesFor(own.id) : [];
      }
      return (
        await repo.items(versionId, query.q || undefined, query.groupCode || undefined, codes)
      ).map((i) => ({
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

    async myJobPosition(auth: AuthContext): Promise<MyJobPositionDto> {
      return { jobPosition: await ownJobPosition(auth) };
    },

    async jobPositions(): Promise<JobPositionWorkItemsDto[]> {
      return (await repo.jobPositionsWithItems()).map(toJobDto);
    },

    /** Thay danh sách sản phẩm/công việc của một VTVL; ghi nhật ký phần thêm/bớt. */
    async assignItems(
      auth: AuthContext,
      jobPositionId: string,
      input: AssignJobPositionItemsInput,
      actor: AuditActor,
    ) {
      const job = await repo.findJobPosition(jobPositionId);
      if (!job) throw new AppError('NOT_FOUND', 'Không tìm thấy vị trí việc làm');
      const codes = [...new Set(input.itemCodes)].sort();
      const known = await repo.allItemCodes();
      const unknown = codes.filter((c) => !known.has(c));
      if (unknown.length > 0)
        throw new AppError('VALIDATION_ERROR', 'Có mã không có trong danh mục sản phẩm/công việc', {
          itemCodes: unknown,
        });
      const before = new Set(await repo.codesFor(jobPositionId));
      const after = new Set(codes);
      await repo.replaceItems(jobPositionId, codes, auth.userId, (tx) =>
        writeAudit(tx, actor, {
          action: 'work_catalog.assign_job_position',
          entityType: 'job_position',
          entityId: jobPositionId,
          changes: {
            jobPosition: job.code,
            added: codes.filter((c) => !before.has(c)),
            removed: [...before].filter((c) => !after.has(c)),
          },
        }),
      );
      const updated = (await repo.jobPositionsWithItems()).find((j) => j.id === jobPositionId);
      return toJobDto(updated!);
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
