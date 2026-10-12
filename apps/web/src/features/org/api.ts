import { useQuery } from '@tanstack/react-query';
import type { JobPositionDto, PositionDto, UnitDto } from '@kpi/shared';
import { api, qs } from '@/lib/api-client';

export const orgKeys = {
  units: (archived = false) => ['org', 'units', { archived }] as const,
  positions: (archived = false) => ['org', 'positions', { archived }] as const,
  jobPositions: (archived = false) => ['org', 'job-positions', { archived }] as const,
};

export const useUnits = (includeArchived = false, enabled = true) =>
  useQuery({
    queryKey: orgKeys.units(includeArchived),
    queryFn: () => api.get<UnitDto[]>(`/org-units${qs({ includeArchived })}`),
    enabled,
  });

export const usePositions = (includeArchived = false, enabled = true) =>
  useQuery({
    queryKey: orgKeys.positions(includeArchived),
    queryFn: () => api.get<PositionDto[]>(`/positions${qs({ includeArchived })}`),
    enabled,
  });

export const useJobPositions = (includeArchived = false, enabled = true) =>
  useQuery({
    queryKey: orgKeys.jobPositions(includeArchived),
    queryFn: () => api.get<JobPositionDto[]>(`/job-positions${qs({ includeArchived })}`),
    enabled,
  });

/** Sắp xếp đơn vị theo cây (cha trước con) kèm độ sâu để hiển thị thụt lề. */
export function flattenUnitTree(units: UnitDto[]): (UnitDto & { depth: number })[] {
  const byParent = new Map<string | null, UnitDto[]>();
  const ids = new Set(units.map((u) => u.id));
  for (const u of units) {
    const key = u.parentId && ids.has(u.parentId) ? u.parentId : null;
    byParent.set(key, [...(byParent.get(key) ?? []), u]);
  }
  const out: (UnitDto & { depth: number })[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const u of byParent.get(parent) ?? []) {
      out.push({ ...u, depth });
      walk(u.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}
