/**
 * Xuất PDF bằng pdfmake (chạy phía máy chủ) với font Roboto (đủ dấu tiếng Việt, giấy phép Apache 2.0).
 * Không cho tải tài nguyên từ URL; chỉ đọc file font trong thư mục của pdfmake.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import type * as PdfMake from 'pdfmake';
import type { Content, TableCell } from 'pdfmake';
import type { DraftDocument, ReportDocument, ReportTable } from '@kpi/shared';
import { fmtDateTimeVn, fmtNumber, fmtPercent } from './format.js';

const require = createRequire(import.meta.url);
const pdfmake = require('pdfmake') as typeof PdfMake;
type TDocumentDefinitions = Parameters<(typeof pdfmake)['createPdf']>[0];
const FONT_DIR = path.join(
  path.dirname(require.resolve('pdfmake/package.json')),
  'fonts',
  'Roboto',
);

pdfmake.setFonts({
  Roboto: {
    normal: path.join(FONT_DIR, 'Roboto-Regular.ttf'),
    bold: path.join(FONT_DIR, 'Roboto-Medium.ttf'),
    italics: path.join(FONT_DIR, 'Roboto-Italic.ttf'),
    bolditalics: path.join(FONT_DIR, 'Roboto-MediumItalic.ttf'),
  },
});
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy((p) =>
  path.resolve(p).toLowerCase().startsWith(FONT_DIR.toLowerCase()),
);

function cellText(table: ReportTable, key: string, v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v !== 'number') return String(v);
  const kind = table.columns.find((c) => c.key === key)?.kind;
  if (kind === 'percent') return fmtPercent(v);
  if (kind === 'integer') return fmtNumber(v, 0);
  return fmtNumber(v, 2);
}

function tableContent(table: ReportTable): Content[] {
  const header: TableCell[] = table.columns.map((c) => ({ text: c.header, style: 'th' }));
  const body: TableCell[][] = [header];
  const toRow = (row: Record<string, unknown>, bold = false): TableCell[] =>
    table.columns.map((c) => ({
      text: cellText(table, c.key, row[c.key]),
      alignment: c.kind && c.kind !== 'text' ? 'right' : 'left',
      bold,
    }));
  for (const row of table.rows) body.push(toRow(row));
  if (table.totals) body.push(toRow(table.totals, true));
  const out: Content[] = [];
  if (table.title) out.push({ text: table.title, style: 'h2' });
  out.push({
    table: {
      headerRows: 1,
      widths: table.columns.map((c) => (c.kind && c.kind !== 'text' ? 'auto' : '*')),
      body,
    },
    layout: {
      fillColor: (row: number) => (row === 0 ? '#DCE6F1' : null),
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
    },
    margin: [0, 2, 0, 10],
  });
  if (table.rows.length === 0)
    out.push({
      text: 'Không có dữ liệu trong phạm vi được phép xem.',
      italics: true,
      margin: [0, 0, 0, 8],
    });
  return out;
}

const STYLES: TDocumentDefinitions['styles'] = {
  title: { fontSize: 14, bold: true, alignment: 'center', margin: [0, 0, 0, 6] },
  h2: { fontSize: 11, bold: true, margin: [0, 8, 0, 4] },
  th: { bold: true, alignment: 'center' },
  meta: { fontSize: 8, color: '#555555' },
};

async function render(def: TDocumentDefinitions): Promise<Buffer> {
  return pdfmake.createPdf(def).getBuffer();
}

export function buildReportPdf(doc: ReportDocument, generatedAt: Date): Promise<Buffer> {
  const content: Content[] = [
    { text: doc.title.toUpperCase(), style: 'title' },
    ...doc.filters.map((f): Content => ({ text: f, alignment: 'center', italics: true })),
    {
      text: `Thời gian xuất: ${fmtDateTimeVn(generatedAt)} · Người xuất: ${doc.generatedBy} · Phạm vi dữ liệu: ${doc.scopeLabel}`,
      style: 'meta',
      alignment: 'center',
      margin: [0, 4, 0, 10],
    },
    ...tableContent(doc.main),
  ];
  if (doc.summary.length > 0) {
    content.push({ text: 'TỔNG HỢP', style: 'h2' });
    content.push({
      table: {
        widths: ['*', 'auto'],
        body: doc.summary.map((s): TableCell[] => [
          s.label,
          {
            text: typeof s.value === 'number' ? fmtNumber(s.value) : (s.value ?? ''),
            alignment: 'right',
            bold: true,
          },
        ]),
      },
      layout: 'lightHorizontalLines',
      margin: [0, 0, 0, 10],
    });
  }
  for (const t of doc.summaryTables) content.push(...tableContent(t));
  if (doc.notes.length > 0) {
    content.push({ text: 'Ghi chú', style: 'h2' });
    content.push({ ul: doc.notes, fontSize: 8, italics: true });
  }
  return render({
    info: { title: doc.title, creator: 'Hệ thống KPI/OKR' },
    pageSize: 'A4',
    pageOrientation: doc.orientation,
    pageMargins: [28, 32, 28, 36],
    defaultStyle: { font: 'Roboto', fontSize: 9 },
    styles: STYLES,
    content,
    footer: (current: number, total: number) => ({
      text: `Trang ${current}/${total} — trích xuất từ hệ thống KPI/OKR lúc ${fmtDateTimeVn(generatedAt)}`,
      alignment: 'center',
      fontSize: 7,
      color: '#777777',
    }),
  });
}

/** PDF văn bản dự thảo — luôn có chữ chìm "DỰ THẢO". */
export function buildDraftPdf(draft: DraftDocument): Promise<Buffer> {
  const missing = (v: string | null, label: string) => v ?? `[${label}]`;
  const content: Content[] = [
    {
      columns: [
        {
          width: '*',
          stack: [
            { text: draft.agencyParent.toUpperCase(), alignment: 'center' },
            { text: draft.agencyName.toUpperCase(), alignment: 'center', bold: true },
            {
              text: missing(draft.docNumber, 'Số văn bản'),
              alignment: 'center',
              margin: [0, 4, 0, 0],
            },
          ],
        },
        {
          width: '*',
          stack: [
            { text: 'ĐẢNG CỘNG SẢN VIỆT NAM', alignment: 'center', bold: true },
            {
              text: missing(draft.placeDate, 'Địa danh, ngày ... tháng ... năm ...'),
              alignment: 'center',
              italics: true,
              margin: [0, 10, 0, 0],
            },
          ],
        },
      ],
      margin: [0, 0, 0, 16],
    },
    { text: draft.title.toUpperCase(), style: 'title' },
  ];
  if (draft.subtitle)
    content.push({
      text: draft.subtitle,
      alignment: 'center',
      italics: true,
      margin: [0, 0, 0, 10],
    });
  for (const b of draft.blocks) {
    if (b.type === 'heading') content.push({ text: b.text, style: 'h2' });
    else if (b.type === 'paragraph')
      content.push({ text: b.text, alignment: 'justify', margin: [0, 0, 0, 6] });
    else if (b.type === 'table') content.push(...tableContent(b.table));
    else
      content.push({
        columns: [
          { width: '*', text: '' },
          {
            width: 220,
            stack: [
              { text: b.title, bold: true, alignment: 'center' },
              {
                text: '(Ký, ghi rõ họ tên)',
                italics: true,
                alignment: 'center',
                fontSize: 8,
                margin: [0, 0, 0, 40],
              },
              { text: b.name ?? '[Người ký]', bold: true, alignment: 'center' },
            ],
          },
        ],
        margin: [0, 16, 0, 0],
      });
  }
  return render({
    info: { title: `DỰ THẢO — ${draft.title}`, creator: 'Hệ thống KPI/OKR' },
    pageSize: 'A4',
    pageMargins: [56, 40, 40, 40],
    defaultStyle: { font: 'Roboto', fontSize: 10 },
    styles: STYLES,
    watermark: { text: 'DỰ THẢO', opacity: 0.12, bold: true, fontSize: 90, angle: -40 },
    content,
    footer: (current: number, total: number) => ({
      text: `DỰ THẢO — mẫu ${draft.templateCode} (${draft.templateVersion}) — sinh tự động lúc ${fmtDateTimeVn(new Date(draft.generatedAt))} — Trang ${current}/${total}`,
      alignment: 'center',
      fontSize: 7,
      color: '#777777',
    }),
  });
}
