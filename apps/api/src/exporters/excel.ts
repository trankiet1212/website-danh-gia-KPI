/**
 * Xuất báo cáo ra Excel (.xlsx) có định dạng: tiêu đề, bộ lọc, thời gian xuất, người xuất, phạm vi dữ liệu,
 * bảng dữ liệu (đóng khung, cố định dòng tiêu đề, lọc), phần tổng hợp và ghi chú; sheet "Tổng hợp" cho các bảng phụ.
 */
import ExcelJS from 'exceljs';
import type { ReportColumn, ReportDocument, ReportTable } from '@kpi/shared';
import { fmtDateTimeVn, safeText } from './format.js';

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFDCE6F1' },
};
const BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' },
};

const NUM_FMT: Record<NonNullable<ReportColumn['kind']>, string | undefined> = {
  text: undefined,
  number: '#,##0.0##',
  integer: '#,##0',
  percent: '0.0%',
};

function cellValue(v: unknown): ExcelJS.CellValue {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  return safeText(String(v));
}

/** Ghi một bảng bắt đầu tại dòng `start`; trả về dòng tiêu đề và dòng cuối. */
function writeTable(ws: ExcelJS.Worksheet, table: ReportTable, start: number) {
  let r = start;
  if (table.title) {
    ws.getCell(r, 1).value = table.title;
    ws.getCell(r, 1).font = { bold: true, size: 11 };
    r++;
  }
  const headerRow = r;
  table.columns.forEach((c, i) => {
    const cell = ws.getCell(r, i + 1);
    cell.value = c.header;
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
    cell.border = BORDER;
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  for (const row of table.rows) {
    r++;
    table.columns.forEach((c, i) => {
      const cell = ws.getCell(r, i + 1);
      cell.value = cellValue(row[c.key]);
      cell.border = BORDER;
      cell.alignment = { vertical: 'top', wrapText: c.kind === undefined || c.kind === 'text' };
      const fmt = NUM_FMT[c.kind ?? 'text'];
      if (fmt && typeof row[c.key] === 'number') cell.numFmt = fmt;
    });
  }
  if (table.totals) {
    r++;
    table.columns.forEach((c, i) => {
      const cell = ws.getCell(r, i + 1);
      cell.value = cellValue(table.totals?.[c.key]);
      cell.font = { bold: true };
      cell.border = BORDER;
      const fmt = NUM_FMT[c.kind ?? 'text'];
      if (fmt && typeof table.totals?.[c.key] === 'number') cell.numFmt = fmt;
    });
  }
  return { headerRow, lastRow: r };
}

export async function buildWorkbook(doc: ReportDocument, generatedAt: Date): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Hệ thống quản lý và đánh giá KPI/OKR';
  wb.created = generatedAt;
  wb.title = doc.title;

  const cols = doc.main.columns;
  const ws = wb.addWorksheet('Báo cáo', {
    pageSetup: {
      paperSize: 9,
      orientation: doc.orientation,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
    headerFooter: { oddFooter: '&LXuất từ hệ thống KPI/OKR&RTrang &P/&N' },
  });
  ws.columns = cols.map((c) => ({
    key: c.key,
    width: c.width ?? (c.kind && c.kind !== 'text' ? 12 : 24),
  }));
  const width = Math.max(cols.length, 2);

  let r = 1;
  ws.mergeCells(r, 1, r, width);
  ws.getCell(r, 1).value = doc.title.toUpperCase();
  ws.getCell(r, 1).font = { bold: true, size: 14 };
  ws.getCell(r, 1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  ws.getRow(r).height = 30;
  for (const line of doc.filters) {
    r++;
    ws.mergeCells(r, 1, r, width);
    ws.getCell(r, 1).value = safeText(line);
    ws.getCell(r, 1).alignment = { horizontal: 'center' };
    ws.getCell(r, 1).font = { italic: true };
  }
  for (const line of [
    `Thời gian xuất: ${fmtDateTimeVn(generatedAt)} (giờ Việt Nam)`,
    `Người xuất: ${doc.generatedBy}`,
    `Phạm vi dữ liệu: ${doc.scopeLabel}`,
  ]) {
    r++;
    ws.mergeCells(r, 1, r, width);
    ws.getCell(r, 1).value = safeText(line);
    ws.getCell(r, 1).font = { size: 9, color: { argb: 'FF555555' } };
  }
  r += 2;

  const { headerRow, lastRow } = writeTable(ws, doc.main, r);
  ws.views = [{ state: 'frozen', ySplit: headerRow }];
  if (doc.main.rows.length > 0) {
    ws.autoFilter = {
      from: { row: headerRow, column: 1 },
      to: { row: headerRow + doc.main.rows.length, column: cols.length },
    };
  }
  ws.pageSetup.printTitlesRow = `${headerRow}:${headerRow}`;
  r = lastRow + 2;

  if (doc.summary.length > 0) {
    ws.getCell(r, 1).value = 'TỔNG HỢP';
    ws.getCell(r, 1).font = { bold: true };
    for (const s of doc.summary) {
      r++;
      ws.getCell(r, 1).value = safeText(s.label);
      ws.getCell(r, 2).value = cellValue(s.value);
      ws.getCell(r, 2).font = { bold: true };
      ws.getCell(r, 2).alignment = { horizontal: 'right' };
    }
    r += 2;
  }
  if (doc.notes.length > 0) {
    ws.getCell(r, 1).value = 'Ghi chú:';
    ws.getCell(r, 1).font = { bold: true, italic: true };
    for (const n of doc.notes) {
      r++;
      ws.mergeCells(r, 1, r, width);
      ws.getCell(r, 1).value = safeText(`- ${n}`);
      ws.getCell(r, 1).alignment = { wrapText: true };
      ws.getCell(r, 1).font = { italic: true, size: 9 };
    }
  }

  if (doc.summaryTables.length > 0) {
    const ws2 = wb.addWorksheet('Tổng hợp', {
      pageSetup: { paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    ws2.getCell(1, 1).value = `${doc.title} — TỔNG HỢP`;
    ws2.getCell(1, 1).font = { bold: true, size: 12 };
    let row = 3;
    const maxCols = Math.max(...doc.summaryTables.map((t) => t.columns.length));
    for (let i = 1; i <= maxCols; i++) ws2.getColumn(i).width = i === 1 ? 32 : 14;
    for (const t of doc.summaryTables) {
      row = writeTable(ws2, t, row).lastRow + 2;
    }
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
