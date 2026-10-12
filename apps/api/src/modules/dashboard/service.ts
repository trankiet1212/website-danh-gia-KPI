/**
 * Dashboard tổng hợp — số liệu lấy trực tiếp từ PostgreSQL, lọc theo phạm vi quyền `dashboard.read`
 * và bộ lọc kỳ / đơn vị / cá nhân / trạng thái. Phân bố xếp loại chỉ tính hồ sơ ĐÃ PHÊ DUYỆT.
 */
import type { DashboardQuery, DashboardSummary, EvaluationStatus } from '@kpi/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AuthContext } from '../../auth/types.js';
import { AppError } from '../../lib/errors.js';
import type { Db } from '../../lib/prisma.js';
import { parseRuleConfig } from '../../scoring/adapter.js';
import { krProgress, objectiveProgress } from '../../scoring/kr-progress.js';
import { dataAccess } from '../reports/access.js';
import { createReportsRepository } from '../reports/repository.js';

const num = (v: { toNumber(): number } | null | undefined) =>
  v === null || v === undefined ? null : Math.round(v.toNumber() * 100) / 100;

/** Nhãn mức xếp loại lấy từ cấu hình các bộ quy tắc được dùng (không viết cứng). */
export async function ratingLabels(
  repo: ReturnType<typeof createReportsRepository>,
  where: Prisma.EvaluationRecordWhereInput,
) {
  const ids = (await repo.ruleSetVersionIds(where)).map((r) => r.ruleSetVersionId);
  const labels = new Map<string, { label: string; order: number }>();
  const configs = await repo.ruleConfigs(ids);
  for (const c of configs) {
    parseRuleConfig(c.config).rating.bands.forEach((b, i) => {
      if (!labels.has(b.code)) labels.set(b.code, { label: b.label, order: i });
    });
  }
  return { labels, configs };
}

export function createDashboardService(db: Db) {
  const repo = createReportsRepository(db);

  return {
    async summary(auth: AuthContext, q: DashboardQuery): Promise<DashboardSummary> {
      const access = dataAccess(auth, 'dashboard.read');
      if (q.unitId && !access.canSeeUnit(q.unitId))
        throw new AppError('NOT_FOUND', 'Không tìm thấy đơn vị');
      if (q.employeeId && !(await repo.employee(q.employeeId, access.employees))) {
        throw new AppError('NOT_FOUND', 'Không tìm thấy cán bộ');
      }
      const period = q.periodId ? await repo.period(q.periodId) : null;
      if (q.periodId && !period) throw new AppError('NOT_FOUND', 'Không tìm thấy kỳ đánh giá');

      const where: Prisma.EvaluationRecordWhereInput = {
        AND: [
          access.evaluations,
          q.periodId ? { periodId: q.periodId } : {},
          q.unitId ? { unitId: q.unitId } : {},
          q.employeeId ? { subjectEmployeeId: q.employeeId } : {},
          q.status ? { status: q.status } : {},
        ],
      };

      const [statusRows, avg, ratingRows, unitRows, unitAvg, units, rating] = await Promise.all([
        repo.statusCounts(where),
        repo.averages(where),
        repo.ratingCounts(where),
        repo.unitStatusCounts(where),
        repo.unitApprovedAverages(where),
        repo.units(),
        ratingLabels(repo, where),
      ]);

      const byStatus = statusRows.map((r) => ({
        status: r.status as EvaluationStatus,
        count: r._count._all,
      }));
      const count = (...s: EvaluationStatus[]) =>
        byStatus.filter((b) => s.includes(b.status)).reduce((a, b) => a + b.count, 0);

      // Cán bộ trong phạm vi (theo bộ lọc đơn vị/cá nhân)
      const employees = await repo.workingEmployees({
        AND: [
          access.employees,
          q.unitId
            ? { assignments: { some: { isPrimary: true, endDate: null, unitId: q.unitId } } }
            : {},
          q.employeeId ? { id: q.employeeId } : {},
        ],
      });
      const unitIds = new Set(employees.flatMap((e) => e.assignments.map((a) => a.unitId)));

      // Cán bộ chưa có hồ sơ trong kỳ (chỉ kỳ có xếp loại)
      let missing: DashboardSummary['missing'] = [];
      let notCreated: number | null = null;
      if (period?.isRated) {
        const has = new Set(
          (await repo.subjectsInPeriod(period.id)).map((r) => r.subjectEmployeeId),
        );
        const list = employees.filter((e) => !has.has(e.id));
        notCreated = list.length;
        missing = list.slice(0, 50).map((e) => ({
          employeeId: e.id,
          employeeCode: e.employeeCode,
          fullName: e.fullName,
          unitName: e.assignments[0]?.unit.name ?? null,
        }));
      }

      // Hồ sơ chờ tôi xử lý
      const periodOnly: Prisma.EvaluationRecordWhereInput = q.periodId
        ? { periodId: q.periodId }
        : {};
      const me = auth.employee?.id ?? null;
      const notMe: Prisma.EvaluationRecordWhereInput = me ? { NOT: { subjectEmployeeId: me } } : {};
      const [mine, toReview, toApprove] = await Promise.all([
        me && auth.permissions.has('evaluation.self')
          ? repo.pending({ AND: [periodOnly, { subjectEmployeeId: me }] }, ['DRAFT', 'RETURNED'])
          : [],
        auth.permissions.has('evaluation.review')
          ? repo.pending(
              { AND: [periodOnly, notMe, dataAccess(auth, 'evaluation.review').evaluations] },
              ['SUBMITTED', 'UNDER_REVIEW', 'REOPENED'],
            )
          : [],
        auth.permissions.has('evaluation.approve')
          ? repo.pending(
              { AND: [periodOnly, notMe, dataAccess(auth, 'evaluation.approve').evaluations] },
              ['REVIEWED'],
            )
          : [],
      ]);
      const pending: DashboardSummary['pending'] = [
        ...mine.map((p) => ({ ...p, action: 'self' as const })),
        ...toReview.map((p) => ({ ...p, action: 'review' as const })),
        ...toApprove.map((p) => ({ ...p, action: 'approve' as const })),
      ].map((p) => ({
        id: p.id,
        employee: p.subjectEmployee?.fullName ?? '',
        period: p.period.name,
        status: p.status as EvaluationStatus,
        action: p.action,
      }));

      // OKR (chỉ theo dõi)
      const objectives = await repo.objectives({
        AND: [
          access.objectives,
          q.periodId ? { periodId: q.periodId } : {},
          q.employeeId ? { ownerEmployeeId: q.employeeId } : {},
        ],
      });
      const krs = objectives.flatMap((o) =>
        o.keyResults.map((k) => ({
          ratio: krProgress({
            measureType: k.measureType,
            direction: k.direction,
            baseline: k.baseline?.toNumber() ?? null,
            target: k.target.toNumber(),
            currentValue: k.currentValue?.toNumber() ?? null,
          }).ratio,
          weight: null,
        })),
      );

      const unitName = new Map(units.map((u) => [u.id, u.name]));
      const avgByUnit = new Map(unitAvg.map((u) => [u.unitId, num(u._avg.approvedTotal)]));
      const unitAgg = new Map<string, { evaluations: number; approved: number }>();
      for (const r of unitRows) {
        const cur = unitAgg.get(r.unitId) ?? { evaluations: 0, approved: 0 };
        cur.evaluations += r._count._all;
        if (r.status === 'APPROVED') cur.approved += r._count._all;
        unitAgg.set(r.unitId, cur);
      }

      return {
        scopeLabel: access.label,
        period: period
          ? {
              id: period.id,
              code: period.code,
              name: period.name,
              isRated: period.isRated,
              status: period.status,
            }
          : null,
        counts: {
          employees: employees.length,
          units: unitIds.size,
          evaluations: count(...byStatus.map((b) => b.status)),
        },
        byStatus,
        progress: {
          notCreated,
          draft: count('DRAFT', 'RETURNED'),
          submitted: count('SUBMITTED', 'UNDER_REVIEW', 'REOPENED'),
          reviewed: count('REVIEWED'),
          approved: count('APPROVED'),
        },
        averages: {
          self: num(avg._avg.selfTotal),
          review: num(avg._avg.reviewTotal),
          approved: num(avg._avg.approvedTotal),
        },
        ratings: ratingRows
          .filter((r) => r.approvedRating)
          .map((r) => ({
            code: r.approvedRating!,
            label: rating.labels.get(r.approvedRating!)?.label ?? r.approvedRating!,
            count: r._count._all,
            order: rating.labels.get(r.approvedRating!)?.order ?? 99,
          }))
          .sort((a, b) => a.order - b.order)
          .map(({ order: _o, ...r }) => r),
        units: [...unitAgg.entries()]
          .map(([unitId, v]) => ({
            unitId,
            unitName: unitName.get(unitId) ?? '—',
            evaluations: v.evaluations,
            approved: v.approved,
            averageApproved: avgByUnit.get(unitId) ?? null,
          }))
          .sort((a, b) => a.unitName.localeCompare(b.unitName, 'vi')),
        missing,
        pending,
        okr: {
          objectives: objectives.length,
          keyResults: krs.length,
          averageProgress: objectiveProgress(krs),
        },
      };
    },
  };
}
