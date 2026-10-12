/**
 * Trạng thái đăng nhập phía giao diện — lấy từ GET /auth/me (nguồn sự thật ở server).
 * Giao diện chỉ dùng quyền để ẩn/hiện chức năng; mọi kiểm tra thật nằm ở backend.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthMe, ChangePasswordInput, LoginInput, PermissionCode } from '@kpi/shared';
import { ApiClientError, api, setCsrfToken } from './api-client';

export const ME_KEY = ['auth', 'me'] as const;

async function fetchMe(): Promise<AuthMe | null> {
  try {
    const me = await api.get<AuthMe>('/auth/me');
    setCsrfToken(me.csrfToken);
    return me;
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 401) {
      setCsrfToken(null);
      return null;
    }
    throw err;
  }
}

export function useMe() {
  return useQuery({ queryKey: ME_KEY, queryFn: fetchMe, staleTime: 60_000, retry: false });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => api.post<AuthMe>('/auth/login', input),
    onSuccess: (me) => {
      setCsrfToken(me.csrfToken);
      qc.clear();
      qc.setQueryData(ME_KEY, me);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSettled: () => {
      setCsrfToken(null);
      qc.clear();
      qc.setQueryData(ME_KEY, null);
    },
  });
}

export function useChangePassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ChangePasswordInput) => api.post('/auth/change-password', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ME_KEY }),
  });
}

export function hasPermission(me: AuthMe | null | undefined, ...perms: PermissionCode[]): boolean {
  if (!me) return false;
  return perms.every((p) => me.permissions.includes(p));
}

/** Hook tiện dụng: trả về hàm kiểm tra quyền của người dùng hiện tại. */
export function useCan() {
  const { data } = useMe();
  return (...perms: PermissionCode[]) => hasPermission(data, ...perms);
}
