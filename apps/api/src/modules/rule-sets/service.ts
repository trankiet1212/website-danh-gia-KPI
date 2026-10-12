/**
 * Bộ quy tắc tính điểm, xếp loại có phiên bản (ADR-0003):
 *   DRAFT ──submit──▶ PENDING_CONFIRMATION ──confirm──▶ CONFIRMED ──retire──▶ RETIRED
 *                          └──return──▶ DRAFT
 * Người soạn KHÔNG được tự xác nhận. Bản đã xác nhận là bất biến (trigger DB), muốn đổi phải tạo phiên bản mới.
 */
import type {
  CreateRuleSetInput,
  DecisionInput,
  RuleSetDto,
  RuleSetVersionDto,
  UpdateRuleSetVersionInput,
} from '@kpi/shared';
import type { AuthContext } from '../../auth/types.js';
import { writeAudit, type AuditActor } from '../../lib/audit.js';
import { parseDateOnly, toDateOnly } from '../../lib/dates.js';
import { withDbErrors } from '../../lib/db-errors.js';
import { AppError } from '../../lib/errors.js';
import type { Db } from '../../lib/prisma.js';
import { parseRuleConfig } from '../../scoring/adapter.js';
import { checksumOf } from '../../scoring/checksum.js';
import { createRuleSetsRepository } from './repository.js';

type Repo = ReturnType<typeof createRuleSetsRepository>;
type VersionRow = NonNullable<Awaited<ReturnType<Repo['findVersion']>>>;

export const versionLabel = (v: { versionNo: number; ruleSet: { code: string } }) =>
  `${v.ruleSet.code} v${v.versionNo}`;

export function toVersionDto(v: VersionRow): RuleSetVersionDto {
  return {
    id: v.id,
    ruleSetId: v.ruleSetId,
    versionNo: v.versionNo,
    status: v.status,
    config: parseRuleConfig(v.config),
    legalBasis: v.legalBasis,
    sourceRefs: (v.sourceRefs as RuleSetVersionDto['sourceRefs']) ?? [],
    effectiveFrom: toDateOnly(v.effectiveFrom),
    checksum: v.checksum,
    createdBy: v.createdById,
    confirmedBy: v.confirmedById,
    confirmedAt: v.confirmedAt?.toISOString() ?? null,
    confirmNote: v.confirmNote,
    createdAt: v.createdAt.toISOString(),
    version: v.version,
  };
}

export function createRuleSetsService(db: Db) {
  const repo = createRuleSetsRepository(db);

  async function version(id: string) {
    const v = await repo.findVersion(id);
    if (!v) throw new AppError('NOT_FOUND', 'Không tìm thấy phiên bản bộ quy tắc');
    return v;
  }
  const conflict = () =>
    new AppError('CONFLICT_VERSION', 'Phiên bản đã được người khác cập nhật. Vui lòng tải lại.');

  async function changeStatus(
    id: string,
    expectVersion: number,
    from: VersionRow['status'][],
    to: VersionRow['status'],
    data: Record<string, unknown>,
    action: string,
    actor: AuditActor,
    note?: string,
  ) {
    const v = await version(id);
    if (!from.includes(v.status)) {
      throw new AppError(
        'INVALID_TRANSITION',
        `Không thể chuyển phiên bản từ trạng thái "${v.status}" sang "${to}"`,
      );
    }
    const audit = {
      action,
      entityType: 'rule_set_version',
      entityId: id,
      changes: { from: v.status, to, note },
    };
    const ok = await repo.updateVersioned(id, expectVersion, { status: to, ...data }, (tx) =>
      writeAudit(tx, actor, audit),
    );
    if (ok === 0) throw conflict();
    return toVersionDto(await version(id));
  }

  return {
    async list(): Promise<RuleSetDto[]> {
      return (await repo.list()).map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        description: s.description,
        versions: s.versions.map((v) => {
          const { config: _c, sourceRefs: _s, ...rest } = toVersionDto({ ...v, ruleSet: s });
          return rest;
        }),
      }));
    },

    async getVersion(id: string) {
      return toVersionDto(await version(id));
    },

    async createSet(input: CreateRuleSetInput, actor: AuditActor) {
      const set = await withDbErrors(() =>
        repo.createSet({
          code: input.code,
          name: input.name,
          description: input.description ?? null,
        }),
      );
      await writeAudit(db, actor, {
        action: 'rule_set.create',
        entityType: 'rule_set',
        entityId: set.id,
        changes: input,
      });
      return set;
    },

    /** Tạo phiên bản nháp mới (có thể sao chép từ phiên bản cũ). */
    async createVersion(
      auth: AuthContext,
      ruleSetId: string,
      cloneFromVersionId: string | null,
      actor: AuditActor,
    ) {
      const set = await repo.findSet(ruleSetId);
      if (!set) throw new AppError('NOT_FOUND', 'Không tìm thấy bộ quy tắc');
      // Nguồn: phiên bản được chọn (có thể thuộc bộ quy tắc khác — dùng làm mẫu) hoặc phiên bản mới nhất của bộ này
      const source = cloneFromVersionId ? await version(cloneFromVersionId) : set.versions[0];
      if (!source) {
        throw new AppError(
          'BUSINESS_RULE',
          'Bộ quy tắc chưa có phiên bản — cần chọn một phiên bản (có thể của bộ quy tắc khác) làm mẫu',
        );
      }
      const created = await repo.createNextVersion(ruleSetId, {
        status: 'DRAFT',
        config: source.config as object,
        legalBasis: source.legalBasis,
        sourceRefs: source.sourceRefs as object,
        checksum: checksumOf(source.config),
        createdById: auth.userId,
      });
      await writeAudit(db, actor, {
        action: 'rule_set_version.create',
        entityType: 'rule_set_version',
        entityId: created.id,
        changes: { versionNo: created.versionNo, clonedFrom: source.id },
      });
      return toVersionDto(created);
    },

    async updateVersion(id: string, input: UpdateRuleSetVersionInput, actor: AuditActor) {
      const v = await version(id);
      if (v.status !== 'DRAFT')
        throw new AppError('BUSINESS_RULE', 'Chỉ sửa được phiên bản ở trạng thái bản nháp');
      const data = {
        config: input.config as object,
        legalBasis: input.legalBasis,
        sourceRefs: input.sourceRefs as object,
        effectiveFrom: input.effectiveFrom ? parseDateOnly(input.effectiveFrom) : null,
        checksum: checksumOf(input.config),
      };
      const ok = await repo.updateVersioned(id, input.version, data, (tx) =>
        writeAudit(tx, actor, {
          action: 'rule_set_version.update',
          entityType: 'rule_set_version',
          entityId: id,
          changes: { checksumBefore: v.checksum, checksumAfter: data.checksum },
        }),
      );
      if (ok === 0) throw conflict();
      return toVersionDto(await version(id));
    },

    submit(id: string, input: DecisionInput, actor: AuditActor) {
      return changeStatus(
        id,
        input.version,
        ['DRAFT'],
        'PENDING_CONFIRMATION',
        {},
        'rule_set_version.submit',
        actor,
        input.note,
      );
    },

    async confirm(auth: AuthContext, id: string, input: DecisionInput, actor: AuditActor) {
      const v = await version(id);
      if (v.createdById && v.createdById === auth.userId) {
        throw new AppError('BUSINESS_RULE', 'Người soạn phiên bản không được tự xác nhận áp dụng');
      }
      return changeStatus(
        id,
        input.version,
        ['PENDING_CONFIRMATION'],
        'CONFIRMED',
        { confirmedById: auth.userId, confirmedAt: new Date(), confirmNote: input.note },
        'rule_set_version.confirm',
        actor,
        input.note,
      );
    },

    returnToDraft(id: string, input: DecisionInput, actor: AuditActor) {
      return changeStatus(
        id,
        input.version,
        ['PENDING_CONFIRMATION'],
        'DRAFT',
        {},
        'rule_set_version.return',
        actor,
        input.note,
      );
    },

    retire(id: string, input: DecisionInput, actor: AuditActor) {
      return changeStatus(
        id,
        input.version,
        ['CONFIRMED'],
        'RETIRED',
        {},
        'rule_set_version.retire',
        actor,
        input.note,
      );
    },
  };
}
