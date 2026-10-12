/**
 * Thông tin cá nhân của chính mình (docs/05 — "Thông tin cá nhân và vòng đời tài khoản").
 *  - Xem: mọi tài khoản đã đăng nhập.
 *  - Tự sửa: chỉ số điện thoại, email; hồ sơ phải đang công tác.
 *    Họ tên, giới tính, ngày sinh, chức vụ, đơn vị do cán bộ tổng hợp cập nhật (employee.write).
 */
import type { OwnProfileDto, UpdateOwnProfileInput } from '@kpi/shared';
import type { AuthContext } from '../../auth/types.js';
import { diff, writeAudit, type AuditActor } from '../../lib/audit.js';
import { toDateOnly } from '../../lib/dates.js';
import { withDbErrors } from '../../lib/db-errors.js';
import { AppError } from '../../lib/errors.js';
import type { Db } from '../../lib/prisma.js';
import { createProfileRepository, type OwnProfileRow } from './repository.js';

const SELF_EDITABLE = ['phone', 'email'] as const;

function toDto(row: OwnProfileRow): OwnProfileDto {
  const e = row.employee;
  const current = e?.assignments[0];
  return {
    account: {
      username: row.username,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
      passwordChangedAt: row.passwordChangedAt?.toISOString() ?? null,
    },
    employee: e
      ? {
          id: e.id,
          employeeCode: e.employeeCode,
          fullName: e.fullName,
          gender: e.gender,
          dateOfBirth: toDateOnly(e.dateOfBirth),
          email: e.email,
          phone: e.phone,
          partyPosition: e.partyPosition,
          govPosition: e.govPosition,
          unionPosition: e.unionPosition,
          status: e.status,
          isDemo: e.isDemo,
          current: current
            ? {
                id: current.id,
                unit: current.unit,
                position: current.position,
                jobPosition: current.jobPosition,
                manager: current.manager,
                isPrimary: current.isPrimary,
                startDate: toDateOnly(current.startDate),
                endDate: toDateOnly(current.endDate),
                duties: current.duties,
                decisionRef: current.decisionRef,
                note: current.note,
              }
            : null,
          updatedAt: e.updatedAt.toISOString(),
          version: e.version,
        }
      : null,
    editableFields: e?.status === 'WORKING' ? [...SELF_EDITABLE] : [],
  };
}

export function createProfileService(db: Db) {
  const repo = createProfileRepository(db);

  async function load(auth: AuthContext) {
    const row = await repo.findOwn(auth.userId);
    if (!row) throw new AppError('UNAUTHENTICATED', 'Phiên đăng nhập không còn hợp lệ');
    return row;
  }

  return {
    async get(auth: AuthContext): Promise<OwnProfileDto> {
      return toDto(await load(auth));
    },

    async updateOwn(
      auth: AuthContext,
      input: UpdateOwnProfileInput,
      actor: AuditActor,
    ): Promise<OwnProfileDto> {
      const row = await load(auth);
      const employee = row.employee;
      if (!employee) {
        throw new AppError('BUSINESS_RULE', 'Tài khoản không gắn với hồ sơ cán bộ nào');
      }
      if (employee.status !== 'WORKING') {
        throw new AppError('BUSINESS_RULE', 'Hồ sơ không còn ở trạng thái đang công tác');
      }
      const data = {
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
      };
      if (data.email) {
        if (await repo.findEmailOwner(data.email, employee.id)) {
          throw new AppError('DUPLICATE', 'Email đã được dùng cho hồ sơ cán bộ khác', {
            fields: ['email'],
          });
        }
      }
      const ok = await withDbErrors(() =>
        repo.updateContact(employee.id, input.version, data, (tx) =>
          writeAudit(tx, actor, {
            action: 'employee.self_update',
            entityType: 'employee',
            entityId: employee.id,
            changes: diff({ phone: employee.phone, email: employee.email }, data),
          }),
        ),
      );
      if (!ok) {
        throw new AppError(
          'CONFLICT_VERSION',
          'Hồ sơ đã được cập nhật ở nơi khác. Vui lòng tải lại trang.',
        );
      }
      return toDto(await load(auth));
    },
  };
}
