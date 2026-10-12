import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { EmployeeOption, PermissionDto, RoleDto, UserListItem, UserStatus } from '@kpi/shared';
import { api, qs } from '@/lib/api-client';

export interface UserFilters {
  q?: string;
  status?: string;
  roleCode?: string;
  sort?: string;
  page: number;
  pageSize: number;
}

export const adminKeys = {
  users: ['admin', 'users'] as const,
  userList: (f: UserFilters) => ['admin', 'users', 'list', f] as const,
  user: (id: string) => ['admin', 'users', 'detail', id] as const,
  roles: ['admin', 'roles'] as const,
  permissions: ['admin', 'permissions'] as const,
};

export const useUsers = (f: UserFilters) =>
  useQuery({
    queryKey: adminKeys.userList(f),
    queryFn: () => api.page<UserListItem>(`/users${qs({ ...f })}`),
    placeholderData: keepPreviousData,
  });

export const useUser = (id: string) =>
  useQuery({ queryKey: adminKeys.user(id), queryFn: () => api.get<UserListItem>(`/users/${id}`) });

export const useRoles = (enabled = true) =>
  useQuery({ queryKey: adminKeys.roles, queryFn: () => api.get<RoleDto[]>('/roles'), enabled });

export const usePermissions = () =>
  useQuery({
    queryKey: adminKeys.permissions,
    queryFn: () => api.get<PermissionDto[]>('/permissions'),
  });

export const useEmployeeOptions = (q: string, enabled: boolean) =>
  useQuery({
    queryKey: ['admin', 'employee-options', q],
    queryFn: () => api.get<EmployeeOption[]>(`/users/employee-options${qs({ q })}`),
    enabled,
  });

export const USER_STATUS_VARIANT: Record<UserStatus, 'success' | 'destructive' | 'secondary'> = {
  ACTIVE: 'success',
  LOCKED: 'destructive',
  DISABLED: 'secondary',
};
