/**
 * Dữ liệu kiểm thử GĐ5 (KPI/OKR): kỳ đánh giá riêng (năm ngẫu nhiên để không đụng kỳ thật),
 * bộ quy tắc CHỜ XÁC NHẬN theo cấu hình DEMO, cây tiêu chí mẫu. Không xóa dữ liệu nào.
 */
import { randomInt } from 'node:crypto';
import type { CompositeRow, EvaluationStatus, PeriodStatus, RuleConfig } from '@kpi/shared';
import {
  QD39_HD05_CONFIG,
  QD39_HD05_LEGAL_BASIS,
} from '../../prisma/seed/rule-config-qd39-hd05.js';
import type { Db } from '../../src/lib/prisma.js';
import { checksumOf } from '../../src/scoring/checksum.js';
import type { Fixture } from './fixture.js';

export async function userId(db: Db, username: string): Promise<string> {
  return (await db.user.findUniqueOrThrow({ where: { username } })).id;
}

/** Kỳ quý riêng cho bộ test (năm 3000–9999, mã có hậu tố ngẫu nhiên); mặc định đang mở (OPEN). */
export async function createQuarter(
  db: Db,
  fx: Fixture,
  opts: { seq?: number; isRated?: boolean; tag?: string; status?: PeriodStatus } = {},
) {
  const year = randomInt(3000, 9999);
  const seq = opts.seq ?? 2;
  return db.evaluationPeriod.create({
    data: {
      code: `${opts.tag ?? 'Q'}${seq}-${fx.sfx}`,
      name: `Quý ${seq} kiểm thử ${fx.sfx}`,
      type: 'QUARTER',
      year,
      seq,
      startDate: new Date(Date.UTC(year, seq * 3 - 3, 1)),
      endDate: new Date(Date.UTC(year, seq * 3, 0)),
      isRated: opts.isRated ?? true,
      status: opts.status ?? 'OPEN',
    },
  });
}

/** Phiên bản bộ quy tắc mới ở trạng thái CHỜ XÁC NHẬN (người tạo = null hoặc theo tham số). */
export async function createRuleSetVersion(db: Db, fx: Fixture, createdById: string | null = null) {
  const set = await db.ruleSet.create({
    data: { code: `RS-${fx.sfx}-${randomInt(1000, 9999)}`, name: `Quy tắc kiểm thử ${fx.sfx}` },
  });
  return db.ruleSetVersion.create({
    data: {
      ruleSetId: set.id,
      versionNo: 1,
      status: 'PENDING_CONFIRMATION',
      config: QD39_HD05_CONFIG as object,
      legalBasis: QD39_HD05_LEGAL_BASIS,
      checksum: checksumOf(QD39_HD05_CONFIG),
      createdById,
    },
  });
}

/** Cây tiêu chí mẫu: 30 điểm chung (nhóm 18 + nhóm 12) + 1 trục KPI tổng hợp 70 điểm. */
export function sampleCriteriaItems() {
  return [
    {
      key: 'g1',
      kind: 'GENERAL_GROUP',
      code: '1',
      name: 'Nhóm tiêu chí 1',
      maxPoints: 18,
      sortOrder: 1,
    },
    {
      key: 'g11',
      parentKey: 'g1',
      kind: 'GENERAL_ITEM',
      code: '1.1',
      name: 'Tiêu chí 1.1',
      maxPoints: 18,
      scoringMethod: 'PASS_FAIL',
      sortOrder: 2,
    },
    {
      key: 'g2',
      kind: 'GENERAL_GROUP',
      code: '2',
      name: 'Nhóm tiêu chí 2',
      maxPoints: 12,
      sortOrder: 3,
    },
    {
      key: 'g21',
      parentKey: 'g2',
      kind: 'GENERAL_ITEM',
      code: '2.1',
      name: 'Tiêu chí 2.1',
      maxPoints: 4,
      scoringMethod: 'PASS_FAIL',
      sortOrder: 4,
    },
    {
      key: 'g22',
      parentKey: 'g2',
      kind: 'GENERAL_ITEM',
      code: '2.2',
      name: 'Tiêu chí 2.2',
      maxPoints: 8,
      scoringMethod: 'PASS_FAIL',
      sortOrder: 5,
    },
    {
      key: 'ax',
      kind: 'AXIS',
      code: 'T1',
      name: 'Trục kết quả nhiệm vụ',
      maxPoints: 70,
      scoringMethod: 'KPI_COMPOSITE',
      sortOrder: 10,
    },
  ];
}

export function row(partial: Partial<CompositeRow> = {}): CompositeRow {
  return {
    label: 'Nhiệm vụ kiểm thử',
    catalogItemCode: null,
    coefficient: 1,
    plannedQty: 4,
    completedQty: 4,
    reworkQty: 0,
    reworkCount: 0,
    lateQty: 0,
    lateCount: 0,
    exemptCount: 0,
    exemptNote: null,
    exceeded: false,
    ...partial,
  };
}

/**
 * Bộ dữ liệu báo cáo: bộ quy tắc ĐÃ XÁC NHẬN + bộ tiêu chí ĐÃ DUYỆT (chèn thẳng, không cần mục tiêu chí)
 * và hàm tạo hồ sơ ở trạng thái bất kỳ (chèn trực tiếp — trigger chỉ chặn SỬA hồ sơ đã duyệt).
 */
export async function createReportSetup(
  db: Db,
  fx: Fixture,
  config: RuleConfig = QD39_HD05_CONFIG,
) {
  const set = await db.ruleSet.create({
    data: { code: `RSR-${fx.sfx}-${randomInt(1000, 9999)}`, name: 'Quy tắc báo cáo' },
  });
  const rule = await db.ruleSetVersion.create({
    data: {
      ruleSetId: set.id,
      versionNo: 1,
      status: 'CONFIRMED',
      config: config as object,
      legalBasis: QD39_HD05_LEGAL_BASIS,
      checksum: checksumOf(config),
    },
  });
  const cs = await db.criteriaSet.create({
    data: {
      code: `CSR-${fx.sfx}-${randomInt(1000, 9999)}`,
      name: 'Bộ tiêu chí báo cáo',
      kpiProfile: 'STAFF',
    },
  });
  const cv = await db.criteriaVersion.create({
    data: {
      criteriaSetId: cs.id,
      versionNo: 1,
      status: 'APPROVED',
      periodTypes: ['QUARTER', 'YEAR'],
      generalMax: 30,
      resultMax: 70,
      ruleSetVersionId: rule.id,
    },
  });
  const record = (args: {
    periodId: string;
    employeeId: string;
    unitId: string;
    status: EvaluationStatus;
    self?: number;
    review?: number;
    approved?: number;
    rating?: string;
    ruleSetVersionId?: string;
  }) =>
    db.evaluationRecord.create({
      data: {
        periodId: args.periodId,
        subjectEmployeeId: args.employeeId,
        unitId: args.unitId,
        assignmentSnapshot: { position: { name: 'Chuyên viên' } },
        kpiProfile: 'STAFF',
        criteriaVersionId: cv.id,
        ruleSetVersionId: args.ruleSetVersionId ?? rule.id,
        status: args.status,
        selfTotal: args.self ?? null,
        reviewTotal: args.review ?? null,
        approvedTotal: args.approved ?? null,
        approvedRating: args.rating ?? null,
        reviewRating: args.rating ?? null,
      },
    });
  return { rule, criteriaVersionId: cv.id, record };
}

/** Cây kỳ một năm riêng cho test: năm + 4 quý (Quý IV không xếp loại riêng). */
export async function createYearTree(db: Db, fx: Fixture) {
  const year = randomInt(3000, 9999);
  const y = await db.evaluationPeriod.create({
    data: {
      code: `Y-${fx.sfx}`,
      name: `Năm ${year} (KT ${fx.sfx})`,
      type: 'YEAR',
      year,
      seq: 1,
      startDate: new Date(Date.UTC(year, 0, 1)),
      endDate: new Date(Date.UTC(year, 11, 31)),
      status: 'OPEN',
    },
  });
  const quarters = [];
  for (let q = 1; q <= 4; q++) {
    quarters.push(
      await db.evaluationPeriod.create({
        data: {
          code: `YQ${q}-${fx.sfx}`,
          name: `Quý ${q}/${year} (KT)`,
          type: 'QUARTER',
          year,
          seq: q,
          startDate: new Date(Date.UTC(year, q * 3 - 3, 1)),
          endDate: new Date(Date.UTC(year, q * 3, 0)),
          isRated: q !== 4,
          status: 'OPEN',
        },
      }),
    );
  }
  return { year, yearPeriod: y, quarters };
}
