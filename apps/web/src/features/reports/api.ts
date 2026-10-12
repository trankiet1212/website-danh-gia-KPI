/** Gọi API dashboard, báo cáo, dự thảo (GĐ6). */
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import type {
  DashboardSummary,
  DraftDocument,
  DraftTemplateDto,
  ReportDocument,
  ReportKind,
} from '@kpi/shared';
import { api, qs } from '@/lib/api-client';

export interface DashboardFilters {
  periodId?: string;
  unitId?: string;
  employeeId?: string;
  status?: string;
}

export function useDashboard(f: DashboardFilters, enabled = true) {
  return useQuery({
    queryKey: ['dashboard', f],
    queryFn: () => api.get<DashboardSummary>(`/dashboard/summary${qs({ ...f })}`),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export type ReportParams = Record<string, string | number | undefined>;

export function useReport(kind: ReportKind, params: ReportParams, enabled: boolean) {
  return useQuery({
    queryKey: ['report', kind, params],
    queryFn: () => api.get<ReportDocument>(`/reports/${kind}${qs(params)}`),
    enabled,
    retry: false,
  });
}

export function useDraftTemplates() {
  return useQuery({
    queryKey: ['draft-templates'],
    queryFn: () => api.get<DraftTemplateDto[]>('/drafts/templates'),
  });
}

export function useDraftPreview() {
  return useMutation({
    mutationFn: (body: object) => api.post<DraftDocument>('/drafts/preview', body),
  });
}
