/**
 * Báo cáo cá nhân, đơn vị, toàn cơ quan và tổng hợp kỳ (tháng → quý → năm).
 * Mỗi báo cáo dựng thành một `ReportDocument` dùng chung cho xem, in, xuất Excel và PDF.
 * Phạm vi dữ liệu theo quyền đang dùng: xem = report.read, xuất = report.export.
 */
import {
  EVALUATION_STATUS_LABELS,
  PERIOD_TYPE_LABELS,
  type EvaluationStatus,
  type ExportFormat,
  type PermissionCode,
  type ReportColumn,
  type ReportDocument,
  type ReportTable,
  type RuleConfig,
} from '@kpi/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AuthContext } from '../../auth/types.js';
import { buildWorkbook } from '../../exporters/excel.js';
import { safeFileName } from '../../exporters/format.js';
import { buildReportPdf } from '../../exporters/pdf.js';
import { writeAudit, type AuditActor } from '../../lib/audit.js';
import { AppError } from '../../lib/errors.js';
import type { Db } from '../../lib/prisma.js';
import { parseRuleConfig } from '../../scoring/adapter.js';
import { aggregatePeriods } from '../../scoring/aggregate.js';
import { krProgress, objectiveProgress } from '../../scoring/kr-progress.js';
import { ratingLabels } from '../dashboard/service.js';
import { dataAccess } from './access.js';
import { createReportsRepository, type ReportEvalRow } from './repository.js';

type ReportPerm = Extract<PermissionCode, 'report.read' | 'report.export'>;
const num = (v: { toNumber(): number } | null | undefined) =>
  v === null || v === undefined ? null : v.toNumber();
const round2 = (n: number) => Math.round(n * 100) / 100;

const IN_PROGRESS: EvaluationStatus[] = ['SUBMITTED', 'UNDER_REVIEW', 'REVIEWED', 'REOPENED'];
const NOT_SUBMITTED: EvaluationStatus[] = ['DRAFT', 'RETURNED'];

const EVAL_COLUMNS: ReportColumn[] = [
  { key: 'stt', header: 'STT', kind: 'integer', width: 6 },
  { key: 'code', header: 'Mã cán bộ', width: 14 },
  { key: 'name', header: 'Họ và tên', width: 26 },
  { key: 'unit', header: 'Đơn vị', width: 24 },
  { key: 'position', header: 'Chức vụ', width: 20 },
  { key: 'status', header: 'Trạng thái', width: 16 },
  { key: 'self', header: 'Tự đánh giá', kind: 'number', width: 11 },
  { key: 'review', header: 'Thẩm định', kind: 'number', width: 11 },
  { key: 'approved', header: 'Đã phê duyệt', kind: 'number', width: 12 },
  { key: 'rating', header: 'Xếp loại (đã duyệt)', width: 24 },
];

function positionOf(r: ReportEvalRow): string {
  const snap = r.assignmentSnapshot as { position?: { name?: string } } | null;
  return snap?.position?.name ?? '';
}

export function createReportsService(db: Db) {
  const repo = createReportsRepository(db);

  /** Nhãn mức xếp loại theo cấu hình các bộ quy tắc của hồ sơ. */
  async function labelsFor(where: Prisma.EvaluationRecordWhereInput) {
    const { labels, configs } = await ratingLabels(repo, where);
    const label = (code: string | null) => (code ? (labels.get(code)?.label ?? code) : '');
    const bands = [...labels.entries()]
      .sort((a, b) => a[1].order - b[1].order)
      .map(([code, v]) => ({ code, label: v.label }));
    return { label, bands, unconfirmed: configs.some((c) => c.status !== 'CONFIRMED') };
  }

  function evalRows(rows: ReportEvalRow[], label: (c: string | null) => string) {
    return rows.map((r, i) => ({
      stt: i + 1,
      code: r.subjectEmployee?.employeeCode ?? '',
      name: r.subjectEmployee?.fullName ?? '',
      unit: r.unit.name,
      position: positionOf(r),
      status: EVALUATION_STATUS_LABELS[r.status as EvaluationStatus],
      self: num(r.selfTotal),
      review: num(r.reviewTotal),
      approved: r.status === 'APPROVED' ? num(r.approvedTotal) : null,
      rating: r.status === 'APPROVED' ? label(r.approvedRating) : '',
    }));
  }

  /** Phần tổng hợp chung cho một tập hồ sơ: số lượng theo trạng thái, phân bố xếp loại (chỉ hồ sơ đã duyệt), điểm. */
  function summarize(rows: ReportEvalRow[], bands: { code: string; label: string }[]) {
    const approved = rows.filter((r) => r.status === 'APPROVED');
    const totals = approved.map((r) => num(r.approvedTotal)).filter((n): n is number => n !== null);
    const summary: ReportDocument['summary'] = [
      { label: 'Tổng số hồ sơ', value: rows.length },
      {
        label: 'Chưa nộp (bản nháp, bị trả lại)',
        value: rows.filter((r) => NOT_SUBMITTED.includes(r.status as EvaluationStatus)).length,
      },
      {
        label: 'Đang thẩm định / chờ phê duyệt',
        value: rows.filter((r) => IN_PROGRESS.includes(r.status as EvaluationStatus)).length,
      },
      { label: 'Đã phê duyệt', value: approved.length },
      {
        label: 'Điểm bình quân đã phê duyệt',
        value: totals.length ? round2(totals.reduce((a, b) => a + b, 0) / totals.length) : null,
      },
      { label: 'Điểm cao nhất đã phê duyệt', value: totals.length ? Math.max(...totals) : null },
      { label: 'Điểm thấp nhất đã phê duyệt', value: totals.length ? Math.min(...totals) : null },
    ];
    const ratingTable: ReportTable = {
      title: 'Phân bố xếp loại (chỉ hồ sơ đã phê duyệt)',
      columns: [
        { key: 'rating', header: 'Mức xếp loại' },
        { key: 'count', header: 'Số người', kind: 'integer' },
        { key: 'share', header: 'Tỷ lệ', kind: 'percent' },
      ],
      rows: bands.map((b) => {
        const n = approved.filter((r) => r.approvedRating === b.code).length;
        return { rating: b.label, count: n, share: approved.length ? n / approved.length : null };
      }),
      totals: { rating: 'Cộng', count: approved.length, share: approved.length ? 1 : null },
    };
    const statusTable: ReportTable = {
      title: 'Hồ sơ theo trạng thái',
      columns: [
        { key: 'status', header: 'Trạng thái' },
        { key: 'count', header: 'Số hồ sơ', kind: 'integer' },
      ],
      rows: (Object.keys(EVALUATION_STATUS_LABELS) as EvaluationStatus[])
        .map((s) => ({
          status: EVALUATION_STATUS_LABELS[s],
          count: rows.filter((r) => r.status === s).length,
        }))
        .filter((r) => r.count > 0),
      totals: { status: 'Cộng', count: rows.length },
    };
    return { summary, ratingTable, statusTable };
  }

  function commonNotes(rows: { isDemo: boolean }[], unconfirmed: boolean): string[] {
    const notes = [
      'Điểm và mức xếp loại chính thức chỉ tính hồ sơ ĐÃ PHÊ DUYỆT; điểm tự đánh giá, thẩm định để tham khảo.',
      'Số liệu chỉ gồm hồ sơ thuộc phạm vi dữ liệu của người xem/xuất báo cáo.',
    ];
    if (unconfirmed)
      notes.push('Có hồ sơ dùng bộ quy tắc CHƯA ĐƯỢC XÁC NHẬN — kết quả chỉ mang tính tạm.');
    if (rows.some((r) => r.isDemo))
      notes.push('Có DỮ LIỆU DEMO (tên giả) — không dùng cho mục đích chính thức.');
    return notes;
  }

  const base = (auth: AuthContext, perm: ReportPerm) => ({
    access: dataAccess(auth, perm),
    generatedAt: new Date().toISOString(),
    generatedBy: auth.employee?.fullName ?? auth.displayName,
  });

  async function getPeriod(id: string) {
    const p = await repo.period(id);
    if (!p) throw new AppError('NOT_FOUND', 'Không tìm thấy kỳ đánh giá');
    return p;
  }

  const builders = {
    async unit(
      auth: AuthContext,
      perm: ReportPerm,
      q: { periodId: string; unitId: string },
    ): Promise<ReportDocument> {
      const { access, generatedAt, generatedBy } = base(auth, perm);
      const unit = await repo.unit(q.unitId);
      if (!unit || !access.canSeeUnit(unit.id))
        throw new AppError('NOT_FOUND', 'Không tìm thấy đơn vị');
      const period = await getPeriod(q.periodId);
      const where = { AND: [access.evaluations, { periodId: period.id, unitId: unit.id }] };
      const rows = await repo.evaluations(where);
      const { label, bands, unconfirmed } = await labelsFor(where);
      const { summary, ratingTable, statusTable } = summarize(rows, bands);
      return {
        kind: 'unit',
        title: `Báo cáo kết quả đánh giá — ${unit.name}`,
        filters: [`Kỳ: ${period.name}`, `Đơn vị: ${unit.name}`],
        generatedAt,
        generatedBy,
        scopeLabel: access.label,
        main: {
          columns: EVAL_COLUMNS.filter((c) => c.key !== 'unit'),
          rows: evalRows(rows, label),
        },
        summary,
        summaryTables: [ratingTable, statusTable],
        notes: commonNotes(rows, unconfirmed),
        orientation: 'landscape',
      };
    },

    async agency(
      auth: AuthContext,
      perm: ReportPerm,
      q: { periodId: string },
    ): Promise<ReportDocument> {
      const { access, generatedAt, generatedBy } = base(auth, perm);
      const period = await getPeriod(q.periodId);
      const where = { AND: [access.evaluations, { periodId: period.id }] };
      const rows = await repo.evaluations(where);
      const { label, bands, unconfirmed } = await labelsFor(where);
      const byUnit = new Map<string, { name: string; rows: ReportEvalRow[] }>();
      for (const r of rows) {
        const g = byUnit.get(r.unitId) ?? { name: r.unit.name, rows: [] };
        g.rows.push(r);
        byUnit.set(r.unitId, g);
      }
      const unitLine = (name: string, list: ReportEvalRow[]) => {
        const approved = list.filter((r) => r.status === 'APPROVED');
        const totals = approved
          .map((r) => num(r.approvedTotal))
          .filter((n): n is number => n !== null);
        const out: Record<string, string | number | null> = {
          unit: name,
          total: list.length,
          notSubmitted: list.filter((r) => NOT_SUBMITTED.includes(r.status as EvaluationStatus))
            .length,
          inProgress: list.filter((r) => IN_PROGRESS.includes(r.status as EvaluationStatus)).length,
          approved: approved.length,
          average: totals.length ? round2(totals.reduce((a, b) => a + b, 0) / totals.length) : null,
        };
        for (const b of bands)
          out[`r_${b.code}`] = approved.filter((r) => r.approvedRating === b.code).length;
        return out;
      };
      const { summary, ratingTable } = summarize(rows, bands);
      return {
        kind: 'agency',
        title: 'Báo cáo tổng hợp kết quả đánh giá toàn cơ quan',
        filters: [`Kỳ: ${period.name}`],
        generatedAt,
        generatedBy,
        scopeLabel: access.label,
        main: {
          columns: [
            { key: 'unit', header: 'Đơn vị', width: 30 },
            { key: 'total', header: 'Số hồ sơ', kind: 'integer' },
            { key: 'notSubmitted', header: 'Chưa nộp', kind: 'integer' },
            { key: 'inProgress', header: 'Đang xử lý', kind: 'integer' },
            { key: 'approved', header: 'Đã duyệt', kind: 'integer' },
            { key: 'average', header: 'Điểm BQ đã duyệt', kind: 'number' },
            ...bands.map((b): ReportColumn => ({
              key: `r_${b.code}`,
              header: b.label,
              kind: 'integer',
              width: 14,
            })),
          ],
          rows: [...byUnit.values()].map((g) => unitLine(g.name, g.rows)),
          totals: unitLine('Toàn cơ quan (trong phạm vi)', rows),
        },
        summary,
        summaryTables: [
          ratingTable,
          { title: 'Danh sách hồ sơ', columns: EVAL_COLUMNS, rows: evalRows(rows, label) },
        ],
        notes: commonNotes(rows, unconfirmed),
        orientation: 'landscape',
      };
    },

    async individual(
      auth: AuthContext,
      perm: ReportPerm,
      q: { employeeId: string; year: number },
    ): Promise<ReportDocument> {
      const { access, generatedAt, generatedBy } = base(auth, perm);
      const emp = await repo.employee(q.employeeId, access.employees);
      if (!emp) throw new AppError('NOT_FOUND', 'Không tìm thấy cán bộ');
      const where = {
        AND: [access.evaluations, { subjectEmployeeId: emp.id, period: { year: q.year } }],
      };
      const rows = await repo.evaluations(where);
      const { label, unconfirmed } = await labelsFor(where);
      const asg = emp.assignments[0];

      // Tổng hợp năm từ các quý có xếp loại, theo chiến lược trong bộ quy tắc
      const quarters = await repo.periods({ year: q.year, type: 'QUARTER', isRated: true });
      const yearRecord = rows.find((r) => r.period.type === 'YEAR');
      const ruleRow = yearRecord ?? rows.at(-1);
      const summary: ReportDocument['summary'] = [
        { label: 'Số kỳ có hồ sơ', value: rows.length },
        { label: 'Số kỳ đã phê duyệt', value: rows.filter((r) => r.status === 'APPROVED').length },
      ];
      const notes = commonNotes(rows, unconfirmed);
      if (ruleRow) {
        const rule: RuleConfig = parseRuleConfig(ruleRow.ruleSetVersion.config);
        const agg = aggregatePeriods(
          quarters.map((p) => {
            const r = rows.find((x) => x.periodId === p.id && x.status === 'APPROVED');
            return {
              periodCode: p.code,
              total: r ? num(r.approvedTotal) : null,
              rating: r?.approvedRating ?? null,
            };
          }),
          rule,
        );
        summary.push({
          label: `Tổng hợp năm ${q.year} theo quy tắc (${agg.strategy})`,
          value: agg.value ?? 'Không tự tính — cấp có thẩm quyền quyết định',
        });
        notes.push(...agg.steps.map((s) => `Tổng hợp năm: ${s}`));
      }

      const objectives = await repo.objectives({
        AND: [access.objectives, { ownerEmployeeId: emp.id, period: { year: q.year } }],
      });
      const okrRows = objectives.flatMap((o) =>
        o.keyResults.map((k) => {
          const p = krProgress({
            measureType: k.measureType,
            direction: k.direction,
            baseline: num(k.baseline),
            target: k.target.toNumber(),
            currentValue: num(k.currentValue),
          });
          return {
            objective: `${o.code}. ${o.title}`,
            kr: `${k.code}. ${k.title}`,
            target: k.target.toNumber(),
            current: num(k.currentValue),
            progress: p.ratio,
          };
        }),
      );
      const avg = objectiveProgress(okrRows.map((r) => ({ ratio: r.progress, weight: null })));

      return {
        kind: 'individual',
        title: `Báo cáo kết quả đánh giá cá nhân năm ${q.year}`,
        filters: [
          `Cán bộ: ${emp.fullName} (${emp.employeeCode})`,
          `Đơn vị: ${asg?.unit.name ?? '—'} · Chức vụ: ${asg?.position.name ?? '—'}`,
        ],
        generatedAt,
        generatedBy,
        scopeLabel: access.label,
        main: {
          columns: [
            { key: 'stt', header: 'STT', kind: 'integer', width: 6 },
            { key: 'period', header: 'Kỳ', width: 22 },
            { key: 'type', header: 'Loại kỳ', width: 12 },
            { key: 'status', header: 'Trạng thái', width: 16 },
            { key: 'self', header: 'Tự đánh giá', kind: 'number' },
            { key: 'review', header: 'Thẩm định', kind: 'number' },
            { key: 'approved', header: 'Đã phê duyệt', kind: 'number' },
            { key: 'rating', header: 'Xếp loại (đã duyệt)', width: 24 },
            { key: 'revision', header: 'Lần điều chỉnh', kind: 'integer' },
          ],
          rows: rows.map((r, i) => ({
            stt: i + 1,
            period: r.period.name,
            type: PERIOD_TYPE_LABELS[r.period.type],
            status: EVALUATION_STATUS_LABELS[r.status as EvaluationStatus],
            self: num(r.selfTotal),
            review: num(r.reviewTotal),
            approved: r.status === 'APPROVED' ? num(r.approvedTotal) : null,
            rating: r.status === 'APPROVED' ? label(r.approvedRating) : '',
            revision: r.revisionNo,
          })),
        },
        summary: [
          ...summary,
          {
            label: 'Tiến độ OKR bình quân (chỉ theo dõi, không phải điểm)',
            value: avg === null ? null : round2(avg * 100),
          },
        ],
        summaryTables: [
          {
            title: 'Mục tiêu, kết quả then chốt (chỉ theo dõi)',
            columns: [
              { key: 'objective', header: 'Mục tiêu', width: 30 },
              { key: 'kr', header: 'Kết quả then chốt', width: 40 },
              { key: 'target', header: 'Mục tiêu', kind: 'number' },
              { key: 'current', header: 'Hiện tại', kind: 'number' },
              { key: 'progress', header: 'Tiến độ', kind: 'percent' },
            ],
            rows: okrRows,
          },
        ],
        notes,
        orientation: 'landscape',
      };
    },

    /** Tổng hợp kỳ cha từ các kỳ con: năm ← quý; 6 tháng ← quý; quý ← tháng. */
    async aggregate(
      auth: AuthContext,
      perm: ReportPerm,
      q: { periodId: string; unitId?: string },
    ): Promise<ReportDocument> {
      const { access, generatedAt, generatedBy } = base(auth, perm);
      const parent = await getPeriod(q.periodId);
      if (parent.type === 'MONTH')
        throw new AppError('BUSINESS_RULE', 'Kỳ tháng không có kỳ con để tổng hợp');
      const unit = q.unitId ? await repo.unit(q.unitId) : null;
      if (q.unitId && (!unit || !access.canSeeUnit(q.unitId)))
        throw new AppError('NOT_FOUND', 'Không tìm thấy đơn vị');
      const children =
        parent.type === 'YEAR'
          ? await repo.periods({ year: parent.year, type: 'QUARTER' })
          : await repo.periods({ parentId: parent.id });
      const ids = [parent.id, ...children.map((c) => c.id)];
      const where = {
        AND: [access.evaluations, { periodId: { in: ids } }, unit ? { unitId: unit.id } : {}],
      };
      const rows = await repo.evaluations(where);
      const { label, unconfirmed } = await labelsFor(where);

      const people = new Map<string, ReportEvalRow[]>();
      for (const r of rows) {
        if (!r.subjectEmployeeId) continue;
        people.set(r.subjectEmployeeId, [...(people.get(r.subjectEmployeeId) ?? []), r]);
      }
      const strategies = new Set<string>();
      const table = [...people.values()].map((list, i) => {
        const first = list[0]!;
        const own = list.find((r) => r.periodId === parent.id);
        const ruleRow = own ?? list.at(-1)!;
        const rule = parseRuleConfig(ruleRow.ruleSetVersion.config);
        const scores = children
          .filter((c) => c.isRated)
          .map((c) => {
            const r = list.find((x) => x.periodId === c.id && x.status === 'APPROVED');
            return {
              periodCode: c.code,
              total: r ? num(r.approvedTotal) : null,
              rating: r?.approvedRating ?? null,
            };
          });
        const agg = aggregatePeriods(scores, rule);
        strategies.add(`${agg.strategy}: ${agg.steps[0] ?? ''}`);
        const line: Record<string, string | number | null> = {
          stt: i + 1,
          code: first.subjectEmployee?.employeeCode ?? '',
          name: first.subjectEmployee?.fullName ?? '',
          unit: first.unit.name,
        };
        for (const c of children) {
          const r = list.find((x) => x.periodId === c.id);
          line[`p_${c.code}`] = r && r.status === 'APPROVED' ? num(r.approvedTotal) : null;
        }
        line['aggregated'] =
          agg.value ??
          (agg.strategy === 'MANUAL_WITH_REFERENCE'
            ? 'Cấp có thẩm quyền quyết định'
            : 'Thiếu dữ liệu');
        line['own'] = own && own.status === 'APPROVED' ? num(own.approvedTotal) : null;
        line['ownRating'] = own && own.status === 'APPROVED' ? label(own.approvedRating) : '';
        return line;
      });

      return {
        kind: 'aggregate',
        title: `Tổng hợp kết quả ${PERIOD_TYPE_LABELS[parent.type].toLowerCase()} — ${parent.name}`,
        filters: [
          `Kỳ tổng hợp: ${parent.name}`,
          unit ? `Đơn vị: ${unit.name}` : 'Đơn vị: tất cả trong phạm vi',
        ],
        generatedAt,
        generatedBy,
        scopeLabel: access.label,
        main: {
          columns: [
            { key: 'stt', header: 'STT', kind: 'integer', width: 6 },
            { key: 'code', header: 'Mã cán bộ', width: 14 },
            { key: 'name', header: 'Họ và tên', width: 26 },
            { key: 'unit', header: 'Đơn vị', width: 22 },
            ...children.map((c): ReportColumn => ({
              key: `p_${c.code}`,
              header: `${c.name}${c.isRated ? '' : ' (không xếp loại riêng)'}`,
              kind: 'number',
              width: 14,
            })),
            { key: 'aggregated', header: 'Tổng hợp theo quy tắc', width: 22 },
            { key: 'own', header: `Kết quả ${parent.name} (đã duyệt)`, kind: 'number', width: 14 },
            { key: 'ownRating', header: 'Xếp loại (đã duyệt)', width: 22 },
          ],
          rows: table,
        },
        summary: [
          { label: 'Số cán bộ có hồ sơ', value: table.length },
          { label: 'Số kỳ con', value: children.length },
        ],
        summaryTables: [],
        notes: [
          ...commonNotes(rows, unconfirmed),
          'Cột kỳ con chỉ hiển thị điểm đã phê duyệt.',
          ...[...strategies].map((s) => `Quy tắc tổng hợp (annualAggregation) — ${s}`),
        ],
        orientation: 'landscape',
      };
    },
  };

  return {
    view: builders,

    /** Xuất file từ cùng nội dung báo cáo (phạm vi theo quyền report.export) và ghi nhật ký. */
    async export<K extends keyof typeof builders>(
      auth: AuthContext,
      kind: K,
      params: Parameters<(typeof builders)[K]>[2],
      format: ExportFormat,
      actor: AuditActor,
    ) {
      const builder = builders[kind] as (
        a: AuthContext,
        p: ReportPerm,
        q: typeof params,
      ) => Promise<ReportDocument>;
      const doc = await builder(auth, 'report.export', params);
      const at = new Date(doc.generatedAt);
      const buffer =
        format === 'xlsx' ? await buildWorkbook(doc, at) : await buildReportPdf(doc, at);
      await writeAudit(db, actor, {
        action: 'report.export',
        entityType: 'report',
        entityId: kind,
        changes: { format, params, rows: doc.main.rows.length, scope: doc.scopeLabel },
      });
      const stamp = doc.generatedAt.slice(0, 10);
      return {
        buffer,
        fileName: `${safeFileName(`bao-cao-${kind}-${doc.filters[0] ?? ''}`)}-${stamp}.${format}`,
        contentType:
          format === 'xlsx'
            ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            : 'application/pdf',
      };
    },
  };
}

export type ReportsService = ReturnType<typeof createReportsService>;
