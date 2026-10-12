/**
 * Hồ sơ cán bộ, phân công và lịch sử điều chuyển.
 *  - Đọc: quyền employee.read, lọc theo phạm vi (ngoài phạm vi → 404).
 *  - Ghi: quyền employee.write, đơn vị đích phải thuộc phạm vi ghi.
 */
import type {
  ArchiveEmployeeInput,
  AssignmentDto,
  CreateEmployeeInput,
  EmployeeDetail,
  EmployeeListItem,
  EmployeeListQuery,
  PageMeta,
  TransferEmployeeInput,
  UpdateEmployeeInput,
} from '@kpi/shared';
import { employeeScopeWhere, resolveScope, scopeCoversUnit } from '../../auth/scope.js';
import type { AuthContext, DataScope } from '../../auth/types.js';
import { diff, writeAudit, type AuditActor } from '../../lib/audit.js';
import { addDays, parseDateOnly, toDateOnly } from '../../lib/dates.js';
import { AppError } from '../../lib/errors.js';
import type { Db } from '../../lib/prisma.js';
import { withDbErrors } from '../../lib/db-errors.js';
import {
  createEmployeesRepository,
  type EmployeeDetailRow,
  type EmployeeListRow,
} from './repository.js';

type AssignmentRow = EmployeeDetailRow['assignments'][number];

function assignmentDto(a: AssignmentRow): AssignmentDto {
  return {
    id: a.id,
    unit: a.unit,
    position: a.position,
    jobPosition: a.jobPosition,
    manager: a.manager,
    isPrimary: a.isPrimary,
    startDate: toDateOnly(a.startDate),
    endDate: toDateOnly(a.endDate),
    duties: a.duties,
    decisionRef: a.decisionRef,
    note: a.note,
  };
}

function listItemDto(e: EmployeeListRow): EmployeeListItem {
  const current = e.assignments[0];
  return {
    id: e.id,
    employeeCode: e.employeeCode,
    fullName: e.fullName,
    status: e.status,
    isDemo: e.isDemo,
    email: e.email,
    current: current ? assignmentDto(current) : null,
    hasAccount: e.user !== null,
    version: e.version,
  };
}

const NOT_FOUND = () => new AppError('NOT_FOUND', 'Không tìm thấy hồ sơ cán bộ');

export function createEmployeesService(db: Db) {
  const repo = createEmployeesRepository(db);

  function readScope(auth: AuthContext): DataScope {
    const scope = resolveScope(auth, 'employee.read');
    if (!scope) throw new AppError('FORBIDDEN', 'Bạn không có quyền xem hồ sơ cán bộ');
    return scope;
  }

  /** Hồ sơ phải nằm trong phạm vi ĐỌC (không → 404) và phạm vi GHI (không → 403). */
  async function loadForWrite(auth: AuthContext, id: string) {
    const employee = await repo.findInScope(id, employeeScopeWhere(readScope(auth)));
    if (!employee) throw NOT_FOUND();
    const writeScope = resolveScope(auth, 'employee.write');
    if (!writeScope || !(await repo.existsInScope(id, employeeScopeWhere(writeScope)))) {
      throw new AppError('FORBIDDEN', 'Bạn không có quyền cập nhật hồ sơ cán bộ này');
    }
    return { employee, writeScope };
  }

  /** Kiểm tra các tham chiếu của một phân công (đơn vị, chức vụ, VTVL, cấp quản lý). */
  async function validateAssignmentRefs(
    a: {
      unitId: string;
      positionId: string;
      jobPositionId?: string | null;
      managerEmployeeId?: string | null;
    },
    writeScope: DataScope,
    employeeId: string | null,
  ) {
    if (!scopeCoversUnit(writeScope, a.unitId)) {
      throw new AppError('FORBIDDEN', 'Đơn vị được chọn nằm ngoài phạm vi bạn được quản lý');
    }
    if (!(await repo.activeUnit(a.unitId)))
      throw new AppError('BUSINESS_RULE', 'Đơn vị không tồn tại hoặc đã lưu trữ');
    if (!(await repo.activePosition(a.positionId))) {
      throw new AppError('BUSINESS_RULE', 'Chức vụ không tồn tại hoặc đã lưu trữ');
    }
    if (a.jobPositionId && !(await repo.activeJobPosition(a.jobPositionId))) {
      throw new AppError('BUSINESS_RULE', 'Vị trí việc làm không tồn tại hoặc đã lưu trữ');
    }
    if (a.managerEmployeeId) {
      if (a.managerEmployeeId === employeeId) {
        throw new AppError(
          'BUSINESS_RULE',
          'Cán bộ không thể là cấp quản lý trực tiếp của chính mình',
        );
      }
      if (!(await repo.workingEmployee(a.managerEmployeeId))) {
        throw new AppError(
          'BUSINESS_RULE',
          'Cấp quản lý trực tiếp không tồn tại hoặc không còn công tác',
        );
      }
    }
  }

  async function assertEmailFree(email: string | null | undefined, excludeId?: string) {
    if (!email) return;
    const other = await repo.findByEmail(email, excludeId);
    if (other) {
      throw new AppError('DUPLICATE', `Email đã được dùng cho cán bộ ${other.employeeCode}`, {
        fields: ['email'],
      });
    }
  }

  async function detail(auth: AuthContext, id: string): Promise<EmployeeDetail> {
    const e = await repo.findInScope(id, employeeScopeWhere(readScope(auth)));
    if (!e) throw NOT_FOUND();
    const writeScope = resolveScope(auth, 'employee.write');
    const canWrite =
      writeScope !== null && (await repo.existsInScope(id, employeeScopeWhere(writeScope)));
    const working = e.status === 'WORKING';
    const current = e.assignments.find((a) => a.isPrimary && a.endDate === null);
    return {
      ...listItemDto({ ...e, assignments: current ? [current] : [] }),
      gender: e.gender,
      dateOfBirth: toDateOnly(e.dateOfBirth),
      phone: e.phone,
      partyPosition: e.partyPosition,
      govPosition: e.govPosition,
      unionPosition: e.unionPosition,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
      assignments: e.assignments.map(assignmentDto),
      can: { edit: canWrite, transfer: canWrite && working, archive: canWrite && working },
    };
  }

  return {
    detail,

    async list(
      auth: AuthContext,
      query: EmployeeListQuery,
    ): Promise<{ items: EmployeeListItem[]; meta: PageMeta }> {
      const { items, total } = await repo.list(employeeScopeWhere(readScope(auth)), query);
      return {
        items: items.map(listItemDto),
        meta: { page: query.page, pageSize: query.pageSize, total },
      };
    },

    async create(auth: AuthContext, input: CreateEmployeeInput, actor: AuditActor) {
      const writeScope = resolveScope(auth, 'employee.write');
      if (!writeScope) throw new AppError('FORBIDDEN', 'Bạn không có quyền thêm hồ sơ cán bộ');
      if (await repo.findByCode(input.employeeCode)) {
        throw new AppError('DUPLICATE', `Mã cán bộ ${input.employeeCode} đã tồn tại`, {
          fields: ['employeeCode'],
        });
      }
      await assertEmailFree(input.email);
      await validateAssignmentRefs(input.assignment, writeScope, null);

      const { assignment, dateOfBirth, ...profile } = input;
      const id = await withDbErrors(() =>
        repo.createWithAssignment(
          { ...profile, dateOfBirth: dateOfBirth ? parseDateOnly(dateOfBirth) : null },
          {
            unitId: assignment.unitId,
            positionId: assignment.positionId,
            jobPositionId: assignment.jobPositionId ?? null,
            managerEmployeeId: assignment.managerEmployeeId ?? null,
            startDate: parseDateOnly(assignment.startDate),
            duties: assignment.duties ?? null,
            decisionRef: assignment.decisionRef ?? null,
          },
          (tx, employeeId) =>
            writeAudit(tx, actor, {
              action: 'employee.create',
              entityType: 'employee',
              entityId: employeeId,
              changes: { employeeCode: input.employeeCode, fullName: input.fullName, assignment },
            }),
        ),
      );
      return detail(auth, id);
    },

    async update(auth: AuthContext, id: string, input: UpdateEmployeeInput, actor: AuditActor) {
      const { employee } = await loadForWrite(auth, id);
      await assertEmailFree(input.email, id);
      const { version, dateOfBirth, ...profile } = input;
      const data = { ...profile, dateOfBirth: dateOfBirth ? parseDateOnly(dateOfBirth) : null };
      const ok = await withDbErrors(() =>
        repo.updateProfile(id, version, data, (tx) =>
          writeAudit(tx, actor, {
            action: 'employee.update',
            entityType: 'employee',
            entityId: id,
            changes: diff(
              {
                fullName: employee.fullName,
                gender: employee.gender,
                dateOfBirth: toDateOnly(employee.dateOfBirth),
                email: employee.email,
                phone: employee.phone,
                partyPosition: employee.partyPosition,
                govPosition: employee.govPosition,
                unionPosition: employee.unionPosition,
              },
              { ...profile, dateOfBirth: dateOfBirth ?? null },
            ),
          }),
        ),
      );
      if (!ok)
        throw new AppError(
          'CONFLICT_VERSION',
          'Hồ sơ đã được người khác cập nhật. Vui lòng tải lại.',
        );
      return detail(auth, id);
    },

    async transfer(auth: AuthContext, id: string, input: TransferEmployeeInput, actor: AuditActor) {
      const { employee, writeScope } = await loadForWrite(auth, id);
      if (employee.status !== 'WORKING') {
        throw new AppError('BUSINESS_RULE', 'Chỉ điều chuyển được cán bộ đang công tác');
      }
      const current = employee.assignments.find((a) => a.isPrimary && a.endDate === null);
      if (!current)
        throw new AppError('BUSINESS_RULE', 'Cán bộ chưa có phân công hiện hành để điều chuyển');
      const start = parseDateOnly(input.startDate);
      if (start.getTime() <= current.startDate.getTime()) {
        throw new AppError(
          'BUSINESS_RULE',
          `Ngày bắt đầu mới phải sau ngày bắt đầu phân công hiện tại (${toDateOnly(current.startDate)})`,
        );
      }
      if (
        current.unitId === input.unitId &&
        current.positionId === input.positionId &&
        (current.jobPositionId ?? null) === (input.jobPositionId ?? null) &&
        (current.managerEmployeeId ?? null) === (input.managerEmployeeId ?? null)
      ) {
        throw new AppError('BUSINESS_RULE', 'Phân công mới không khác phân công hiện tại');
      }
      await validateAssignmentRefs(input, writeScope, id);

      const ok = await withDbErrors(() =>
        repo.transfer({
          employeeId: id,
          version: input.version,
          currentAssignmentId: current.id,
          closeOn: addDays(start, -1),
          next: {
            unitId: input.unitId,
            positionId: input.positionId,
            jobPositionId: input.jobPositionId ?? null,
            managerEmployeeId: input.managerEmployeeId ?? null,
            startDate: start,
            duties: input.duties ?? null,
            decisionRef: input.decisionRef ?? null,
            note: input.note ?? null,
          },
          onWrite: (tx) =>
            writeAudit(tx, actor, {
              action: 'employee.transfer',
              entityType: 'employee',
              entityId: id,
              changes: {
                from: {
                  unit: current.unit.code,
                  position: current.position.code,
                  jobPosition: current.jobPosition?.code ?? null,
                  managerEmployeeId: current.managerEmployeeId,
                },
                to: {
                  unitId: input.unitId,
                  positionId: input.positionId,
                  jobPositionId: input.jobPositionId ?? null,
                  managerEmployeeId: input.managerEmployeeId ?? null,
                },
                startDate: input.startDate,
                decisionRef: input.decisionRef ?? null,
              },
            }),
        }),
      );
      if (!ok)
        throw new AppError(
          'CONFLICT_VERSION',
          'Hồ sơ đã được người khác cập nhật. Vui lòng tải lại.',
        );
      return detail(auth, id);
    },

    async endEmployment(
      auth: AuthContext,
      id: string,
      input: ArchiveEmployeeInput,
      actor: AuditActor,
    ) {
      const { employee } = await loadForWrite(auth, id);
      if (employee.status !== 'WORKING')
        throw new AppError('BUSINESS_RULE', 'Cán bộ không còn ở trạng thái đang công tác');
      const endDate = parseDateOnly(input.endDate);
      const current = employee.assignments.find((a) => a.isPrimary && a.endDate === null);
      if (current && endDate.getTime() < current.startDate.getTime()) {
        throw new AppError(
          'BUSINESS_RULE',
          `Ngày kết thúc phải từ ngày bắt đầu phân công hiện tại (${toDateOnly(current.startDate)}) trở đi`,
        );
      }
      const ok = await repo.endEmployment({
        employeeId: id,
        version: input.version,
        status: input.status,
        endDate,
        onWrite: (tx, revokedSessions) =>
          writeAudit(tx, actor, {
            action: 'employee.end_employment',
            entityType: 'employee',
            entityId: id,
            changes: {
              status: input.status,
              endDate: input.endDate,
              reason: input.reason,
              revokedSessions,
            },
          }),
      });
      if (!ok)
        throw new AppError(
          'CONFLICT_VERSION',
          'Hồ sơ đã được người khác cập nhật. Vui lòng tải lại.',
        );
      return detail(auth, id);
    },
  };
}
