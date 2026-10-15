/**
 * Hồ sơ đánh giá (docs/06-quy-trinh-trang-thai.md §5.1).
 *
 * Ba lớp điểm TÁCH BIỆT:
 *  - Tự đánh giá (selfInput → selfTotal/selfRating, ảnh chụp SELF khi nộp).
 *  - Thẩm định (reviewInput → reviewTotal/reviewRating, ảnh chụp REVIEW khi hoàn tất thẩm định).
 *    Mục người thẩm định chưa chấm lại được lấy theo dữ liệu tự đánh giá và ghi rõ trong phần giải thích.
 *  - Phê duyệt (approvedTotal/approvedRating, ảnh chụp APPROVAL; hồ sơ bị khóa — trigger DB).
 *
 * Mỗi ảnh chụp lưu: dữ liệu đầu vào, phiên bản engine, checksum bộ quy tắc, phiên bản bộ tiêu chí, kết quả và checksum.
 * Hồ sơ đã phê duyệt chỉ được điều chỉnh qua "mở lại" (quyền evaluation.reopen + lý do, revision + 1).
 *
 * Cấp trên đánh giá cấp dưới (docs/05 "Đánh giá theo cấp quản lý"): tạo hồ sơ (lãnh đạo), giao nhiệm vụ,
 * thẩm định, trả lại, phê duyệt, mở lại — người thực hiện phải có chức vụ cao hơn đối tượng và đối tượng
 * nằm trong phạm vi của quyền tương ứng.
 */
import type {
  ApproveEvaluationInput,
  AssignedTaskRow,
  AssignTasksInput,
  CalculationDto,
  CompositeRow,
  CreateEvaluationInput,
  EvaluationDetail,
  EvaluationHistoryDto,
  EvaluationListItem,
  EvaluationListQuery,
  EvaluationStatus,
  ItemInput,
  ItemScore,
  PermissionCode,
  SaveEvaluationInputs,
  ScoreResult,
} from '@kpi/shared';
import { EVALUATION_STATUSES, PERIOD_STATUS_LABELS } from '@kpi/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { employeeScopeWhere, resolveScope, subordinateEmployeeWhere } from '../../auth/scope.js';
import type { AuthContext, DataScope } from '../../auth/types.js';
import { writeAudit, type AuditActor } from '../../lib/audit.js';
import { withDbErrors } from '../../lib/db-errors.js';
import { AppError } from '../../lib/errors.js';
import type { Db } from '../../lib/prisma.js';
import {
  parseItemInput,
  parseRuleConfig,
  runCalculation,
  type CalculationSnapshot,
} from '../../scoring/adapter.js';
import {
  ACTION_LABELS,
  canTransition,
  nextStatus,
  periodAllows,
  type EvaluationAction,
} from '../../workflow/evaluation-state.js';
import { toCriteriaVersionDto } from '../criteria/service.js';
import {
  createEvaluationsRepository,
  type EvaluationDetailRow,
  type EvaluationListRow,
  type HistoryEntry,
} from './repository.js';

type Layer = 'self' | 'review';
const NONE: Prisma.EvaluationRecordWhereInput = { id: { in: [] } };
/** Cảnh báo luôn có khi quy tắc chưa xác nhận — không tính là "cảnh báo chặn nộp". */
const NON_BLOCKING_WARNINGS = new Set(['RULE_NOT_CONFIRMED', 'PROVISIONAL_RULE']);

/** Lọc hồ sơ đánh giá theo phạm vi: đơn vị lúc tạo hồ sơ, cấp dưới trực tiếp, hoặc chính mình. */
export function evaluationScopeWhere(scope: DataScope | null): Prisma.EvaluationRecordWhereInput {
  if (!scope) return NONE;
  if (scope.all) return {};
  const or: Prisma.EvaluationRecordWhereInput[] = [];
  if (scope.unitIds.length > 0) or.push({ unitId: { in: scope.unitIds } });
  if (scope.managerEmployeeId) {
    or.push({
      subjectEmployee: {
        assignments: {
          some: { isPrimary: true, endDate: null, managerEmployeeId: scope.managerEmployeeId },
        },
      },
    });
  }
  if (scope.selfEmployeeId) or.push({ subjectEmployeeId: scope.selfEmployeeId });
  return or.length > 0 ? { OR: or } : NONE;
}

/** Các quyền chỉ cấp trên được thực hiện trên hồ sơ của cán bộ. */
const SUPERIOR_ONLY: ReadonlySet<PermissionCode> = new Set<PermissionCode>([
  'evaluation.review',
  'evaluation.approve',
  'evaluation.reopen',
  'task.assign',
]);

const EMPTY_EXECUTION = {
  completedQty: 0,
  reworkQty: 0,
  reworkCount: 0,
  lateQty: 0,
  lateCount: 0,
  exemptCount: 0,
  exemptNote: null,
  exceeded: false,
} satisfies Partial<CompositeRow>;

const rowKey = (r: { label: string; catalogItemCode?: string | null }) =>
  `${r.label.trim().toLowerCase()}|${r.catalogItemCode ?? ''}`;

/**
 * Cấp trên giao lại danh sách nhiệm vụ (docs/06 §5.6): dòng giao trùng tên + mã danh mục giữ số liệu
 * cán bộ đã nhập; dòng bỏ khỏi danh sách giao bị xóa; dòng cán bộ tự thêm giữ nguyên (xếp sau).
 */
export function mergeAssignedRows(
  current: CompositeRow[],
  assigned: AssignedTaskRow[],
): CompositeRow[] {
  const previous = new Map(current.filter((r) => r.assigned).map((r) => [rowKey(r), r]));
  const own = current.filter((r) => !r.assigned);
  const next = assigned.map((a) => ({
    ...EMPTY_EXECUTION,
    ...previous.get(rowKey(a)),
    label: a.label,
    catalogItemCode: a.catalogItemCode ?? null,
    coefficient: a.coefficient,
    plannedQty: a.plannedQty,
    assigned: true,
  }));
  return [...next, ...own];
}

/**
 * Khi cán bộ lưu tự đánh giá: giữ nguyên phần kế hoạch (tên, mã danh mục, hệ số, SL kế hoạch) của các
 * dòng cấp trên giao — kể cả khi bị xóa/sửa ở phía người dùng; dòng tự thêm không được gắn cờ "giao".
 */
export function protectAssignedRows(
  stored: CompositeRow[],
  incoming: CompositeRow[],
): CompositeRow[] {
  const locked = stored.filter((r) => r.assigned);
  const incomingAssigned = incoming.filter((r) => r.assigned);
  const own = incoming.filter((r) => !r.assigned).map((r) => ({ ...r, assigned: undefined }));
  const kept = locked.map((l, i) => ({
    ...(incomingAssigned[i] ?? l),
    label: l.label,
    catalogItemCode: l.catalogItemCode ?? null,
    coefficient: l.coefficient,
    plannedQty: l.plannedQty,
    assigned: true,
  }));
  return [...kept, ...own];
}

const num = (v: { toNumber(): number } | null) => (v === null ? null : v.toNumber());
const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;

function toListItem(r: EvaluationListRow): EvaluationListItem {
  return {
    id: r.id,
    period: r.period,
    subjectKind: r.subjectKind,
    employee: r.subjectEmployee,
    unitName: r.unit.name,
    kpiProfile: r.kpiProfile,
    status: r.status,
    revisionNo: r.revisionNo,
    selfTotal: num(r.selfTotal),
    reviewTotal: num(r.reviewTotal),
    approvedTotal: num(r.approvedTotal),
    selfRating: r.selfRating,
    reviewRating: r.reviewRating,
    approvedRating: r.approvedRating,
    isDemo: r.isDemo,
    updatedAt: r.updatedAt.toISOString(),
    version: r.version,
  };
}

function toCalcDto(c: EvaluationDetailRow['calculations'][number]): CalculationDto {
  return {
    id: c.id,
    kind: c.kind,
    revisionNo: c.revisionNo,
    engineVersion: c.engineVersion,
    ruleSetVersionId: c.ruleSetVersionId,
    criteriaVersionId: c.criteriaVersionId,
    checksum: c.checksum,
    createdAt: c.createdAt.toISOString(),
    createdBy: c.createdById,
    result: c.result as unknown as ScoreResult,
  };
}

/** Các mục lá chưa có điểm (thiếu dữ liệu) — để báo lỗi rõ ràng khi nộp/hoàn tất. */
function missingItems(result: ScoreResult): string[] {
  const out: string[] = [];
  const walk = (items: ItemScore[]) => {
    for (const i of items) {
      if (i.children?.length && i.kind === 'GENERAL_GROUP') walk(i.children);
      else if (!i.notApplicable && i.points === null) out.push(`${i.code} ${i.name}`);
    }
  };
  walk(result.general.items);
  walk(result.result.items);
  return out;
}

/** Dữ liệu chấm theo lớp. Lớp thẩm định: mục chưa chấm lại → lấy theo tự đánh giá. */
function layerInputs(row: EvaluationDetailRow, layer: Layer) {
  const codeById = new Map(row.criteriaVersion.items.map((i) => [i.id, i.code]));
  const inputs: Record<string, ItemInput | undefined> = {};
  const inherited: string[] = [];
  for (const it of row.items) {
    const self = parseItemInput(it.selfInput);
    if (layer === 'self') {
      inputs[it.criteriaItemId] = self;
      continue;
    }
    const review = parseItemInput(it.reviewInput);
    inputs[it.criteriaItemId] = review ?? self;
    if (!review && self) inherited.push(codeById.get(it.criteriaItemId) ?? it.criteriaItemId);
  }
  return { inputs, inherited };
}

export function calculateLayer(row: EvaluationDetailRow, layer: Layer): CalculationSnapshot {
  const { inputs, inherited } = layerInputs(row, layer);
  return runCalculation({
    profile: row.kpiProfile,
    generalMax: row.criteriaVersion.generalMax.toNumber(),
    resultMax: row.criteriaVersion.resultMax.toNumber(),
    items: row.criteriaVersion.items,
    inputs,
    flags: layer === 'review' ? row.reviewFlags : [],
    ruleConfig: row.ruleSetVersion.config,
    ruleChecksum: row.ruleSetVersion.checksum,
    ruleConfirmed: row.ruleSetVersion.status === 'CONFIRMED',
    criteriaVersionId: row.criteriaVersionId,
    notes:
      inherited.length > 0
        ? [
            `Lớp thẩm định: các mục chưa chấm lại được lấy theo dữ liệu tự đánh giá — ${inherited.sort().join(', ')}.`,
          ]
        : [],
  });
}

/** Lý do chưa thể phê duyệt (không phụ thuộc người xem). */
export function approvalBlockers(row: EvaluationDetailRow): string[] {
  const out: string[] = [];
  const rs = row.ruleSetVersion;
  if (rs.status !== 'CONFIRMED') {
    out.push(
      `Bộ quy tắc ${rs.ruleSet.code} v${rs.versionNo} chưa được xác nhận (trạng thái: ${rs.status}) — chỉ được tính thử, không được chốt kết quả.`,
    );
  }
  if (row.criteriaVersion.status !== 'APPROVED') {
    out.push(
      `Bộ tiêu chí ${row.criteriaVersion.criteriaSet.code} v${row.criteriaVersion.versionNo} chưa được phê duyệt (trạng thái: ${row.criteriaVersion.status}).`,
    );
  }
  if (!row.period.isRated) out.push(`Kỳ ${row.period.code} không xếp loại riêng.`);
  if (!periodAllows(row.period.status, 'approve', row.status)) {
    out.push(
      `Kỳ ${row.period.code} đang ở trạng thái "${PERIOD_STATUS_LABELS[row.period.status]}" — chưa/không được phê duyệt.`,
    );
  }
  const reviewed = row.calculations.some(
    (c) => c.kind === 'REVIEW' && c.revisionNo === row.revisionNo,
  );
  if (!reviewed) out.push('Hồ sơ chưa hoàn tất thẩm định ở lần điều chỉnh hiện tại.');
  return out;
}

export function createEvaluationsService(db: Db) {
  const repo = createEvaluationsRepository(db);
  const conflict = () =>
    new AppError('CONFLICT_VERSION', 'Hồ sơ đã được người khác cập nhật. Vui lòng tải lại.');

  const scopeOf = (auth: AuthContext, perm: PermissionCode) =>
    evaluationScopeWhere(resolveScope(auth, perm));
  /** Phạm vi thao tác: quyền đánh giá chỉ áp lên hồ sơ của cán bộ cấp dưới (chức vụ thấp hơn). */
  const actorScope = (
    auth: AuthContext,
    perm: PermissionCode,
  ): Prisma.EvaluationRecordWhereInput =>
    SUPERIOR_ONLY.has(perm)
      ? {
          AND: [
            scopeOf(auth, perm),
            { subjectEmployee: subordinateEmployeeWhere(auth.employee?.positionLevel) },
          ],
        }
      : scopeOf(auth, perm);
  const covers = async (auth: AuthContext, id: string, perm: PermissionCode) =>
    auth.permissions.has(perm) && (await repo.count({ AND: [{ id }, actorScope(auth, perm)] })) > 0;

  /**
   * Cán bộ người dùng được tạo hồ sơ (docs/05): lãnh đạo (evaluation.review) — cấp dưới trong phạm vi và
   * chính mình; Cán bộ tổng hợp (period.manage, không có evaluation.review) — mọi cán bộ trong phạm vi xem.
   */
  function creatableWhere(auth: AuthContext): Prisma.EmployeeWhereInput | null {
    const review = resolveScope(auth, 'evaluation.review');
    if (review) {
      const or: Prisma.EmployeeWhereInput[] = [
        {
          AND: [employeeScopeWhere(review), subordinateEmployeeWhere(auth.employee?.positionLevel)],
        },
      ];
      if (auth.employee) or.push({ id: auth.employee.id });
      return { OR: or };
    }
    const read = auth.permissions.has('period.manage')
      ? resolveScope(auth, 'evaluation.read')
      : null;
    return read ? employeeScopeWhere(read) : null;
  }
  function assertCanCreate(auth: AuthContext) {
    const where = creatableWhere(auth);
    if (!where) throw new AppError('FORBIDDEN', 'Bạn không có quyền tạo hồ sơ đánh giá');
    return where;
  }
  const isSubject = (auth: AuthContext, row: { subjectEmployeeId: string | null }) =>
    !!auth.employee && auth.employee.id === row.subjectEmployeeId;

  async function load(auth: AuthContext, id: string) {
    const row = await repo.find(id, scopeOf(auth, 'evaluation.read'));
    if (!row) throw new AppError('NOT_FOUND', 'Không tìm thấy hồ sơ đánh giá');
    return row;
  }

  function assertTransition(row: EvaluationDetailRow, action: EvaluationAction) {
    if (canTransition(row.status, action)) return;
    if (row.status === 'APPROVED') {
      throw new AppError(
        'INVALID_TRANSITION',
        'Hồ sơ đã phê duyệt bị khóa — muốn điều chỉnh phải thực hiện quy trình mở lại.',
      );
    }
    throw new AppError(
      'INVALID_TRANSITION',
      `Không thể "${ACTION_LABELS[action]}" khi hồ sơ đang ở trạng thái ${row.status}`,
    );
  }

  function assertPeriodAllows(row: EvaluationDetailRow, action: EvaluationAction) {
    if (!periodAllows(row.period.status, action, row.status)) {
      throw new AppError(
        'BUSINESS_RULE',
        `Kỳ ${row.period.code} đang ở trạng thái "${PERIOD_STATUS_LABELS[row.period.status]}" — chưa/không được "${ACTION_LABELS[action]}"`,
      );
    }
  }

  /** Người thực hiện thao tác thẩm định/phê duyệt/mở lại: phải có quyền + phạm vi và không phải đối tượng được đánh giá. */
  async function assertActor(
    auth: AuthContext,
    row: EvaluationDetailRow,
    perm: PermissionCode,
    what: string,
  ) {
    if (isSubject(auth, row))
      throw new AppError('FORBIDDEN', `Không được tự ${what} hồ sơ của chính mình`);
    if (!(await covers(auth, row.id, perm)))
      throw new AppError(
        'FORBIDDEN',
        `Hồ sơ ngoài phạm vi ${what} của bạn — chỉ cấp trên (chức vụ cao hơn, trong phạm vi quản lý) mới được ${what}`,
      );
  }

  function validateItems(row: EvaluationDetailRow, input: SaveEvaluationInputs) {
    const ids = new Set(row.criteriaVersion.items.map((i) => i.id));
    const bad = input.items.filter((i) => !ids.has(i.criteriaItemId));
    if (bad.length > 0)
      throw new AppError('VALIDATION_ERROR', 'Có mục không thuộc bộ tiêu chí của hồ sơ', {
        items: bad.map((b) => b.criteriaItemId),
      });
    return input.items.map((i) => ({
      criteriaItemId: i.criteriaItemId,
      input: json(i.input),
      note: i.note ?? null,
    }));
  }

  function assertComplete(snap: CalculationSnapshot, what: string) {
    const errors = snap.result.issues.filter((i) => i.level === 'error');
    const missing = missingItems(snap.result);
    if (!snap.result.complete) {
      throw new AppError(
        'BUSINESS_RULE',
        `Chưa thể ${what}: còn thiếu dữ liệu hoặc dữ liệu không hợp lệ`,
        { missing, errors },
      );
    }
  }

  const calcData = (
    row: EvaluationDetailRow,
    kind: 'SELF' | 'REVIEW' | 'APPROVAL',
    snap: CalculationSnapshot,
    userId: string,
  ) => ({
    kind,
    revisionNo: row.revisionNo,
    engineVersion: snap.engineVersion,
    ruleSetVersionId: row.ruleSetVersionId,
    ruleSetChecksum: snap.ruleSetChecksum,
    criteriaVersionId: row.criteriaVersionId,
    inputs: json(snap.inputs),
    result: json(snap.result),
    checksum: snap.checksum,
    createdById: userId,
  });

  const history = (
    auth: AuthContext,
    action: string,
    from: EvaluationStatus,
    to: EvaluationStatus | null,
    comment?: string | null,
  ): HistoryEntry => ({
    action,
    fromStatus: from,
    toStatus: to,
    actorUserId: auth.userId,
    comment: comment ?? null,
  });

  async function detail(auth: AuthContext, id: string): Promise<EvaluationDetail> {
    const row = await load(auth, id);
    const subject = isSubject(auth, row);
    const [canReview, canApprove, canReopen, canAssign] = await Promise.all([
      covers(auth, id, 'evaluation.review'),
      covers(auth, id, 'evaluation.approve'),
      covers(auth, id, 'evaluation.reopen'),
      covers(auth, id, 'task.assign'),
    ]);
    const blockers = approvalBlockers(row);
    const actorIds = [
      ...new Set(row.history.map((h) => h.actorUserId).filter((x): x is string => !!x)),
    ];
    const names = new Map(
      (await repo.userNames(actorIds)).map((u) => [
        u.id,
        u.employee?.fullName ?? u.displayName ?? u.username,
      ]),
    );
    const current = row.calculations.filter((c) => c.revisionNo === row.revisionNo);
    const latest: EvaluationDetail['latest'] = {};
    for (const c of current) if (c.kind !== 'TRIAL') latest[c.kind] = toCalcDto(c);
    const selfOk =
      subject && auth.permissions.has('evaluation.self') && canTransition(row.status, 'saveSelf');
    const reviewOk = !subject && canReview;
    const allowed = (a: EvaluationAction) =>
      canTransition(row.status, a) && periodAllows(row.period.status, a, row.status);
    const rs = row.ruleSetVersion;

    return {
      ...toListItem(row),
      criteriaVersion: toCriteriaVersionDto(row.criteriaVersion),
      ruleSetVersion: {
        id: rs.id,
        label: `${rs.ruleSet.code} v${rs.versionNo}`,
        status: rs.status,
        config: parseRuleConfig(rs.config),
      },
      items: row.items.map((i) => ({
        criteriaItemId: i.criteriaItemId,
        selfInput: i.selfInput,
        reviewInput: i.reviewInput,
        selfNote: i.selfNote,
        reviewNote: i.reviewNote,
      })),
      reviewFlags: row.reviewFlags,
      ratingOverrideReason: row.ratingOverrideReason,
      lockedAt: row.lockedAt?.toISOString() ?? null,
      latest,
      approvals: row.calculations.filter((c) => c.kind === 'APPROVAL').map(toCalcDto),
      history: row.history.map((h): EvaluationHistoryDto => ({
        id: h.id,
        action: h.action,
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        actor: h.actorUserId ? (names.get(h.actorUserId) ?? null) : null,
        comment: h.comment,
        createdAt: h.createdAt.toISOString(),
      })),
      can: {
        editSelf: selfOk && allowed('saveSelf'),
        submit: selfOk && allowed('submit'),
        editReview: reviewOk && allowed('saveReview'),
        completeReview: reviewOk && allowed('completeReview'),
        return: reviewOk && allowed('return'),
        approve: !subject && canApprove && allowed('approve') && blockers.length === 0,
        reopen: !subject && canReopen && allowed('reopen'),
        assignTasks:
          !subject &&
          canAssign &&
          allowed('assignTasks') &&
          row.criteriaVersion.items.some((i) => i.scoringMethod === 'KPI_COMPOSITE'),
      },
      approvalBlockers: blockers,
    };
  }

  /** Chọn phiên bản bộ tiêu chí: ưu tiên bộ theo VTVL, đã phê duyệt, số phiên bản cao nhất. */
  async function pickCriteria(
    kpiProfile: 'LEADER' | 'STAFF',
    jobPositionId: string | null,
    periodType: 'MONTH' | 'QUARTER' | 'HALF_YEAR' | 'YEAR',
    explicitId?: string | null,
  ) {
    if (explicitId) {
      const cv = await repo.criteriaVersion(explicitId);
      if (!cv || !['SUBMITTED', 'APPROVED'].includes(cv.status)) {
        throw new AppError(
          'BUSINESS_RULE',
          'Bộ tiêu chí không tồn tại hoặc chưa được trình/phê duyệt',
        );
      }
      if (cv.criteriaSet.kpiProfile !== kpiProfile)
        throw new AppError(
          'BUSINESS_RULE',
          'Bộ tiêu chí không đúng nhóm đối tượng (lãnh đạo/chuyên viên)',
        );
      if (!cv.periodTypes.includes(periodType))
        throw new AppError('BUSINESS_RULE', 'Bộ tiêu chí không áp dụng cho loại kỳ này');
      if (!cv.ruleSetVersionId)
        throw new AppError('BUSINESS_RULE', 'Bộ tiêu chí chưa gắn bộ quy tắc tính điểm');
      return { id: cv.id, ruleSetVersionId: cv.ruleSetVersionId };
    }
    const list = await repo.candidateCriteriaVersions(kpiProfile, jobPositionId, periodType);
    const rank = (c: (typeof list)[number]) =>
      (c.criteriaSet.jobPositionId && c.criteriaSet.jobPositionId === jobPositionId ? 100 : 0) +
      (c.status === 'APPROVED' ? 10 : 0);
    const best = [...list].sort((a, b) => rank(b) - rank(a) || b.versionNo - a.versionNo)[0];
    if (!best?.ruleSetVersionId) return null;
    return { id: best.id, ruleSetVersionId: best.ruleSetVersionId };
  }

  async function assertPeriodForCreate(periodId: string) {
    const period = await repo.period(periodId);
    if (!period) throw new AppError('BUSINESS_RULE', 'Kỳ đánh giá không tồn tại');
    if (period.status === 'CLOSED')
      throw new AppError('BUSINESS_RULE', `Kỳ ${period.code} đã đóng`);
    if (!period.isRated) {
      throw new AppError(
        'BUSINESS_RULE',
        `Kỳ ${period.code} không xếp loại riêng (kết quả được tổng hợp vào đánh giá năm)`,
      );
    }
    return period;
  }

  async function createOne(
    auth: AuthContext,
    period: { id: string; type: 'MONTH' | 'QUARTER' | 'HALF_YEAR' | 'YEAR' },
    emp: Awaited<ReturnType<typeof repo.employeesWithAssignment>>[number],
    explicitCriteriaId: string | null | undefined,
    actor: AuditActor,
  ) {
    const asg = emp.assignments[0];
    if (!asg)
      throw new AppError('BUSINESS_RULE', `${emp.fullName}: chưa có phân công chính đang hiệu lực`);
    const profile = asg.position.kpiProfile;
    const cv = await pickCriteria(
      profile,
      asg.jobPosition?.id ?? null,
      period.type,
      explicitCriteriaId,
    );
    if (!cv)
      throw new AppError(
        'BUSINESS_RULE',
        `${emp.fullName}: chưa có bộ tiêu chí phù hợp (${profile}, ${period.type})`,
      );
    return withDbErrors(() =>
      repo.create(
        {
          periodId: period.id,
          subjectKind: 'EMPLOYEE',
          subjectEmployeeId: emp.id,
          unitId: asg.unit.id,
          assignmentSnapshot: json({
            unit: asg.unit,
            position: { id: asg.position.id, name: asg.position.name },
            jobPosition: asg.jobPosition,
            managerEmployeeId: asg.managerEmployeeId,
          }),
          kpiProfile: profile,
          criteriaVersionId: cv.id,
          ruleSetVersionId: cv.ruleSetVersionId,
          createdById: auth.userId,
        },
        auth.userId,
        (tx, recordId) =>
          writeAudit(tx, actor, {
            action: 'evaluation.create',
            entityType: 'evaluation_record',
            entityId: recordId,
            changes: { periodId: period.id, employeeId: emp.id, criteriaVersionId: cv.id },
          }),
      ),
    );
  }

  return {
    evaluationScopeWhere,
    detail,

    async list(auth: AuthContext, q: EvaluationListQuery) {
      if (q.status && !(EVALUATION_STATUSES as readonly string[]).includes(q.status)) {
        throw new AppError('VALIDATION_ERROR', 'Trạng thái lọc không hợp lệ');
      }
      const where: Prisma.EvaluationRecordWhereInput = {
        AND: [
          scopeOf(auth, 'evaluation.read'),
          q.periodId ? { periodId: q.periodId } : {},
          q.unitId ? { unitId: q.unitId } : {},
          q.status ? { status: q.status as EvaluationStatus } : {},
          q.q
            ? {
                subjectEmployee: {
                  OR: [
                    { fullName: { contains: q.q, mode: 'insensitive' } },
                    { employeeCode: { contains: q.q, mode: 'insensitive' } },
                  ],
                },
              }
            : {},
        ],
      };
      const { rows, total } = await repo.list(where, (q.page - 1) * q.pageSize, q.pageSize);
      return { data: rows.map(toListItem), meta: { page: q.page, pageSize: q.pageSize, total } };
    },

    async create(auth: AuthContext, input: CreateEvaluationInput, actor: AuditActor) {
      const where = assertCanCreate(auth);
      const period = await assertPeriodForCreate(input.periodId);
      const [emp] = await repo.employeesWithAssignment({
        AND: [{ id: input.employeeId }, where],
      });
      if (!emp)
        throw new AppError(
          'NOT_FOUND',
          'Không tìm thấy cán bộ trong phạm vi bạn được tạo hồ sơ (cấp dưới trong phạm vi quản lý hoặc chính mình), hoặc cán bộ không còn công tác',
        );
      const id = await createOne(auth, period, emp, input.criteriaVersionId, actor);
      return detail(auth, id);
    },

    /** Tạo hồ sơ còn thiếu cho mọi cán bộ trong phạm vi (tùy chọn theo đơn vị). Không ghi đè hồ sơ đã có. */
    async generate(
      auth: AuthContext,
      input: { periodId: string; unitId?: string | null },
      actor: AuditActor,
    ) {
      const where = assertCanCreate(auth);
      const period = await assertPeriodForCreate(input.periodId);
      const employees = await repo.employeesWithAssignment({
        AND: [
          where,
          input.unitId
            ? { assignments: { some: { isPrimary: true, endDate: null, unitId: input.unitId } } }
            : {},
        ],
      });
      const existing = new Set(
        (await repo.existingSubjects(period.id)).map((e) => e.subjectEmployeeId),
      );
      let created = 0;
      const skipped: { employee: string; reason: string }[] = [];
      for (const emp of employees) {
        if (existing.has(emp.id)) continue;
        try {
          await createOne(auth, period, emp, null, actor);
          created++;
        } catch (err) {
          if (!(err instanceof AppError)) throw err;
          skipped.push({ employee: `${emp.employeeCode} — ${emp.fullName}`, reason: err.message });
        }
      }
      return { created, existing: existing.size, skipped };
    },

    /** Tính thử theo dữ liệu đang lưu — KHÔNG lưu kết quả, không đổi trạng thái. */
    async trial(auth: AuthContext, id: string, layer: Layer) {
      const row = await load(auth, id);
      const snap = calculateLayer(row, layer);
      return {
        layer,
        engineVersion: snap.engineVersion,
        ruleSetChecksum: snap.ruleSetChecksum,
        result: snap.result,
      };
    },

    async saveSelf(auth: AuthContext, id: string, input: SaveEvaluationInputs, actor: AuditActor) {
      const row = await load(auth, id);
      if (!isSubject(auth, row))
        throw new AppError('FORBIDDEN', 'Chỉ người được đánh giá mới được tự đánh giá');
      assertTransition(row, 'saveSelf');
      assertPeriodAllows(row, 'saveSelf');
      if (input.flags?.length)
        throw new AppError('VALIDATION_ERROR', 'Cờ điều kiện xếp loại do người thẩm định ghi nhận');
      const stored = new Map(row.items.map((i) => [i.criteriaItemId, parseItemInput(i.selfInput)]));
      const items = validateItems(row, {
        ...input,
        items: input.items.map((i) => {
          const before = stored.get(i.criteriaItemId)?.rows ?? [];
          if (!before.some((r) => r.assigned) && !i.input.rows?.some((r) => r.assigned)) return i;
          return {
            ...i,
            input: { ...i.input, rows: protectAssignedRows(before, i.input.rows ?? []) },
          };
        }),
      });
      const to = nextStatus(row.status, 'saveSelf')!;
      const ok = await repo.saveInputs({
        id,
        expectVersion: input.version,
        from: [row.status],
        data: { status: to },
        layer: 'self',
        items,
        history: to !== row.status ? history(auth, 'saveSelf', row.status, to) : null,
        onWrite: (tx) =>
          writeAudit(tx, actor, {
            action: 'evaluation.save_self',
            entityType: 'evaluation_record',
            entityId: id,
            changes: { itemCount: items.length },
          }),
      });
      if (!ok) throw conflict();
      return detail(auth, id);
    },

    async submit(
      auth: AuthContext,
      id: string,
      input: { comment?: string | null; version: number },
      actor: AuditActor,
    ) {
      const row = await load(auth, id);
      if (!isSubject(auth, row))
        throw new AppError('FORBIDDEN', 'Chỉ người được đánh giá mới được nộp tự đánh giá');
      assertTransition(row, 'submit');
      assertPeriodAllows(row, 'submit');
      const snap = calculateLayer(row, 'self');
      assertComplete(snap, 'nộp');
      const rule = parseRuleConfig(row.ruleSetVersion.config);
      const warnings = snap.result.issues.filter(
        (i) => i.level === 'warning' && !NON_BLOCKING_WARNINGS.has(i.code),
      );
      if (rule.validation.blockSubmitOnWarnings && warnings.length > 0) {
        throw new AppError(
          'BUSINESS_RULE',
          'Chưa thể nộp: còn cảnh báo cần xử lý (bộ quy tắc yêu cầu không còn cảnh báo)',
          { warnings },
        );
      }
      const ok = await repo.transition({
        id,
        expectVersion: input.version,
        from: [row.status],
        data: {
          status: 'SUBMITTED',
          selfTotal: snap.result.totalRounded,
          selfRating: snap.result.rating.eligible,
          submittedAt: new Date(),
        },
        calculation: calcData(row, 'SELF', snap, auth.userId),
        history: history(auth, 'submit', row.status, 'SUBMITTED', input.comment),
        onWrite: (tx) =>
          writeAudit(tx, actor, {
            action: 'evaluation.submit',
            entityType: 'evaluation_record',
            entityId: id,
            changes: {
              selfTotal: snap.result.totalRounded,
              selfRating: snap.result.rating.eligible,
              checksum: snap.checksum,
            },
          }),
      });
      if (!ok) throw conflict();
      return detail(auth, id);
    },

    /** Cấp trên giao danh sách nhiệm vụ cho cán bộ (docs/06 §5.6) — không đổi trạng thái hồ sơ. */
    async assignTasks(auth: AuthContext, id: string, input: AssignTasksInput, actor: AuditActor) {
      const row = await load(auth, id);
      if (isSubject(auth, row))
        throw new AppError('FORBIDDEN', 'Không được tự giao nhiệm vụ cho chính mình');
      if (!(await covers(auth, id, 'task.assign')))
        throw new AppError(
          'FORBIDDEN',
          'Chỉ cấp trên (chức vụ cao hơn, trong phạm vi quản lý) mới được giao nhiệm vụ cho cán bộ này',
        );
      assertTransition(row, 'assignTasks');
      assertPeriodAllows(row, 'assignTasks');
      const criteria = new Map(row.criteriaVersion.items.map((i) => [i.id, i]));
      const bad = input.items.filter(
        (i) => criteria.get(i.criteriaItemId)?.scoringMethod !== 'KPI_COMPOSITE',
      );
      if (bad.length > 0)
        throw new AppError(
          'VALIDATION_ERROR',
          'Chỉ giao nhiệm vụ cho mục chấm theo phương pháp KPI tổng hợp của bộ tiêu chí hồ sơ',
          { items: bad.map((b) => b.criteriaItemId) },
        );
      const saved = new Map(row.items.map((i) => [i.criteriaItemId, i]));
      const items = input.items.map((i) => {
        const s = saved.get(i.criteriaItemId);
        const before = parseItemInput(s?.selfInput) ?? {};
        return {
          criteriaItemId: i.criteriaItemId,
          input: json({ ...before, rows: mergeAssignedRows(before.rows ?? [], i.rows) }),
          note: s?.selfNote ?? null,
        };
      });
      const count = input.items.reduce((n, i) => n + i.rows.length, 0);
      const ok = await repo.saveInputs({
        id,
        expectVersion: input.version,
        from: [row.status],
        data: {},
        layer: 'self',
        items,
        history: history(auth, 'assignTasks', row.status, row.status, `Giao ${count} nhiệm vụ`),
        onWrite: (tx) =>
          writeAudit(tx, actor, {
            action: 'evaluation.assign_tasks',
            entityType: 'evaluation_record',
            entityId: id,
            changes: {
              items: input.items.map((i) => ({
                criteriaItemId: i.criteriaItemId,
                rows: i.rows.map((r) => r.label),
              })),
            },
          }),
      });
      if (!ok) throw conflict();
      return detail(auth, id);
    },

    async saveReview(
      auth: AuthContext,
      id: string,
      input: SaveEvaluationInputs,
      actor: AuditActor,
    ) {
      const row = await load(auth, id);
      await assertActor(auth, row, 'evaluation.review', 'thẩm định');
      assertTransition(row, 'saveReview');
      assertPeriodAllows(row, 'saveReview');
      const items = validateItems(row, input);
      const rule = parseRuleConfig(row.ruleSetVersion.config);
      const known = new Set(rule.rating.flags.map((f) => f.code));
      const unknown = (input.flags ?? []).filter((f) => !known.has(f));
      if (unknown.length > 0)
        throw new AppError(
          'VALIDATION_ERROR',
          `Cờ không có trong bộ quy tắc: ${unknown.join(', ')}`,
        );
      const to = nextStatus(row.status, 'saveReview')!;
      const ok = await repo.saveInputs({
        id,
        expectVersion: input.version,
        from: [row.status],
        data: { status: to, ...(input.flags ? { reviewFlags: [...new Set(input.flags)] } : {}) },
        layer: 'review',
        items,
        history: to !== row.status ? history(auth, 'saveReview', row.status, to) : null,
        onWrite: (tx) =>
          writeAudit(tx, actor, {
            action: 'evaluation.save_review',
            entityType: 'evaluation_record',
            entityId: id,
            changes: { itemCount: items.length, flags: input.flags },
          }),
      });
      if (!ok) throw conflict();
      return detail(auth, id);
    },

    async completeReview(
      auth: AuthContext,
      id: string,
      input: { comment?: string | null; version: number },
      actor: AuditActor,
    ) {
      const row = await load(auth, id);
      await assertActor(auth, row, 'evaluation.review', 'thẩm định');
      assertTransition(row, 'completeReview');
      assertPeriodAllows(row, 'completeReview');
      const snap = calculateLayer(row, 'review');
      assertComplete(snap, 'hoàn tất thẩm định');
      const ok = await repo.transition({
        id,
        expectVersion: input.version,
        from: [row.status],
        data: {
          status: 'REVIEWED',
          reviewTotal: snap.result.totalRounded,
          reviewRating: snap.result.rating.eligible,
          reviewedAt: new Date(),
          reviewedById: auth.userId,
        },
        calculation: calcData(row, 'REVIEW', snap, auth.userId),
        history: history(auth, 'completeReview', row.status, 'REVIEWED', input.comment),
        onWrite: (tx) =>
          writeAudit(tx, actor, {
            action: 'evaluation.complete_review',
            entityType: 'evaluation_record',
            entityId: id,
            changes: {
              reviewTotal: snap.result.totalRounded,
              reviewRating: snap.result.rating.eligible,
              checksum: snap.checksum,
            },
          }),
      });
      if (!ok) throw conflict();
      return detail(auth, id);
    },

    async returnToSubject(
      auth: AuthContext,
      id: string,
      input: { reason: string; version: number },
      actor: AuditActor,
    ) {
      const row = await load(auth, id);
      await assertActor(auth, row, 'evaluation.review', 'thẩm định');
      assertTransition(row, 'return');
      assertPeriodAllows(row, 'return');
      const ok = await repo.transition({
        id,
        expectVersion: input.version,
        from: [row.status],
        data: { status: 'RETURNED' },
        calculation: null,
        history: history(auth, 'return', row.status, 'RETURNED', input.reason),
        onWrite: (tx) =>
          writeAudit(tx, actor, {
            action: 'evaluation.return',
            entityType: 'evaluation_record',
            entityId: id,
            changes: { reason: input.reason },
          }),
      });
      if (!ok) throw conflict();
      return detail(auth, id);
    },

    async approve(auth: AuthContext, id: string, input: ApproveEvaluationInput, actor: AuditActor) {
      const row = await load(auth, id);
      await assertActor(auth, row, 'evaluation.approve', 'phê duyệt');
      assertTransition(row, 'approve');
      assertPeriodAllows(row, 'approve');
      const blockers = approvalBlockers(row);
      if (blockers.length > 0)
        throw new AppError('BUSINESS_RULE', 'Chưa đủ điều kiện phê duyệt', { blockers });
      // Tính lại theo dữ liệu thẩm định với bộ quy tắc ĐÃ XÁC NHẬN để chốt
      const snap = calculateLayer(row, 'review');
      assertComplete(snap, 'phê duyệt');
      const rule = parseRuleConfig(row.ruleSetVersion.config);
      if (!rule.rating.bands.some((b) => b.code === input.finalRating)) {
        throw new AppError('VALIDATION_ERROR', 'Mức xếp loại không có trong bộ quy tắc', {
          finalRating: input.finalRating,
        });
      }
      const eligible = snap.result.rating.eligible;
      const overridden = input.finalRating !== eligible;
      if (overridden && !input.overrideReason) {
        throw new AppError(
          'BUSINESS_RULE',
          eligible
            ? `Mức chọn (${input.finalRating}) khác mức đề xuất theo quy tắc (${eligible}) — phải nêu lý do`
            : 'Quy tắc không xác định được mức đề xuất — phải nêu lý do cho mức xếp loại đã chọn',
        );
      }
      const now = new Date();
      const ok = await repo.transition({
        id,
        expectVersion: input.version,
        from: ['REVIEWED'],
        data: {
          status: 'APPROVED',
          approvedTotal: snap.result.totalRounded,
          approvedRating: input.finalRating,
          ratingOverrideReason: overridden ? input.overrideReason! : null,
          approvedAt: now,
          approvedById: auth.userId,
          lockedAt: now,
        },
        calculation: calcData(row, 'APPROVAL', snap, auth.userId),
        history: history(auth, 'approve', row.status, 'APPROVED', input.comment),
        onWrite: (tx) =>
          writeAudit(tx, actor, {
            action: 'evaluation.approve',
            entityType: 'evaluation_record',
            entityId: id,
            changes: {
              approvedTotal: snap.result.totalRounded,
              eligibleRating: eligible,
              finalRating: input.finalRating,
              overrideReason: overridden ? input.overrideReason : null,
              checksum: snap.checksum,
            },
          }),
      });
      if (!ok) throw conflict();
      return detail(auth, id);
    },

    async reopen(
      auth: AuthContext,
      id: string,
      input: { reason: string; version: number },
      actor: AuditActor,
    ) {
      const row = await load(auth, id);
      await assertActor(auth, row, 'evaluation.reopen', 'mở lại');
      assertTransition(row, 'reopen');
      assertPeriodAllows(row, 'reopen');
      const ok = await repo.transition({
        id,
        expectVersion: input.version,
        from: ['APPROVED'],
        // Kết quả đã duyệt trước đó vẫn lưu nguyên trong ảnh chụp APPROVAL (bất biến)
        data: {
          status: 'REOPENED',
          revisionNo: row.revisionNo + 1,
          approvedTotal: null,
          approvedRating: null,
          ratingOverrideReason: null,
          lockedAt: null,
        },
        calculation: null,
        history: history(auth, 'reopen', row.status, 'REOPENED', input.reason),
        onWrite: (tx) =>
          writeAudit(tx, actor, {
            action: 'evaluation.reopen',
            entityType: 'evaluation_record',
            entityId: id,
            changes: {
              reason: input.reason,
              previousTotal: num(row.approvedTotal),
              previousRating: row.approvedRating,
              revisionNo: row.revisionNo + 1,
            },
          }),
      });
      if (!ok) throw conflict();
      return detail(auth, id);
    },
  };
}
