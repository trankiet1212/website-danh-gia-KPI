/** Gọi API GĐ5: kỳ đánh giá, bộ quy tắc, danh mục SP/CV, bộ tiêu chí, OKR, hồ sơ đánh giá. */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CatalogItemDto,
  JobPositionWorkItemsDto,
  MyJobPositionDto,
  CatalogVersionDto,
  CriteriaSetDto,
  CriteriaVersionDto,
  EvaluationDetail,
  EvaluationListItem,
  ObjectiveDto,
  PeriodDto,
  PeriodType,
  RuleSetDto,
  RuleSetVersionDto,
  ScoreResult,
} from '@kpi/shared';
import { api, qs } from '@/lib/api-client';

export const kpiKeys = {
  periods: (year?: number, type?: PeriodType) => ['periods', year ?? null, type ?? null] as const,
  ruleSets: ['rule-sets'] as const,
  ruleSetVersion: (id: string) => ['rule-set-version', id] as const,
  catalogs: ['work-catalogs'] as const,
  catalogItems: (id: string, q: string, opts: CatalogItemsOptions = {}) =>
    ['work-catalog-items', id, q, opts.employeeId ?? null, opts.scope ?? 'mine'] as const,
  myJobPosition: ['my-job-position'] as const,
  jobPositionItems: ['job-position-work-items'] as const,
  criteriaSets: ['criteria-sets'] as const,
  criteriaVersion: (id: string) => ['criteria-version', id] as const,
  objectives: (periodId: string) => ['objectives', periodId] as const,
  evaluations: (f: EvaluationFilters) => ['evaluations', f] as const,
  evaluation: (id: string) => ['evaluation', id] as const,
};

export function usePeriods(year?: number, type?: PeriodType) {
  return useQuery({
    queryKey: kpiKeys.periods(year, type),
    queryFn: () => api.get<PeriodDto[]>(`/periods${qs({ year, type })}`),
  });
}

export function useRuleSets() {
  return useQuery({
    queryKey: kpiKeys.ruleSets,
    queryFn: () => api.get<RuleSetDto[]>('/rule-sets'),
  });
}

export function useRuleSetVersion(id: string) {
  return useQuery({
    queryKey: kpiKeys.ruleSetVersion(id),
    queryFn: () => api.get<RuleSetVersionDto>(`/rule-set-versions/${id}`),
  });
}

export function useCatalogVersions() {
  return useQuery({
    queryKey: kpiKeys.catalogs,
    queryFn: () => api.get<CatalogVersionDto[]>('/work-catalogs/versions'),
  });
}

/**
 * Danh mục SP/CV theo vị trí việc làm (docs/05): mặc định của người dùng; `employeeId` = theo VTVL của cán bộ
 * được đánh giá; `scope: 'all'` = toàn bộ (cần quyền).
 */
export interface CatalogItemsOptions {
  employeeId?: string;
  scope?: 'mine' | 'all';
}

export function useCatalogItems(
  versionId: string | undefined,
  q: string,
  opts: CatalogItemsOptions = {},
) {
  return useQuery({
    queryKey: kpiKeys.catalogItems(versionId ?? '', q, opts),
    queryFn: () =>
      api.get<CatalogItemDto[]>(
        `/work-catalogs/versions/${versionId}/items${qs({ q, employeeId: opts.employeeId, scope: opts.scope })}`,
      ),
    enabled: !!versionId,
    placeholderData: keepPreviousData,
  });
}

export function useCriteriaSets() {
  return useQuery({
    queryKey: kpiKeys.criteriaSets,
    queryFn: () => api.get<CriteriaSetDto[]>('/criteria-sets'),
  });
}

export function useCriteriaVersion(id: string) {
  return useQuery({
    queryKey: kpiKeys.criteriaVersion(id),
    queryFn: () => api.get<CriteriaVersionDto>(`/criteria-versions/${id}`),
  });
}

export function useObjectives(periodId: string | undefined) {
  return useQuery({
    queryKey: kpiKeys.objectives(periodId ?? ''),
    queryFn: () => api.get<ObjectiveDto[]>(`/objectives${qs({ periodId })}`),
    enabled: !!periodId,
  });
}

export interface EvaluationFilters {
  periodId?: string;
  status?: string;
  q?: string;
  page: number;
  pageSize: number;
}

export function useEvaluations(f: EvaluationFilters) {
  return useQuery({
    queryKey: kpiKeys.evaluations(f),
    queryFn: () => api.page<EvaluationListItem>(`/evaluations${qs({ ...f })}`),
    placeholderData: keepPreviousData,
  });
}

export function useEvaluation(id: string) {
  return useQuery({
    queryKey: kpiKeys.evaluation(id),
    queryFn: () => api.get<EvaluationDetail>(`/evaluations/${id}`),
  });
}

export interface TrialResult {
  layer: 'self' | 'review';
  engineVersion: string;
  ruleSetChecksum: string;
  result: ScoreResult;
}

/** Mutation gọi một thao tác rồi làm mới các truy vấn liên quan. */
export function useAction<TArgs, TResult>(
  fn: (args: TArgs) => Promise<TResult>,
  invalidate: readonly (readonly unknown[])[],
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const key of invalidate) void qc.invalidateQueries({ queryKey: key });
    },
  });
}

export function useMyJobPosition() {
  return useQuery({
    queryKey: kpiKeys.myJobPosition,
    queryFn: () => api.get<MyJobPositionDto>('/work-catalogs/my-job-position'),
  });
}

/** Các VTVL kèm mã sản phẩm/công việc đã phân (quyền catalog.assign). */
export function useJobPositionItems(enabled: boolean) {
  return useQuery({
    queryKey: kpiKeys.jobPositionItems,
    queryFn: () => api.get<JobPositionWorkItemsDto[]>('/work-catalogs/job-positions'),
    enabled,
  });
}
