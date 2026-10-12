/**
 * Dự thảo văn bản theo mẫu (GĐ6). Mẫu là TẠM (chưa có mẫu chính thức — docs/09 #16), có phiên bản.
 * Văn bản sinh ra luôn ở trạng thái "DỰ THẢO"; trường chưa có dữ liệu liệt kê ở `missingFields`.
 * Kết quả xếp loại chỉ lấy từ hồ sơ ĐÃ PHÊ DUYỆT. Dữ liệu lọc theo phạm vi quyền report.read.
 */
import {
  EVALUATION_STATUS_LABELS,
  type DraftBlock,
  type DraftDocument,
  type DraftRequest,
  type DraftTemplateDto,
  type EvaluationStatus,
  type ItemScore,
  type ReportTable,
  type ScoreResult,
} from '@kpi/shared';
import type { AuthContext } from '../../auth/types.js';
import { buildDraftPdf } from '../../exporters/pdf.js';
import { fmtNumber, safeFileName } from '../../exporters/format.js';
import { writeAudit, type AuditActor } from '../../lib/audit.js';
import { AppError } from '../../lib/errors.js';
import type { Db } from '../../lib/prisma.js';
import { dataAccess } from '../reports/access.js';
import { createReportsRepository } from '../reports/repository.js';
import { createReportsService } from '../reports/service.js';

/** Cơ quan cấp trên ghi ở góc trái văn bản — thuộc nội dung MẪU TẠM, sửa khi có mẫu chính thức. */
const AGENCY_PARENT = 'Tỉnh ủy Đắk Lắk';
const VERSION = 'TẠM-1';

export const DRAFT_TEMPLATES: DraftTemplateDto[] = [
  {
    code: 'BC-KQDG',
    name: 'Báo cáo kết quả đánh giá, xếp loại cán bộ, công chức',
    version: VERSION,
    params: ['periodId', 'unitId'],
    description:
      'Báo cáo theo kỳ cho một đơn vị (chọn đơn vị) hoặc toàn cơ quan (để trống đơn vị).',
    provisional: true,
  },
  {
    code: 'PHIEU-KQDG',
    name: 'Phiếu kết quả đánh giá, xếp loại cá nhân',
    version: VERSION,
    params: ['evaluationId'],
    description:
      'Tổng hợp điểm từng tiêu chí, kết quả 3 lớp điểm của một hồ sơ (ưu tiên kết quả đã phê duyệt).',
    provisional: true,
  },
];

const MISSING = {
  docNumber: 'Số, ký hiệu văn bản',
  placeDate: 'Địa danh, ngày tháng năm ban hành',
  signer: 'Người ký',
  conclusion: 'Nhận xét, đề xuất của cơ quan',
  comment: 'Nhận xét của người có thẩm quyền',
} as const;
const placeholder = (key: keyof typeof MISSING) => `[${MISSING[key]} — người soạn thảo bổ sung]`;

export function createDraftsService(db: Db) {
  const repo = createReportsRepository(db);
  const reports = createReportsService(db);

  async function header(auth: AuthContext) {
    const agency = await repo.agencyUnit();
    return {
      agencyParent: AGENCY_PARENT,
      agencyName: agency?.name ?? 'Ban Tổ chức',
      generatedAt: new Date().toISOString(),
      generatedBy: auth.employee?.fullName ?? auth.displayName,
      docNumber: null,
      placeDate: null,
    };
  }

  async function reportDraft(auth: AuthContext, req: DraftRequest): Promise<DraftDocument> {
    const tpl = DRAFT_TEMPLATES[0]!;
    const doc = req.unitId
      ? await reports.view.unit(auth, 'report.read', {
          periodId: req.periodId!,
          unitId: req.unitId,
        })
      : await reports.view.agency(auth, 'report.read', { periodId: req.periodId! });
    const rows = req.unitId ? doc.main.rows : (doc.summaryTables[1]?.rows ?? []);
    const approved = rows.filter((r) => r['approved'] !== null && r['approved'] !== undefined);
    const ratingTable = doc.summaryTables[0] as ReportTable;
    const scopeName = doc.filters[1]?.replace('Đơn vị: ', '') ?? 'toàn cơ quan';
    const total = rows.length;
    const warnings: string[] = [];
    if (total - approved.length > 0) {
      warnings.push(
        `${total - approved.length}/${total} hồ sơ chưa được phê duyệt — chưa đưa vào kết quả xếp loại của văn bản.`,
      );
    }
    warnings.push(
      ...doc.notes.filter((n) => n.includes('CHƯA ĐƯỢC XÁC NHẬN') || n.includes('DEMO')),
    );
    const blocks: DraftBlock[] = [
      { type: 'heading', text: 'I. TÌNH HÌNH CHUNG' },
      {
        type: 'paragraph',
        text: `Thực hiện việc đánh giá, xếp loại ${doc.filters[0]?.replace('Kỳ: ', 'kỳ ') ?? ''}, ${req.unitId ? scopeName : 'cơ quan'} có ${total} hồ sơ đánh giá trong phạm vi tổng hợp; đã phê duyệt kết quả ${approved.length} hồ sơ; còn ${total - approved.length} hồ sơ chưa hoàn thành quy trình.`,
      },
      { type: 'heading', text: 'II. KẾT QUẢ XẾP LOẠI (theo hồ sơ đã phê duyệt)' },
      { type: 'table', table: { ...ratingTable, title: undefined } },
      { type: 'heading', text: 'III. DANH SÁCH KẾT QUẢ' },
      {
        type: 'table',
        table: {
          columns: [
            { key: 'stt', header: 'STT', kind: 'integer' },
            { key: 'name', header: 'Họ và tên' },
            { key: 'position', header: 'Chức vụ' },
            { key: 'approved', header: 'Điểm', kind: 'number' },
            { key: 'rating', header: 'Xếp loại' },
          ],
          rows: approved.map((r, i) => ({ ...r, stt: i + 1 })),
        },
      },
      { type: 'heading', text: 'IV. NHẬN XÉT, ĐỀ XUẤT' },
      { type: 'paragraph', text: placeholder('conclusion') },
      { type: 'signature', title: 'NGƯỜI LẬP BÁO CÁO', name: null },
    ];
    return {
      ...(await header(auth)),
      templateCode: tpl.code,
      templateName: tpl.name,
      templateVersion: tpl.version,
      status: 'DỰ THẢO',
      title:
        `Báo cáo kết quả đánh giá, xếp loại cán bộ, công chức ${req.unitId ? scopeName : ''}`.trim(),
      subtitle: doc.filters[0] ?? null,
      blocks,
      missingFields: (['docNumber', 'placeDate', 'conclusion', 'signer'] as const).map((key) => ({
        key,
        label: MISSING[key],
      })),
      warnings,
    };
  }

  async function personalDraft(auth: AuthContext, req: DraftRequest): Promise<DraftDocument> {
    const tpl = DRAFT_TEMPLATES[1]!;
    const access = dataAccess(auth, 'report.read');
    const ev = await repo.evaluationWithCalculations(req.evaluationId!, access.evaluations);
    if (!ev) throw new AppError('NOT_FOUND', 'Không tìm thấy hồ sơ đánh giá');
    const pick = (kind: string) =>
      ev.calculations.filter((c) => c.kind === kind && c.revisionNo === ev.revisionNo).at(-1);
    const calc = ev.status === 'APPROVED' ? pick('APPROVAL') : (pick('REVIEW') ?? pick('SELF'));
    const warnings: string[] = [];
    if (ev.status !== 'APPROVED') {
      warnings.push(
        `Hồ sơ đang ở trạng thái "${EVALUATION_STATUS_LABELS[ev.status as EvaluationStatus]}" — kết quả chưa được phê duyệt.`,
      );
    }
    if (ev.ruleSetVersion.status !== 'CONFIRMED')
      warnings.push('Bộ quy tắc tính điểm chưa được xác nhận.');
    if (ev.isDemo) warnings.push('Hồ sơ DỮ LIỆU DEMO (tên giả).');
    const snap = (ev.assignmentSnapshot ?? {}) as {
      position?: { name?: string };
      unit?: { name?: string };
    };
    const result = calc?.result as unknown as ScoreResult | undefined;
    const scoreRows = (items: ItemScore[]) =>
      items
        .flatMap((i) => [i, ...(i.children ?? [])])
        .map((i) => ({
          code: i.code,
          name: i.name.length > 140 ? `${i.name.slice(0, 137)}...` : i.name,
          max: i.maxPoints,
          points: i.points,
        }));
    const scoreTable = (items: ItemScore[]): ReportTable => ({
      columns: [
        { key: 'code', header: 'Mã' },
        { key: 'name', header: 'Tiêu chí' },
        { key: 'max', header: 'Tối đa', kind: 'number' },
        { key: 'points', header: 'Điểm', kind: 'number' },
      ],
      rows: scoreRows(items),
    });
    const num = (v: { toNumber(): number } | null) => (v === null ? null : v.toNumber());
    const blocks: DraftBlock[] = [
      { type: 'heading', text: 'I. THÔNG TIN CÁN BỘ' },
      {
        type: 'paragraph',
        text: `Họ và tên: ${ev.subjectEmployee?.fullName ?? ''} — Mã cán bộ: ${ev.subjectEmployee?.employeeCode ?? ''}. Chức vụ: ${snap.position?.name ?? '—'}. Đơn vị: ${ev.unit.name}. Kỳ đánh giá: ${ev.period.name}.`,
      },
    ];
    if (result) {
      blocks.push(
        {
          type: 'heading',
          text: `II. TIÊU CHÍ CHUNG (${fmtNumber(result.general.score)}/${fmtNumber(result.general.max)} điểm)`,
        },
        { type: 'table', table: scoreTable(result.general.items) },
        {
          type: 'heading',
          text: `III. KẾT QUẢ THỰC HIỆN NHIỆM VỤ (${fmtNumber(result.result.score)}/${fmtNumber(result.result.max)} điểm)`,
        },
        { type: 'table', table: scoreTable(result.result.items) },
      );
    } else {
      warnings.push('Chưa có kết quả tính điểm được lưu (hồ sơ chưa nộp).');
    }
    blocks.push(
      { type: 'heading', text: 'IV. TỔNG HỢP ĐIỂM VÀ XẾP LOẠI' },
      {
        type: 'table',
        table: {
          columns: [
            { key: 'layer', header: 'Lớp điểm' },
            { key: 'total', header: 'Tổng điểm', kind: 'number' },
            { key: 'rating', header: 'Mức xếp loại' },
          ],
          rows: [
            { layer: 'Tự đánh giá', total: num(ev.selfTotal), rating: ev.selfRating ?? '' },
            { layer: 'Thẩm định', total: num(ev.reviewTotal), rating: ev.reviewRating ?? '' },
            {
              layer: 'Đã phê duyệt',
              total: ev.status === 'APPROVED' ? num(ev.approvedTotal) : null,
              rating: ev.status === 'APPROVED' ? (ev.approvedRating ?? '') : '',
            },
          ],
        },
      },
      { type: 'heading', text: 'V. NHẬN XÉT CỦA NGƯỜI CÓ THẨM QUYỀN' },
      { type: 'paragraph', text: placeholder('comment') },
      {
        type: 'signature',
        title: 'NGƯỜI ĐƯỢC ĐÁNH GIÁ',
        name: ev.subjectEmployee?.fullName ?? null,
      },
      { type: 'signature', title: 'NGƯỜI CÓ THẨM QUYỀN', name: null },
    );
    if (calc)
      warnings.push(
        `Số liệu lấy từ ảnh chụp ${calc.kind} lúc ${calc.createdAt.toISOString()} (checksum ${calc.checksum.slice(0, 12)}…).`,
      );
    return {
      ...(await header(auth)),
      templateCode: tpl.code,
      templateName: tpl.name,
      templateVersion: tpl.version,
      status: 'DỰ THẢO',
      title: 'Phiếu kết quả đánh giá, xếp loại cá nhân',
      subtitle: `${ev.period.name} — ${ev.subjectEmployee?.fullName ?? ''}`,
      blocks,
      missingFields: (['docNumber', 'placeDate', 'comment', 'signer'] as const).map((key) => ({
        key,
        label: MISSING[key],
      })),
      warnings,
    };
  }

  async function preview(auth: AuthContext, req: DraftRequest) {
    return req.templateCode === 'BC-KQDG' ? reportDraft(auth, req) : personalDraft(auth, req);
  }

  return {
    templates: () => DRAFT_TEMPLATES,

    async preview(auth: AuthContext, req: DraftRequest, actor: AuditActor) {
      const draft = await preview(auth, req);
      await writeAudit(db, actor, {
        action: 'draft.preview',
        entityType: 'draft',
        entityId: req.templateCode,
        changes: req,
      });
      return draft;
    },

    async pdf(auth: AuthContext, req: DraftRequest, actor: AuditActor) {
      const draft = await preview(auth, req);
      const buffer = await buildDraftPdf(draft);
      await writeAudit(db, actor, {
        action: 'draft.pdf',
        entityType: 'draft',
        entityId: req.templateCode,
        changes: req,
      });
      return {
        buffer,
        fileName: `DU-THAO-${safeFileName(`${draft.templateCode}-${draft.subtitle ?? ''}`)}.pdf`,
        contentType: 'application/pdf',
      };
    },
  };
}
