import type { EvaluationStatus, KpiProfile, PeriodType } from '@kpi/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Db } from '../../lib/prisma.js';
import { VERSION_INCLUDE } from '../criteria/repository.js';

export const LIST_INCLUDE = {
  period: { select: { id: true, code: true, name: true } },
  subjectEmployee: { select: { id: true, employeeCode: true, fullName: true } },
  unit: { select: { id: true, name: true } },
} satisfies Prisma.EvaluationRecordInclude;
export type EvaluationListRow = Prisma.EvaluationRecordGetPayload<{ include: typeof LIST_INCLUDE }>;

export const DETAIL_INCLUDE = {
  ...LIST_INCLUDE,
  period: { select: { id: true, code: true, name: true, status: true, isRated: true } },
  criteriaVersion: { include: VERSION_INCLUDE },
  ruleSetVersion: { include: { ruleSet: true } },
  items: true,
  history: { orderBy: { createdAt: 'asc' } },
  calculations: { where: { kind: { not: 'TRIAL' } }, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.EvaluationRecordInclude;
export type EvaluationDetailRow = Prisma.EvaluationRecordGetPayload<{
  include: typeof DETAIL_INCLUDE;
}>;

export interface HistoryEntry {
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  actorUserId: string;
  comment: string | null;
}

type OnWrite = (tx: Prisma.TransactionClient) => Promise<void>;

export function createEvaluationsRepository(db: Db) {
  return {
    async list(where: Prisma.EvaluationRecordWhereInput, skip: number, take: number) {
      const [rows, total] = await Promise.all([
        db.evaluationRecord.findMany({
          where,
          include: LIST_INCLUDE,
          orderBy: [{ period: { startDate: 'desc' } }, { subjectEmployee: { fullName: 'asc' } }],
          skip,
          take,
        }),
        db.evaluationRecord.count({ where }),
      ]);
      return { rows, total };
    },
    find(id: string, where: Prisma.EvaluationRecordWhereInput) {
      return db.evaluationRecord.findFirst({
        where: { AND: [{ id }, where] },
        include: DETAIL_INCLUDE,
      });
    },
    count(where: Prisma.EvaluationRecordWhereInput) {
      return db.evaluationRecord.count({ where });
    },
    userNames(ids: string[]) {
      return db.user.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          username: true,
          displayName: true,
          employee: { select: { fullName: true } },
        },
      });
    },
    period(id: string) {
      return db.evaluationPeriod.findUnique({ where: { id } });
    },
    /** Cán bộ đang công tác kèm phân công chính hiệu lực (để chụp lại thông tin khi tạo hồ sơ). */
    employeesWithAssignment(where: Prisma.EmployeeWhereInput) {
      return db.employee.findMany({
        where: { AND: [where, { status: 'WORKING' }] },
        include: {
          assignments: {
            where: { isPrimary: true, endDate: null },
            include: {
              unit: { select: { id: true, name: true } },
              position: { select: { id: true, name: true, kpiProfile: true } },
              jobPosition: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { fullName: 'asc' },
      });
    },
    existingSubjects(periodId: string) {
      return db.evaluationRecord.findMany({
        where: { periodId },
        select: { subjectEmployeeId: true },
      });
    },
    /** Phiên bản bộ tiêu chí có thể áp dụng (đã trình hoặc đã duyệt, có gắn bộ quy tắc). */
    candidateCriteriaVersions(
      kpiProfile: KpiProfile,
      jobPositionId: string | null,
      periodType: PeriodType,
    ) {
      return db.criteriaVersion.findMany({
        where: {
          status: { in: ['SUBMITTED', 'APPROVED'] },
          periodTypes: { has: periodType },
          ruleSetVersionId: { not: null },
          criteriaSet: {
            kpiProfile,
            OR: [{ jobPositionId: null }, ...(jobPositionId ? [{ jobPositionId }] : [])],
          },
        },
        include: { criteriaSet: true },
        orderBy: { versionNo: 'desc' },
      });
    },
    criteriaVersion(id: string) {
      return db.criteriaVersion.findUnique({ where: { id }, include: { criteriaSet: true } });
    },

    create(
      data: Prisma.EvaluationRecordUncheckedCreateInput,
      actorUserId: string,
      onWrite: (tx: Prisma.TransactionClient, id: string) => Promise<void>,
    ) {
      return db.$transaction(async (tx) => {
        const row = await tx.evaluationRecord.create({ data });
        await tx.evaluationHistory.create({
          data: {
            evaluationId: row.id,
            action: 'create',
            fromStatus: null,
            toStatus: 'DRAFT',
            actorUserId,
          },
        });
        await onWrite(tx, row.id);
        return row.id;
      });
    },

    /** Lưu dữ liệu chấm (tự đánh giá hoặc thẩm định) — kiểm tra version + trạng thái nguồn trong cùng câu lệnh. */
    saveInputs(args: {
      id: string;
      expectVersion: number;
      from: EvaluationStatus[];
      data: Prisma.EvaluationRecordUncheckedUpdateManyInput;
      layer: 'self' | 'review';
      items: { criteriaItemId: string; input: Prisma.InputJsonValue; note: string | null }[];
      history: HistoryEntry | null;
      onWrite: OnWrite;
    }) {
      return db.$transaction(async (tx) => {
        const { count } = await tx.evaluationRecord.updateMany({
          where: { id: args.id, version: args.expectVersion, status: { in: args.from } },
          data: { ...args.data, version: { increment: 1 } },
        });
        if (count === 0) return false;
        for (const i of args.items) {
          const values =
            args.layer === 'self'
              ? { selfInput: i.input, selfNote: i.note }
              : { reviewInput: i.input, reviewNote: i.note };
          await tx.evaluationItem.upsert({
            where: {
              evaluationId_criteriaItemId: {
                evaluationId: args.id,
                criteriaItemId: i.criteriaItemId,
              },
            },
            create: { evaluationId: args.id, criteriaItemId: i.criteriaItemId, ...values },
            update: values,
          });
        }
        if (args.history)
          await tx.evaluationHistory.create({ data: { evaluationId: args.id, ...args.history } });
        await args.onWrite(tx);
        return true;
      });
    },

    /** Chuyển trạng thái + (tùy chọn) ghi ảnh chụp tính điểm + lịch sử, trong một transaction. */
    transition(args: {
      id: string;
      expectVersion: number;
      from: EvaluationStatus[];
      data: Prisma.EvaluationRecordUncheckedUpdateManyInput;
      calculation: Omit<Prisma.EvaluationCalculationUncheckedCreateInput, 'evaluationId'> | null;
      history: HistoryEntry;
      onWrite: OnWrite;
    }) {
      return db.$transaction(async (tx) => {
        const { count } = await tx.evaluationRecord.updateMany({
          where: { id: args.id, version: args.expectVersion, status: { in: args.from } },
          data: { ...args.data, version: { increment: 1 } },
        });
        if (count === 0) return false;
        if (args.calculation)
          await tx.evaluationCalculation.create({
            data: { ...args.calculation, evaluationId: args.id },
          });
        await tx.evaluationHistory.create({ data: { evaluationId: args.id, ...args.history } });
        await args.onWrite(tx);
        return true;
      });
    },
  };
}
