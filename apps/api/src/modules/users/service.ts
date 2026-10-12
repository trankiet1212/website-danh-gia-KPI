/**
 * Quản lý tài khoản: tạo, cập nhật, khóa/mở khóa, đặt lại mật khẩu, cấp/thu hồi vai trò kèm phạm vi.
 * Bảo vệ: không tự khóa mình, luôn giữ ít nhất 1 Quản trị hệ thống đang hoạt động.
 */
import type {
  CreateUserInput,
  CreatedUserResult,
  EmployeeOption,
  GrantRoleInput,
  PageMeta,
  RoleGrantDto,
  ScopeType,
  UpdateUserInput,
  UserListItem,
  UserListQuery,
  UserStatus,
} from '@kpi/shared';
import { revokeUserSessions } from '../../auth/session-store.js';
import type { AuthContext } from '../../auth/types.js';
import { diff, writeAudit, type AuditActor } from '../../lib/audit.js';
import { AppError } from '../../lib/errors.js';
import { generateTemporaryPassword, hashPassword } from '../../lib/password.js';
import type { Db } from '../../lib/prisma.js';
import { withDbErrors } from '../../lib/db-errors.js';
import { createUsersRepository, type UserRecord } from './repository.js';

export function toUserDto(u: UserRecord): UserListItem {
  return {
    id: u.id,
    username: u.username,
    displayName: u.employee?.fullName ?? u.displayName ?? u.username,
    status: u.status,
    lockedUntil: u.lockedUntil && u.lockedUntil > new Date() ? u.lockedUntil.toISOString() : null,
    mustChangePassword: u.mustChangePassword,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
    employee: u.employee,
    roles: u.roles.map((r): RoleGrantDto => ({
      id: r.id,
      roleId: r.role.id,
      roleCode: r.role.code,
      roleName: r.role.name,
      scopeType: r.scopeType as ScopeType,
      units: r.units.map((x) => x.unit),
    })),
    version: u.version,
  };
}

const SCOPES_NEEDING_EMPLOYEE: ScopeType[] = ['OWN_UNIT', 'MANAGED', 'SELF'];

export function createUsersService(db: Db) {
  const repo = createUsersRepository(db);

  async function getOrThrow(id: string) {
    const user = await repo.findById(id);
    if (!user) throw new AppError('NOT_FOUND', 'Không tìm thấy tài khoản');
    return user;
  }

  async function assertEmployeeLinkable(employeeId: string | null | undefined) {
    if (!employeeId) return;
    if (!(await repo.employeeExists(employeeId))) {
      throw new AppError('BUSINESS_RULE', 'Cán bộ không tồn tại hoặc không còn công tác');
    }
  }

  /** Không để hệ thống mất toàn bộ Quản trị hệ thống đang hoạt động. */
  async function assertNotLastSuperAdmin(user: UserRecord) {
    const isSuperAdmin = user.roles.some((r) => r.role.code === 'SUPER_ADMIN');
    if (isSuperAdmin && (await repo.countActiveSuperAdmins(user.id)) === 0) {
      throw new AppError(
        'BUSINESS_RULE',
        'Không thể thực hiện: đây là Quản trị hệ thống cuối cùng đang hoạt động',
      );
    }
  }

  return {
    async list(query: UserListQuery): Promise<{ items: UserListItem[]; meta: PageMeta }> {
      const { items, total } = await repo.list(query);
      return {
        items: items.map(toUserDto),
        meta: { page: query.page, pageSize: query.pageSize, total },
      };
    },

    async get(id: string) {
      return toUserDto(await getOrThrow(id));
    },

    async create(input: CreateUserInput, actor: AuditActor): Promise<CreatedUserResult> {
      await assertEmployeeLinkable(input.employeeId);
      const temporaryPassword = input.initialPassword ? null : generateTemporaryPassword();
      const user = await withDbErrors(async () =>
        repo.create({
          username: input.username,
          displayName: input.displayName ?? null,
          employeeId: input.employeeId ?? null,
          passwordHash: await hashPassword(input.initialPassword ?? temporaryPassword!),
        }),
      );
      await writeAudit(db, actor, {
        action: 'user.create',
        entityType: 'user',
        entityId: user.id,
        changes: { username: user.username, employeeId: user.employeeId },
      });
      return { user: toUserDto(user), temporaryPassword };
    },

    async update(id: string, input: UpdateUserInput, actor: AuditActor) {
      const before = await getOrThrow(id);
      if (input.employeeId !== undefined && input.employeeId !== before.employeeId) {
        await assertEmployeeLinkable(input.employeeId);
        if (
          !input.employeeId &&
          before.roles.some((r) => SCOPES_NEEDING_EMPLOYEE.includes(r.scopeType as ScopeType))
        ) {
          throw new AppError(
            'BUSINESS_RULE',
            'Tài khoản đang có vai trò phạm vi theo cán bộ — thu hồi vai trò trước khi bỏ liên kết',
          );
        }
      }
      const data = {
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
        ...(input.employeeId !== undefined ? { employeeId: input.employeeId } : {}),
      };
      const count = await withDbErrors(() => repo.updateVersioned(id, input.version, data));
      if (count === 0) {
        throw new AppError(
          'CONFLICT_VERSION',
          'Tài khoản đã được người khác cập nhật. Vui lòng tải lại.',
        );
      }
      const after = await getOrThrow(id);
      await writeAudit(db, actor, {
        action: 'user.update',
        entityType: 'user',
        entityId: id,
        changes: diff(
          { displayName: before.displayName, employeeId: before.employeeId },
          { displayName: after.displayName, employeeId: after.employeeId },
        ),
      });
      return toUserDto(after);
    },

    async setStatus(
      auth: AuthContext,
      id: string,
      status: UserStatus,
      reason: string | null,
      actor: AuditActor,
    ) {
      const user = await getOrThrow(id);
      if (status !== 'ACTIVE') {
        if (id === auth.userId)
          throw new AppError('BUSINESS_RULE', 'Không thể tự khóa tài khoản của chính mình');
        await assertNotLastSuperAdmin(user);
      } else if (user.employeeId && !(await repo.employeeExists(user.employeeId))) {
        // Hồ sơ đã kết thúc công tác → tài khoản bị vô hiệu hóa theo quy trình, không mở lại (docs/05).
        throw new AppError(
          'BUSINESS_RULE',
          'Cán bộ gắn với tài khoản không còn công tác — không thể kích hoạt lại tài khoản',
        );
      }
      const updated = await repo.setStatus(id, status);
      const revoked = status === 'ACTIVE' ? 0 : await revokeUserSessions(db, id);
      await writeAudit(db, actor, {
        action: `user.status.${status.toLowerCase()}`,
        entityType: 'user',
        entityId: id,
        changes: { from: user.status, to: status, reason, revokedSessions: revoked },
      });
      return toUserDto(updated);
    },

    async resetPassword(id: string, actor: AuditActor): Promise<CreatedUserResult> {
      await getOrThrow(id);
      const temporaryPassword = generateTemporaryPassword();
      const updated = await repo.resetPassword(id, await hashPassword(temporaryPassword));
      const revoked = await revokeUserSessions(db, id);
      await writeAudit(db, actor, {
        action: 'user.password.reset',
        entityType: 'user',
        entityId: id,
        changes: { revokedSessions: revoked },
      });
      return { user: toUserDto(updated), temporaryPassword };
    },

    async revokeSessions(id: string, actor: AuditActor) {
      await getOrThrow(id);
      const revoked = await revokeUserSessions(db, id);
      await writeAudit(db, actor, {
        action: 'user.sessions.revoke',
        entityType: 'user',
        entityId: id,
        changes: { revoked },
      });
      return { revoked };
    },

    async grantRole(auth: AuthContext, userId: string, input: GrantRoleInput, actor: AuditActor) {
      const user = await getOrThrow(userId);
      const role = await repo.findRole(input.roleId);
      if (!role) throw new AppError('NOT_FOUND', 'Không tìm thấy vai trò');
      if (SCOPES_NEEDING_EMPLOYEE.includes(input.scopeType) && !user.employeeId) {
        throw new AppError(
          'BUSINESS_RULE',
          'Phạm vi theo đơn vị/cán bộ yêu cầu tài khoản gắn với hồ sơ cán bộ',
        );
      }
      const unitIds = [...new Set(input.unitIds)];
      if (unitIds.length > 0 && (await repo.activeUnits(unitIds)).length !== unitIds.length) {
        throw new AppError('BUSINESS_RULE', 'Có đơn vị không tồn tại hoặc đã lưu trữ');
      }
      const grant = await withDbErrors(() =>
        repo.grantRole({
          userId,
          roleId: role.id,
          scopeType: input.scopeType,
          unitIds,
          grantedById: auth.userId,
        }),
      );
      await writeAudit(db, actor, {
        action: 'user.role.grant',
        entityType: 'user',
        entityId: userId,
        changes: { grantId: grant.id, role: role.code, scopeType: input.scopeType, unitIds },
      });
      return toUserDto(await getOrThrow(userId));
    },

    async revokeRole(auth: AuthContext, userId: string, grantId: string, actor: AuditActor) {
      const grant = await repo.findGrant(grantId);
      if (!grant || grant.userId !== userId)
        throw new AppError('NOT_FOUND', 'Không tìm thấy vai trò đã cấp');
      if (grant.role.code === 'SUPER_ADMIN') {
        if (userId === auth.userId) {
          throw new AppError(
            'BUSINESS_RULE',
            'Không thể tự thu hồi quyền Quản trị hệ thống của chính mình',
          );
        }
        if ((await repo.countActiveSuperAdmins(userId)) === 0) {
          throw new AppError(
            'BUSINESS_RULE',
            'Không thể thu hồi: đây là Quản trị hệ thống cuối cùng',
          );
        }
      }
      await repo.deleteGrant(grantId);
      await writeAudit(db, actor, {
        action: 'user.role.revoke',
        entityType: 'user',
        entityId: userId,
        changes: {
          grantId,
          role: grant.role.code,
          scopeType: grant.scopeType,
          unitIds: grant.units.map((u) => u.unitId),
        },
      });
      return toUserDto(await getOrThrow(userId));
    },

    async employeeOptions(q: string | undefined): Promise<EmployeeOption[]> {
      const rows = await repo.employeeOptions(q);
      return rows.map((e) => ({
        id: e.id,
        employeeCode: e.employeeCode,
        fullName: e.fullName,
        unitName: e.assignments[0]?.unit.name ?? null,
      }));
    },
  };
}
