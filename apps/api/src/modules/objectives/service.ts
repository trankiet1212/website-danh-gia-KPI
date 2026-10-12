/**
 * Mục tiêu (Objective) và Kết quả then chốt / chỉ tiêu KPI (Key Result) của cá nhân hoặc đơn vị trong một kỳ.
 * Tiến độ KR chỉ để THEO DÕI — không quy đổi thành điểm KPI khi chưa có quy tắc được xác nhận (CLAUDE.md).
 *
 * Phạm vi:
 *  - Xem (objective.read): mục tiêu cá nhân theo phạm vi cán bộ; mục tiêu đơn vị trong phạm vi hoặc đơn vị của chính mình.
 *  - Sửa (objective.write): mục tiêu cá nhân theo phạm vi cán bộ; mục tiêu đơn vị chỉ khi phạm vi bao gồm đơn vị đó.
 */
import type {
  CreateObjectiveInput,
  KeyResultDto,
  KeyResultInput,
  ObjectiveDto,
  UpdateObjectiveInput,
} from '@kpi/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { employeeScopeWhere, resolveScope } from '../../auth/scope.js';
import type { AuthContext, DataScope } from '../../auth/types.js';
import { writeAudit, type AuditActor } from '../../lib/audit.js';
import { parseDateOnly, toDateOnly } from '../../lib/dates.js';
import { withDbErrors } from '../../lib/db-errors.js';
import { AppError } from '../../lib/errors.js';
import type { Db } from '../../lib/prisma.js';
import { krProgress, objectiveProgress } from '../../scoring/kr-progress.js';
import { createObjectivesRepository, type ObjectiveRow } from './repository.js';

const NONE: Prisma.ObjectiveWhereInput = { id: { in: [] } };
const num = (v: { toNumber(): number } | null) => (v === null ? null : v.toNumber());

export function objectiveScopeWhere(
  scope: DataScope | null,
  ownUnitId: string | null,
): Prisma.ObjectiveWhereInput {
  if (!scope) return NONE;
  if (scope.all) return {};
  const units = new Set(scope.unitIds);
  if (ownUnitId) units.add(ownUnitId);
  return {
    OR: [
      { ownerKind: 'EMPLOYEE', ownerEmployee: employeeScopeWhere(scope) },
      { ownerKind: 'UNIT', ownerUnitId: { in: [...units] } },
    ],
  };
}

function toKeyResultDto(k: ObjectiveRow['keyResults'][number]): KeyResultDto {
  const base = {
    measureType: k.measureType,
    direction: k.direction,
    baseline: num(k.baseline),
    target: k.target.toNumber(),
    currentValue: num(k.currentValue),
  };
  return {
    id: k.id,
    code: k.code,
    title: k.title,
    kind: k.kind,
    measureUnit: k.measureUnit,
    weight: num(k.weight),
    dueDate: toDateOnly(k.dueDate),
    ...base,
    progress: krProgress(base),
    checkins: k.checkins.map((c) => ({
      id: c.id,
      value: c.value.toNumber(),
      note: c.note,
      checkedBy: c.checkedById,
      checkedAt: c.checkedAt.toISOString(),
    })),
    version: k.version,
  };
}

export function createObjectivesService(db: Db) {
  const repo = createObjectivesRepository(db);
  const conflict = () =>
    new AppError('CONFLICT_VERSION', 'Dữ liệu đã được người khác cập nhật. Vui lòng tải lại.');

  const readWhere = (auth: AuthContext) =>
    objectiveScopeWhere(resolveScope(auth, 'objective.read'), auth.employee?.unitId ?? null);
  const writeWhere = (auth: AuthContext) =>
    objectiveScopeWhere(resolveScope(auth, 'objective.write'), null);

  async function toDto(auth: AuthContext, o: ObjectiveRow): Promise<ObjectiveDto> {
    const keyResults = o.keyResults.map(toKeyResultDto);
    return {
      id: o.id,
      period: o.period,
      ownerKind: o.ownerKind,
      ownerEmployee: o.ownerEmployee,
      ownerUnit: o.ownerUnit,
      parentObjectiveId: o.parentObjectiveId,
      code: o.code,
      title: o.title,
      description: o.description,
      status: o.status,
      keyResults,
      progress: objectiveProgress(
        keyResults.map((k) => ({ ratio: k.progress.ratio, weight: k.weight })),
      ),
      canEdit: (await repo.count({ AND: [{ id: o.id }, writeWhere(auth)] })) > 0,
      version: o.version,
    };
  }

  async function getWritable(auth: AuthContext, id: string) {
    const o = await repo.find(id, writeWhere(auth));
    if (!o) {
      // Xem được nhưng không sửa được → 403; ngoài phạm vi xem → 404
      if (await repo.find(id, readWhere(auth)))
        throw new AppError('FORBIDDEN', 'Bạn không có quyền sửa mục tiêu này');
      throw new AppError('NOT_FOUND', 'Không tìm thấy mục tiêu');
    }
    return o;
  }

  function krData(input: KeyResultInput) {
    return {
      code: input.code,
      title: input.title,
      kind: input.kind,
      measureType: input.measureType,
      direction: input.direction,
      measureUnit: input.measureUnit ?? null,
      baseline: input.baseline ?? null,
      target: input.target,
      weight: input.weight ?? null,
      dueDate: input.dueDate ? parseDateOnly(input.dueDate) : null,
    };
  }

  return {
    async list(
      auth: AuthContext,
      filter: { periodId?: string; ownerEmployeeId?: string; ownerUnitId?: string },
    ) {
      const rows = await repo.list({
        AND: [
          readWhere(auth),
          filter.periodId ? { periodId: filter.periodId } : {},
          filter.ownerEmployeeId ? { ownerEmployeeId: filter.ownerEmployeeId } : {},
          filter.ownerUnitId ? { ownerUnitId: filter.ownerUnitId } : {},
        ],
      });
      return Promise.all(rows.map((o) => toDto(auth, o)));
    },

    async get(auth: AuthContext, id: string) {
      const o = await repo.find(id, readWhere(auth));
      if (!o) throw new AppError('NOT_FOUND', 'Không tìm thấy mục tiêu');
      return toDto(auth, o);
    },

    async create(auth: AuthContext, input: CreateObjectiveInput, actor: AuditActor) {
      const scope = resolveScope(auth, 'objective.write');
      if (!(await repo.periodExists(input.periodId)))
        throw new AppError('BUSINESS_RULE', 'Kỳ đánh giá không tồn tại');
      if (input.ownerKind === 'EMPLOYEE') {
        const id = input.ownerEmployeeId!;
        if (!(await repo.employeeExists(id)))
          throw new AppError('BUSINESS_RULE', 'Cán bộ không tồn tại');
        // Kiểm tra cán bộ nằm trong phạm vi sửa (qua bảng employees)
        if (!scope || !(await repo.employeeInScope(id, employeeScopeWhere(scope))))
          throw new AppError('FORBIDDEN', 'Cán bộ ngoài phạm vi quản lý của bạn');
      } else {
        const unitId = input.ownerUnitId!;
        if (!(await repo.unitExists(unitId)))
          throw new AppError('BUSINESS_RULE', 'Đơn vị không tồn tại');
        if (!scope || !(scope.all || scope.unitIds.includes(unitId))) {
          throw new AppError('FORBIDDEN', 'Đơn vị ngoài phạm vi quản lý của bạn');
        }
      }
      if (input.parentObjectiveId) {
        const parent = await repo.find(input.parentObjectiveId, readWhere(auth));
        if (!parent || parent.period.id !== input.periodId) {
          throw new AppError('BUSINESS_RULE', 'Mục tiêu cấp trên không tồn tại hoặc khác kỳ');
        }
      }
      const row = await withDbErrors(() =>
        repo.create({
          periodId: input.periodId,
          ownerKind: input.ownerKind,
          ownerEmployeeId: input.ownerKind === 'EMPLOYEE' ? input.ownerEmployeeId! : null,
          ownerUnitId: input.ownerKind === 'UNIT' ? input.ownerUnitId! : null,
          parentObjectiveId: input.parentObjectiveId ?? null,
          code: input.code,
          title: input.title,
          description: input.description ?? null,
          status: 'ACTIVE',
          createdById: auth.userId,
        }),
      );
      await writeAudit(db, actor, {
        action: 'objective.create',
        entityType: 'objective',
        entityId: row.id,
        changes: input,
      });
      return this.get(auth, row.id);
    },

    async update(auth: AuthContext, id: string, input: UpdateObjectiveInput, actor: AuditActor) {
      const before = await getWritable(auth, id);
      const ok = await repo.updateVersioned(
        id,
        input.version,
        { title: input.title, description: input.description ?? null, status: input.status },
        (tx) =>
          writeAudit(tx, actor, {
            action: 'objective.update',
            entityType: 'objective',
            entityId: id,
            changes: { before: { title: before.title, status: before.status }, after: input },
          }),
      );
      if (ok === 0) throw conflict();
      return this.get(auth, id);
    },

    async addKeyResult(
      auth: AuthContext,
      objectiveId: string,
      input: KeyResultInput,
      actor: AuditActor,
    ) {
      const o = await getWritable(auth, objectiveId);
      const kr = await withDbErrors(() =>
        repo.createKeyResult({ ...krData(input), objectiveId, sortOrder: o.keyResults.length + 1 }),
      );
      await writeAudit(db, actor, {
        action: 'key_result.create',
        entityType: 'key_result',
        entityId: kr.id,
        changes: input,
      });
      return this.get(auth, objectiveId);
    },

    async updateKeyResult(
      auth: AuthContext,
      id: string,
      input: KeyResultInput & { version: number },
      actor: AuditActor,
    ) {
      const kr = await repo.findKeyResult(id, writeWhere(auth));
      if (!kr) throw new AppError('NOT_FOUND', 'Không tìm thấy kết quả then chốt');
      const ok = await withDbErrors(() =>
        repo.updateKeyResultVersioned(id, input.version, krData(input), (tx) =>
          writeAudit(tx, actor, {
            action: 'key_result.update',
            entityType: 'key_result',
            entityId: id,
            changes: input,
          }),
        ),
      );
      if (ok === 0) throw conflict();
      return this.get(auth, kr.objectiveId);
    },

    async checkin(
      auth: AuthContext,
      id: string,
      input: { value: number; note?: string | null },
      actor: AuditActor,
    ) {
      const kr = await repo.findKeyResult(id, writeWhere(auth));
      if (!kr) throw new AppError('NOT_FOUND', 'Không tìm thấy kết quả then chốt');
      await repo.checkin(id, input.value, input.note ?? null, auth.userId, (tx) =>
        writeAudit(tx, actor, {
          action: 'key_result.checkin',
          entityType: 'key_result',
          entityId: id,
          changes: { from: num(kr.currentValue), to: input.value, note: input.note },
        }),
      );
      return this.get(auth, kr.objectiveId);
    },
  };
}
