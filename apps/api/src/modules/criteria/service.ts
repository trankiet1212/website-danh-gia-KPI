/**
 * Bộ tiêu chí có phiên bản: DRAFT ──submit──▶ SUBMITTED ──approve──▶ APPROVED ──retire──▶ RETIRED
 *                                               └──return──▶ DRAFT
 * Kiểm tra tổng điểm, trọng số, cấu trúc cây trước khi trình/duyệt (validateCriteria).
 * Bản đã phê duyệt là bất biến (trigger DB); người soạn không tự phê duyệt.
 */
import type {
  CreateCriteriaSetInput,
  CriteriaSetDto,
  CriteriaVersionDto,
  DecisionInput,
  SaveCriteriaItemsInput,
  ValidationIssue,
} from '@kpi/shared';
import type { AuthContext } from '../../auth/types.js';
import { writeAudit, type AuditActor } from '../../lib/audit.js';
import { withDbErrors } from '../../lib/db-errors.js';
import { AppError } from '../../lib/errors.js';
import type { Db } from '../../lib/prisma.js';
import { parseRuleConfig, toEngineItems } from '../../scoring/adapter.js';
import { validateCriteria } from '../../scoring/validate-criteria.js';
import { createCriteriaRepository, type CriteriaVersionRow } from './repository.js';

const num = (v: { toNumber(): number } | null) => (v === null ? null : v.toNumber());

export function validateVersion(v: CriteriaVersionRow): ValidationIssue[] {
  const rule = v.ruleSetVersion ? parseRuleConfig(v.ruleSetVersion.config) : null;
  const issues = validateCriteria(
    toEngineItems(v.items),
    v.generalMax.toNumber(),
    v.resultMax.toNumber(),
    rule,
  );
  if (v.ruleSetVersion && ['DRAFT', 'RETIRED'].includes(v.ruleSetVersion.status)) {
    issues.push({
      level: 'error',
      code: 'RULESET_STATUS',
      message: 'Bộ quy tắc được gắn đang là bản nháp hoặc đã ngừng áp dụng',
    });
  }
  return issues;
}

export function toCriteriaVersionDto(v: CriteriaVersionRow): CriteriaVersionDto {
  return {
    id: v.id,
    criteriaSetId: v.criteriaSetId,
    criteriaSetCode: v.criteriaSet.code,
    criteriaSetName: v.criteriaSet.name,
    kpiProfile: v.criteriaSet.kpiProfile,
    versionNo: v.versionNo,
    status: v.status,
    periodTypes: v.periodTypes,
    generalMax: v.generalMax.toNumber(),
    resultMax: v.resultMax.toNumber(),
    ruleSetVersionId: v.ruleSetVersionId,
    ruleSetVersionLabel: v.ruleSetVersion
      ? `${v.ruleSetVersion.ruleSet.code} v${v.ruleSetVersion.versionNo}`
      : null,
    workCatalogVersionId: v.workCatalogVersionId,
    changeNote: v.changeNote,
    approvedBy: v.approvedById,
    approvedAt: v.approvedAt?.toISOString() ?? null,
    createdAt: v.createdAt.toISOString(),
    version: v.version,
    items: v.items.map((i) => ({
      id: i.id,
      parentId: i.parentId,
      kind: i.kind,
      code: i.code,
      name: i.name,
      description: i.description,
      maxPoints: i.maxPoints.toNumber(),
      weight: num(i.weight),
      scoringMethod: i.scoringMethod,
      measureUnit: i.measureUnit,
      direction: i.direction,
      target: num(i.target),
      baseline: num(i.baseline),
      allowNotApplicable: i.allowNotApplicable,
      evidenceRequired: i.evidenceRequired,
      dataSource: i.dataSource,
      sortOrder: i.sortOrder,
    })),
    issues: validateVersion(v),
  };
}

export function createCriteriaService(db: Db) {
  const repo = createCriteriaRepository(db);
  const conflict = () =>
    new AppError('CONFLICT_VERSION', 'Phiên bản đã được người khác cập nhật. Vui lòng tải lại.');

  async function version(id: string) {
    const v = await repo.findVersion(id);
    if (!v) throw new AppError('NOT_FOUND', 'Không tìm thấy phiên bản bộ tiêu chí');
    return v;
  }

  async function changeStatus(
    id: string,
    expect: number,
    from: CriteriaVersionRow['status'][],
    to: CriteriaVersionRow['status'],
    data: Record<string, unknown>,
    action: string,
    note: string,
    actor: AuditActor,
  ) {
    const v = await version(id);
    if (!from.includes(v.status)) {
      throw new AppError(
        'INVALID_TRANSITION',
        `Không thể chuyển bộ tiêu chí từ "${v.status}" sang "${to}"`,
      );
    }
    const audit = {
      action,
      entityType: 'criteria_version',
      entityId: id,
      changes: { from: v.status, to, note },
    };
    const ok = await repo.updateVersioned(id, expect, { status: to, ...data }, (tx) =>
      writeAudit(tx, actor, audit),
    );
    if (ok === 0) throw conflict();
    return toCriteriaVersionDto(await version(id));
  }

  function assertValid(v: CriteriaVersionRow) {
    const errors = validateVersion(v).filter((i) => i.level === 'error');
    if (errors.length > 0) {
      throw new AppError(
        'BUSINESS_RULE',
        'Bộ tiêu chí chưa hợp lệ — sửa các lỗi trước khi trình/phê duyệt',
        errors,
      );
    }
  }

  return {
    async listSets(): Promise<CriteriaSetDto[]> {
      return (await repo.listSets()).map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        kpiProfile: s.kpiProfile,
        jobPosition: s.jobPosition,
        description: s.description,
        versions: s.versions.map((v) => {
          const {
            items: _i,
            issues: _x,
            ...rest
          } = toCriteriaVersionDto({ ...v, criteriaSet: s, items: [] });
          return rest;
        }),
      }));
    },

    async getVersion(id: string) {
      return toCriteriaVersionDto(await version(id));
    },

    async createSet(input: CreateCriteriaSetInput, actor: AuditActor) {
      if (input.jobPositionId && !(await repo.jobPositionExists(input.jobPositionId))) {
        throw new AppError('BUSINESS_RULE', 'Vị trí việc làm không tồn tại');
      }
      const set = await withDbErrors(() =>
        repo.createSet({
          code: input.code,
          name: input.name,
          kpiProfile: input.kpiProfile,
          jobPositionId: input.jobPositionId ?? null,
          description: input.description ?? null,
        }),
      );
      await writeAudit(db, actor, {
        action: 'criteria_set.create',
        entityType: 'criteria_set',
        entityId: set.id,
        changes: input,
      });
      return set;
    },

    async createVersion(
      auth: AuthContext,
      setId: string,
      cloneFromVersionId: string | null,
      actor: AuditActor,
    ) {
      const set = await repo.findSet(setId);
      if (!set) throw new AppError('NOT_FOUND', 'Không tìm thấy bộ tiêu chí');
      const sourceId = cloneFromVersionId ?? set.versions[0]?.id ?? null;
      const source = sourceId ? await version(sourceId) : null;
      if (source && source.criteriaSetId !== setId)
        throw new AppError('BUSINESS_RULE', 'Phiên bản nguồn không thuộc bộ tiêu chí này');
      const { id, versionNo } = await repo.cloneVersion(source, setId, auth.userId);
      await writeAudit(db, actor, {
        action: 'criteria_version.create',
        entityType: 'criteria_version',
        entityId: id,
        changes: { versionNo, clonedFrom: source?.id ?? null },
      });
      return toCriteriaVersionDto(await version(id));
    },

    async saveItems(id: string, input: SaveCriteriaItemsInput, actor: AuditActor) {
      const v = await version(id);
      if (v.status !== 'DRAFT')
        throw new AppError('BUSINESS_RULE', 'Chỉ sửa được bộ tiêu chí ở trạng thái bản nháp');
      const keys = new Set(input.items.map((i) => i.key));
      if (keys.size !== input.items.length)
        throw new AppError('VALIDATION_ERROR', 'Khóa mục bị trùng');
      for (const i of input.items) {
        if (i.parentKey && !keys.has(i.parentKey)) {
          throw new AppError(
            'VALIDATION_ERROR',
            `Mục "${i.code}" tham chiếu mục cha không tồn tại`,
          );
        }
      }
      if (input.ruleSetVersionId) {
        const rs = await repo.findRuleSetVersion(input.ruleSetVersionId);
        if (!rs || rs.status === 'RETIRED')
          throw new AppError('BUSINESS_RULE', 'Bộ quy tắc không tồn tại hoặc đã ngừng áp dụng');
      }
      if (
        input.workCatalogVersionId &&
        !(await repo.findCatalogVersion(input.workCatalogVersionId))
      ) {
        throw new AppError('BUSINESS_RULE', 'Danh mục sản phẩm/công việc không tồn tại');
      }
      try {
        const ok = await withDbErrors(() =>
          repo.replaceItems(
            id,
            input.version,
            {
              generalMax: input.generalMax,
              resultMax: input.resultMax,
              periodTypes: input.periodTypes,
              ruleSetVersionId: input.ruleSetVersionId ?? null,
              workCatalogVersionId: input.workCatalogVersionId ?? null,
              changeNote: input.changeNote ?? null,
            },
            input.items.map((i) => ({
              key: i.key,
              parentKey: i.parentKey ?? null,
              kind: i.kind,
              code: i.code,
              name: i.name,
              description: i.description ?? null,
              maxPoints: i.maxPoints,
              weight: i.weight ?? null,
              scoringMethod: i.scoringMethod ?? null,
              measureUnit: i.measureUnit ?? null,
              direction: i.direction ?? null,
              target: i.target ?? null,
              baseline: i.baseline ?? null,
              allowNotApplicable: i.allowNotApplicable,
              evidenceRequired: i.evidenceRequired,
              dataSource: i.dataSource ?? null,
              sortOrder: i.sortOrder,
            })),
            (tx) =>
              writeAudit(tx, actor, {
                action: 'criteria_version.save_items',
                entityType: 'criteria_version',
                entityId: id,
                changes: {
                  itemCount: input.items.length,
                  generalMax: input.generalMax,
                  resultMax: input.resultMax,
                  changeNote: input.changeNote,
                },
              }),
          ),
        );
        if (!ok) throw conflict();
      } catch (err) {
        if (err instanceof Error && err.message === 'CYCLE')
          throw new AppError('VALIDATION_ERROR', 'Cây tiêu chí có vòng lặp cha–con');
        throw err;
      }
      return toCriteriaVersionDto(await version(id));
    },

    async submit(id: string, input: DecisionInput, actor: AuditActor) {
      assertValid(await version(id));
      return changeStatus(
        id,
        input.version,
        ['DRAFT'],
        'SUBMITTED',
        {},
        'criteria_version.submit',
        input.note,
        actor,
      );
    },

    async approve(auth: AuthContext, id: string, input: DecisionInput, actor: AuditActor) {
      const v = await version(id);
      if (v.createdById && v.createdById === auth.userId) {
        throw new AppError('BUSINESS_RULE', 'Người soạn bộ tiêu chí không được tự phê duyệt');
      }
      assertValid(v);
      return changeStatus(
        id,
        input.version,
        ['SUBMITTED'],
        'APPROVED',
        { approvedById: auth.userId, approvedAt: new Date(), approveNote: input.note },
        'criteria_version.approve',
        input.note,
        actor,
      );
    },

    returnToDraft(id: string, input: DecisionInput, actor: AuditActor) {
      return changeStatus(
        id,
        input.version,
        ['SUBMITTED'],
        'DRAFT',
        {},
        'criteria_version.return',
        input.note,
        actor,
      );
    },

    retire(id: string, input: DecisionInput, actor: AuditActor) {
      return changeStatus(
        id,
        input.version,
        ['APPROVED'],
        'RETIRED',
        {},
        'criteria_version.retire',
        input.note,
        actor,
      );
    },
  };
}
