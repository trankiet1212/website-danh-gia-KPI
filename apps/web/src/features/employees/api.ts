import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { EmployeeDetail, EmployeeListItem } from '@kpi/shared';
import { api, qs } from '@/lib/api-client';

export interface EmployeeFilters {
  q?: string;
  unitId?: string;
  positionId?: string;
  status?: string;
  includeInactive?: boolean;
  sort?: string;
  page: number;
  pageSize: number;
}

export const employeeKeys = {
  all: ['employees'] as const,
  list: (f: EmployeeFilters) => ['employees', 'list', f] as const,
  detail: (id: string) => ['employees', 'detail', id] as const,
};

export function useEmployees(filters: EmployeeFilters) {
  return useQuery({
    queryKey: employeeKeys.list(filters),
    queryFn: () => api.page<EmployeeListItem>(`/employees${qs({ ...filters })}`),
    placeholderData: keepPreviousData,
  });
}

export function useEmployee(id: string) {
  return useQuery({
    queryKey: employeeKeys.detail(id),
    queryFn: () => api.get<EmployeeDetail>(`/employees/${id}`),
  });
}
