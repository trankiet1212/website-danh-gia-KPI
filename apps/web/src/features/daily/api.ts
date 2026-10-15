/** Gọi API sổ giao việc hằng ngày (/daily-tasks). */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DailyAssigneeDto, DailyTaskDto } from '@kpi/shared';
import { api, apiFetch, qs } from '@/lib/api-client';

export const dailyKeys = {
  all: ['daily-tasks'] as const,
  list: (from: string, to: string, employeeId?: string) =>
    ['daily-tasks', from, to, employeeId ?? null] as const,
  assignees: ['daily-task-assignees'] as const,
};

export function useDailyTasks(from: string, to: string, employeeId?: string) {
  return useQuery({
    queryKey: dailyKeys.list(from, to, employeeId),
    queryFn: () => api.get<DailyTaskDto[]>(`/daily-tasks${qs({ from, to, employeeId })}`),
    placeholderData: keepPreviousData,
  });
}

export function useAssignees(enabled: boolean) {
  return useQuery({
    queryKey: dailyKeys.assignees,
    queryFn: () => api.get<DailyAssigneeDto[]>('/daily-tasks/assignees'),
    enabled,
  });
}

/** Thao tác ghi; thành công → tải lại danh sách công việc. */
export function useDailyAction<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => void qc.invalidateQueries({ queryKey: dailyKeys.all }),
  });
}

export const deleteDailyTask = (t: DailyTaskDto) =>
  apiFetch<void>(`/daily-tasks/${t.id}${qs({ version: t.version })}`, { method: 'DELETE' });
