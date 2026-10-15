/**
 * Sổ giao việc hằng ngày (docs/06 §5.7, docs/05 "Giao việc hằng ngày").
 *  - Xem (task.read): theo phạm vi cán bộ.
 *  - Giao/sửa/xóa (task.assign) và đánh giá (task.quality.record): chỉ cấp trên — chức vụ cao hơn, trong phạm vi.
 *  - Báo cáo (task.update): chỉ chính cán bộ được giao, khi việc chưa được đánh giá.
 * Kết quả chỉ để theo dõi — không quy đổi thành điểm (docs/09 #35).
 */
import type {
  CreateDailyTaskInput,
  DailyAssigneeDto,
  DailyTaskDto,
  DailyTaskListQuery,
  EvaluateDailyTaskInput,
  PermissionCode,
  ReportDailyTaskInput,
  UpdateDailyTaskInput,
} from '@kpi/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { employeeScopeWhere, resolveScope, subordinateEmployeeWhere } from '../../auth/scope.js';
import type { AuthContext } from '../../auth/types.js';
import { writeAudit, type AuditActor } from '../../lib/audit.js';
import { parseDateOnly, toDateOnly } from '../../lib/dates.js';
import { AppError } from '../../lib/errors.js';
import type { Db } from '../../lib/prisma.js';
import { createDailyTasksRepository, type DailyTaskRow } from './repository.js';

const NONE: Prisma.DailyTaskWhereInput = { id: { in: [] } };
/** Việc còn "mới giao": cán bộ chưa báo cáo, cấp trên chưa đánh giá → được sửa/xóa. */
const UNTOUCHED: Prisma.DailyTaskWhereInput = { reportStatus: 'PENDING', result: null };

export function createDailyTasksService(db: Db) {
  const repo = createDailyTasksRepository(db);
  const conflict = () =>
    new AppError('CONFLICT_VERSION', 'Công việc đã được người khác cập nhật. Vui lòng tải lại.');

  const readWhere = (auth: AuthContext): Prisma.DailyTaskWhereInput => {
    const scope = resolveScope(auth, 'task.read');
    return scope ? { employee: employeeScopeWhere(scope) } : NONE;
  };
  /** Cán bộ cấp dưới trong phạm vi của quyền (null nếu không có quyền). */
  const subordinates = (auth: AuthContext, perm: PermissionCode) => {
    const scope = resolveScope(auth, perm);
    if (!scope) return null;
    return {
      AND: [employeeScopeWhere(scope), subordinateEmployeeWhere(auth.employee?.positionLevel)],
    } satisfies Prisma.EmployeeWhereInput;
  };
  const actorWhere = (auth: AuthContext, perm: PermissionCode): Prisma.DailyTaskWhereInput => {
    const w = subordinates(auth, perm);
    return w ? { employee: w } : NONE;
  };
  const isSubject = (auth: AuthContext, row: { employeeId: string }) =>
    !!auth.employee && auth.employee.id === row.employeeId;

  async function toDtos(auth: AuthContext, rows: DailyTaskRow[]): Promise<DailyTaskDto[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const allowed = async (perm: PermissionCode) =>
      auth.permissions.has(perm)
        ? new Set(await repo.ids({ AND: [{ id: { in: ids } }, actorWhere(auth, perm)] }))
        : new Set<string>();
    const [assignable, evaluable] = await Promise.all([
      allowed('task.assign'),
      allowed('task.quality.record'),
    ]);
    const userIds = [
      ...new Set(
        rows.flatMap((r) => [r.assignedBy, r.evaluatedBy]).filter((x): x is string => !!x),
      ),
    ];
    const names = new Map(
      (await repo.userNames(userIds)).map((u) => [
        u.id,
        u.employee?.fullName ?? u.displayName ?? u.username,
      ]),
    );
    return rows.map((r) => {
      const untouched = r.reportStatus === 'PENDING' && r.result === null;
      const mine = isSubject(auth, r);
      return {
        id: r.id,
        workDate: toDateOnly(r.workDate),
        title: r.title,
        description: r.description,
        employee: r.employee,
        unitName: r.unit.name,
        reportStatus: r.reportStatus,
        reportNote: r.reportNote,
        reportedAt: r.reportedAt?.toISOString() ?? null,
        result: r.result,
        quality: r.quality,
        timeliness: r.timeliness,
        evalComment: r.evalComment,
        evaluatedBy: r.evaluatedBy ? (names.get(r.evaluatedBy) ?? null) : null,
        evaluatedAt: r.evaluatedAt?.toISOString() ?? null,
        assignedBy: names.get(r.assignedBy) ?? null,
        createdAt: r.createdAt.toISOString(),
        version: r.version,
        can: {
          edit: !mine && assignable.has(r.id) && untouched,
          delete: !mine && assignable.has(r.id) && untouched,
          report: mine && auth.permissions.has('task.update') && r.result === null,
          evaluate: !mine && evaluable.has(r.id),
        },
      };
    });
  }

  async function load(auth: AuthContext, id: string) {
    const row = await repo.find(id, readWhere(auth));
    if (!row) throw new AppError('NOT_FOUND', 'Không tìm thấy công việc');
    return row;
  }
  async function one(auth: AuthContext, id: string) {
    const [dto] = await toDtos(auth, [await load(auth, id)]);
    return dto!;
  }
  /** Người thực hiện phải là cấp trên của cán bộ được giao (và không phải chính cán bộ đó). */
  async function assertSuperior(
    auth: AuthContext,
    row: DailyTaskRow,
    perm: PermissionCode,
    what: string,
  ) {
    if (isSubject(auth, row))
      throw new AppError('FORBIDDEN', `Không được tự ${what} công việc của chính mình`);
    const ok =
      auth.permissions.has(perm) &&
      (await repo.ids({ AND: [{ id: row.id }, actorWhere(auth, perm)] })).length > 0;
    if (!ok)
      throw new AppError(
        'FORBIDDEN',
        `Chỉ cấp trên (chức vụ cao hơn, trong phạm vi quản lý) mới được ${what} công việc này`,
      );
  }
  const assertUntouched = (row: DailyTaskRow) => {
    if (row.reportStatus !== 'PENDING' || row.result !== null)
      throw new AppError(
        'INVALID_TRANSITION',
        'Cán bộ đã báo cáo hoặc công việc đã được đánh giá — không sửa/xóa được nữa',
      );
  };
  const snapshot = (r: DailyTaskRow) => ({
    workDate: toDateOnly(r.workDate),
    title: r.title,
    description: r.description,
    reportStatus: r.reportStatus,
    result: r.result,
    quality: r.quality,
    timeliness: r.timeliness,
    evalComment: r.evalComment,
  });

  return {
    async list(auth: AuthContext, q: DailyTaskListQuery) {
      const rows = await repo.list({
        AND: [
          readWhere(auth),
          { workDate: { gte: parseDateOnly(q.from), lte: parseDateOnly(q.to) } },
          q.employeeId ? { employeeId: q.employeeId } : {},
        ],
      });
      return toDtos(auth, rows);
    },

    /** Cán bộ người dùng được giao việc: cấp dưới trong phạm vi quyền task.assign. */
    async assignees(auth: AuthContext): Promise<DailyAssigneeDto[]> {
      const where = subordinates(auth, 'task.assign');
      if (!where) return [];
      return (await repo.employees(where)).map((e) => ({
        id: e.id,
        employeeCode: e.employeeCode,
        fullName: e.fullName,
        unitName: e.assignments[0]?.unit.name ?? null,
        positionName: e.assignments[0]?.position.name ?? null,
      }));
    },

    async create(auth: AuthContext, input: CreateDailyTaskInput, actor: AuditActor) {
      const where = subordinates(auth, 'task.assign');
      if (!where) throw new AppError('FORBIDDEN', 'Bạn không có quyền giao việc');
      const wanted = [...new Set(input.employeeIds)];
      const emps = await repo.employees({ AND: [{ id: { in: wanted } }, where] });
      if (emps.length !== wanted.length) {
        const found = new Set(emps.map((e) => e.id));
        throw new AppError(
          'FORBIDDEN',
          'Có cán bộ ngoài phạm vi giao việc của bạn — chỉ giao cho cấp dưới (chức vụ thấp hơn) trong phạm vi quản lý',
          { employeeIds: wanted.filter((id) => !found.has(id)) },
        );
      }
      const noUnit = emps.filter((e) => !e.assignments[0]);
      if (noUnit.length > 0)
        throw new AppError(
          'BUSINESS_RULE',
          `Cán bộ chưa có phân công chính đang hiệu lực: ${noUnit.map((e) => e.fullName).join(', ')}`,
        );
      const ids = await repo.createMany(
        emps.map((e) => ({
          employeeId: e.id,
          unitId: e.assignments[0]!.unit.id,
          workDate: parseDateOnly(input.workDate),
          title: input.title,
          description: input.description ?? null,
          assignedBy: auth.userId,
        })),
        async (tx, created) => {
          for (const [i, id] of created.entries())
            await writeAudit(tx, actor, {
              action: 'daily_task.create',
              entityType: 'daily_task',
              entityId: id,
              changes: { employeeId: emps[i]!.id, workDate: input.workDate, title: input.title },
            });
        },
      );
      return toDtos(auth, await repo.list({ id: { in: ids } }));
    },

    async update(auth: AuthContext, id: string, input: UpdateDailyTaskInput, actor: AuditActor) {
      const row = await load(auth, id);
      await assertSuperior(auth, row, 'task.assign', 'sửa');
      assertUntouched(row);
      const ok = await repo.update({
        id,
        expectVersion: input.version,
        where: UNTOUCHED,
        data: {
          workDate: parseDateOnly(input.workDate),
          title: input.title,
          description: input.description ?? null,
        },
        onWrite: (tx) =>
          writeAudit(tx, actor, {
            action: 'daily_task.update',
            entityType: 'daily_task',
            entityId: id,
            changes: { before: snapshot(row), after: input },
          }),
      });
      if (!ok) throw conflict();
      return one(auth, id);
    },

    async remove(auth: AuthContext, id: string, version: number, actor: AuditActor) {
      const row = await load(auth, id);
      await assertSuperior(auth, row, 'task.assign', 'xóa');
      assertUntouched(row);
      const ok = await repo.remove({
        id,
        expectVersion: version,
        where: UNTOUCHED,
        onWrite: (tx) =>
          writeAudit(tx, actor, {
            action: 'daily_task.delete',
            entityType: 'daily_task',
            entityId: id,
            changes: { employeeId: row.employeeId, ...snapshot(row) },
          }),
      });
      if (!ok) throw conflict();
    },

    async report(auth: AuthContext, id: string, input: ReportDailyTaskInput, actor: AuditActor) {
      const row = await load(auth, id);
      if (!isSubject(auth, row))
        throw new AppError('FORBIDDEN', 'Chỉ cán bộ được giao việc mới được báo cáo');
      if (row.result !== null)
        throw new AppError(
          'INVALID_TRANSITION',
          'Công việc đã được cấp trên đánh giá — không sửa báo cáo được nữa',
        );
      const ok = await repo.update({
        id,
        expectVersion: input.version,
        where: { result: null },
        data: {
          reportStatus: input.status,
          reportNote: input.note ?? null,
          reportedAt: new Date(),
        },
        onWrite: (tx) =>
          writeAudit(tx, actor, {
            action: 'daily_task.report',
            entityType: 'daily_task',
            entityId: id,
            changes: { status: input.status, note: input.note ?? null },
          }),
      });
      if (!ok) throw conflict();
      return one(auth, id);
    },

    async evaluate(
      auth: AuthContext,
      id: string,
      input: EvaluateDailyTaskInput,
      actor: AuditActor,
    ) {
      const row = await load(auth, id);
      await assertSuperior(auth, row, 'task.quality.record', 'đánh giá');
      const ok = await repo.update({
        id,
        expectVersion: input.version,
        where: {},
        data: {
          result: input.result,
          quality: input.quality ?? null,
          timeliness: input.timeliness ?? null,
          evalComment: input.comment ?? null,
          evaluatedBy: auth.userId,
          evaluatedAt: new Date(),
        },
        onWrite: (tx) =>
          writeAudit(tx, actor, {
            action: 'daily_task.evaluate',
            entityType: 'daily_task',
            entityId: id,
            changes: {
              before: row.result
                ? {
                    result: row.result,
                    quality: row.quality,
                    timeliness: row.timeliness,
                    comment: row.evalComment,
                  }
                : null,
              after: {
                result: input.result,
                quality: input.quality ?? null,
                timeliness: input.timeliness ?? null,
                comment: input.comment ?? null,
              },
            },
          }),
      });
      if (!ok) throw conflict();
      return one(auth, id);
    },
  };
}
