/**
 * Vai trò và quyền. Vai trò hệ thống không xóa được; Quản trị hệ thống luôn giữ quyền quản trị tài khoản/vai trò
 * (tránh tự khóa ngoài hệ thống).
 */
import type {
  CreateRoleInput,
  PermissionCode,
  PermissionDto,
  RoleDto,
  UpdateRoleInput,
} from '@kpi/shared';
import { diff, writeAudit, type AuditActor } from '../../lib/audit.js';
import { AppError } from '../../lib/errors.js';
import type { Db } from '../../lib/prisma.js';
import { withDbErrors } from '../../lib/db-errors.js';
import { createRolesRepository } from './repository.js';

const SUPER_ADMIN_REQUIRED: PermissionCode[] = ['user.manage', 'role.manage'];

type RoleRow = NonNullable<
  Awaited<ReturnType<ReturnType<typeof createRolesRepository>['findById']>>
>;

function toDto(r: RoleRow): RoleDto {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    description: r.description,
    isSystem: r.isSystem,
    permissions: r.permissions.map((p) => p.permission.code as PermissionCode).sort(),
    userCount: r._count.userRoles,
  };
}

export function createRolesService(db: Db) {
  const repo = createRolesRepository(db);

  async function resolvePermissionIds(codes: string[]) {
    const unique = [...new Set(codes)];
    const rows = await repo.permissionIds(unique);
    if (rows.length !== unique.length)
      throw new AppError('BUSINESS_RULE', 'Có mã quyền không tồn tại');
    return rows.map((r) => r.id);
  }

  return {
    async list(): Promise<RoleDto[]> {
      return (await repo.list()).map(toDto);
    },

    async listPermissions(): Promise<PermissionDto[]> {
      return (await repo.listPermissions()).map((p) => ({
        code: p.code as PermissionCode,
        module: p.module,
        description: p.description,
      }));
    },

    async create(input: CreateRoleInput, actor: AuditActor) {
      const permissionIds = await resolvePermissionIds(input.permissions);
      const role = await withDbErrors(() =>
        repo.create({
          code: input.code,
          name: input.name,
          description: input.description ?? null,
          permissionIds,
        }),
      );
      await writeAudit(db, actor, {
        action: 'role.create',
        entityType: 'role',
        entityId: role.id,
        changes: { code: role.code, permissions: input.permissions },
      });
      return toDto(role);
    },

    async update(id: string, input: UpdateRoleInput, actor: AuditActor) {
      const before = await repo.findById(id);
      if (!before) throw new AppError('NOT_FOUND', 'Không tìm thấy vai trò');
      if (before.code === 'SUPER_ADMIN') {
        const missing = SUPER_ADMIN_REQUIRED.filter((p) => !input.permissions.includes(p));
        if (missing.length > 0) {
          throw new AppError(
            'BUSINESS_RULE',
            `Quản trị hệ thống phải giữ quyền: ${missing.join(', ')}`,
          );
        }
      }
      const permissionIds = await resolvePermissionIds(input.permissions);
      const after = await repo.update(id, {
        name: input.name,
        description: input.description ?? null,
        permissionIds,
      });
      const beforeDto = toDto(before);
      const afterDto = toDto(after);
      await writeAudit(db, actor, {
        action: 'role.update',
        entityType: 'role',
        entityId: id,
        changes: {
          ...diff(
            { name: beforeDto.name, description: beforeDto.description },
            { name: afterDto.name, description: afterDto.description },
          ),
          permissionsAdded: afterDto.permissions.filter((p) => !beforeDto.permissions.includes(p)),
          permissionsRemoved: beforeDto.permissions.filter(
            (p) => !afterDto.permissions.includes(p),
          ),
        },
      });
      return afterDto;
    },

    async remove(id: string, actor: AuditActor) {
      const role = await repo.findById(id);
      if (!role) throw new AppError('NOT_FOUND', 'Không tìm thấy vai trò');
      if (role.isSystem) throw new AppError('BUSINESS_RULE', 'Không thể xóa vai trò hệ thống');
      if (role._count.userRoles > 0) {
        throw new AppError(
          'BUSINESS_RULE',
          'Vai trò đang được cấp cho người dùng — thu hồi trước khi xóa',
        );
      }
      await repo.delete(id);
      await writeAudit(db, actor, {
        action: 'role.delete',
        entityType: 'role',
        entityId: id,
        changes: { code: role.code },
      });
    },
  };
}
