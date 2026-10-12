/**
 * Truy vấn dữ liệu cho dashboard, báo cáo, dự thảo. Mọi hàm nhận điều kiện phạm vi (`where`) từ service.
 */
import type { EvaluationStatus } from '@kpi/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Db } from '../../lib/prisma.js';

export const REPORT_EVAL_INCLUDE = {
  period: {
    select: { id: true, code: true, name: true, type: true, startDate: true, isRated: true },
  },
  subjectEmployee: { select: { id: true, employeeCode: true, fullName: true } },
  unit: { select: { id: true, name: true, sortOrder: true } },
  ruleSetVersion: { select: { id: true, status: true, config: true } },
} satisfies Prisma.EvaluationRecordInclude;
export type ReportEvalRow = Prisma.EvaluationRecordGetPayload<{
  include: typeof REPORT_EVAL_INCLUDE;
}>;

export function createReportsRepository(db: Db) {
  return {
    evaluations(where: Prisma.EvaluationRecordWhereInput) {
      return db.evaluationRecord.findMany({
        where,
        include: REPORT_EVAL_INCLUDE,
        orderBy: [
          { unit: { sortOrder: 'asc' } },
          { subjectEmployee: { fullName: 'asc' } },
          { period: { startDate: 'asc' } },
        ],
        take: 5000,
      });
    },
    /** Hồ sơ kèm ảnh chụp tính điểm (dùng cho phiếu kết quả cá nhân). */
    evaluationWithCalculations(id: string, where: Prisma.EvaluationRecordWhereInput) {
      return db.evaluationRecord.findFirst({
        where: { AND: [{ id }, where] },
        include: {
          ...REPORT_EVAL_INCLUDE,
          calculations: { where: { kind: { not: 'TRIAL' } }, orderBy: { createdAt: 'asc' } },
        },
      });
    },
    period(id: string) {
      return db.evaluationPeriod.findUnique({ where: { id } });
    },
    periods(where: Prisma.EvaluationPeriodWhereInput) {
      return db.evaluationPeriod.findMany({
        where,
        orderBy: [{ startDate: 'asc' }, { type: 'asc' }],
      });
    },
    unit(id: string) {
      return db.organizationalUnit.findUnique({ where: { id } });
    },
    units() {
      return db.organizationalUnit.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    },
    agencyUnit() {
      return db.organizationalUnit.findFirst({
        where: { type: 'AGENCY', parentId: null },
        orderBy: { sortOrder: 'asc' },
      });
    },
    employee(id: string, where: Prisma.EmployeeWhereInput) {
      return db.employee.findFirst({
        where: { AND: [{ id }, where] },
        include: {
          assignments: {
            where: { isPrimary: true, endDate: null },
            include: { unit: { select: { name: true } }, position: { select: { name: true } } },
          },
        },
      });
    },
    /** Cán bộ đang công tác trong phạm vi, kèm đơn vị của phân công chính. */
    workingEmployees(where: Prisma.EmployeeWhereInput) {
      return db.employee.findMany({
        where: { AND: [where, { status: 'WORKING' }] },
        select: {
          id: true,
          employeeCode: true,
          fullName: true,
          assignments: {
            where: { isPrimary: true, endDate: null },
            select: { unitId: true, unit: { select: { name: true } } },
          },
        },
        orderBy: { fullName: 'asc' },
      });
    },
    statusCounts(where: Prisma.EvaluationRecordWhereInput) {
      return db.evaluationRecord.groupBy({ by: ['status'], where, _count: { _all: true } });
    },
    unitStatusCounts(where: Prisma.EvaluationRecordWhereInput) {
      return db.evaluationRecord.groupBy({
        by: ['unitId', 'status'],
        where,
        _count: { _all: true },
      });
    },
    unitApprovedAverages(where: Prisma.EvaluationRecordWhereInput) {
      return db.evaluationRecord.groupBy({
        by: ['unitId'],
        where: { AND: [where, { status: 'APPROVED' }] },
        _avg: { approvedTotal: true },
      });
    },
    averages(where: Prisma.EvaluationRecordWhereInput) {
      return db.evaluationRecord.aggregate({
        where,
        _avg: { selfTotal: true, reviewTotal: true, approvedTotal: true },
      });
    },
    ratingCounts(where: Prisma.EvaluationRecordWhereInput) {
      return db.evaluationRecord.groupBy({
        by: ['approvedRating'],
        where: { AND: [where, { status: 'APPROVED' }] },
        _count: { _all: true },
      });
    },
    ruleSetVersionIds(where: Prisma.EvaluationRecordWhereInput) {
      return db.evaluationRecord.groupBy({ by: ['ruleSetVersionId'], where });
    },
    ruleConfigs(ids: string[]) {
      return db.ruleSetVersion.findMany({
        where: { id: { in: ids } },
        select: { id: true, status: true, config: true },
      });
    },
    subjectsInPeriod(periodId: string) {
      return db.evaluationRecord.findMany({
        where: { periodId },
        select: { subjectEmployeeId: true },
      });
    },
    pending(where: Prisma.EvaluationRecordWhereInput, statuses: EvaluationStatus[]) {
      return db.evaluationRecord.findMany({
        where: { AND: [where, { status: { in: statuses } }] },
        select: {
          id: true,
          status: true,
          subjectEmployee: { select: { fullName: true } },
          period: { select: { name: true } },
        },
        orderBy: { updatedAt: 'asc' },
        take: 20,
      });
    },
    objectives(where: Prisma.ObjectiveWhereInput) {
      return db.objective.findMany({
        where,
        include: { keyResults: true, period: { select: { name: true } } },
        orderBy: { code: 'asc' },
        take: 1000,
      });
    },
  };
}
