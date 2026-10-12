/**
 * Mô hình báo cáo, dự thảo văn bản và dashboard (GĐ6).
 * Cùng một mô hình `ReportDocument` dùng để xem trên giao diện, in, xuất Excel và PDF —
 * bảo đảm dữ liệu xuất ra trùng khớp dữ liệu được xem.
 */
import type { EvaluationStatus } from './kpi-types.js';

export type ReportCell = string | number | null;

export interface ReportColumn {
  key: string;
  header: string;
  /** Độ rộng gợi ý (ký tự) cho Excel. */
  width?: number;
  kind?: 'text' | 'number' | 'integer' | 'percent';
}

export interface ReportTable {
  title?: string;
  columns: ReportColumn[];
  rows: Record<string, ReportCell>[];
  /** Dòng tổng cộng (in đậm). */
  totals?: Record<string, ReportCell>;
}

export const REPORT_KINDS = ['individual', 'unit', 'agency', 'aggregate'] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export interface ReportDocument {
  kind: ReportKind;
  title: string;
  /** Mô tả bộ lọc đã áp dụng (kỳ, đơn vị, cán bộ...). */
  filters: string[];
  generatedAt: string;
  generatedBy: string;
  /** Mô tả phạm vi dữ liệu người xem được phép truy cập. */
  scopeLabel: string;
  main: ReportTable;
  summary: { label: string; value: ReportCell }[];
  summaryTables: ReportTable[];
  notes: string[];
  orientation: 'portrait' | 'landscape';
}

// ------------------------------------------------------------------ Dự thảo văn bản
export type DraftBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'table'; table: ReportTable }
  | { type: 'signature'; title: string; name: string | null };

export interface DraftTemplateDto {
  code: string;
  name: string;
  version: string;
  /** Tham số cần chọn khi tạo dự thảo. */
  params: ('periodId' | 'unitId' | 'evaluationId')[];
  description: string;
  provisional: boolean;
}

export interface DraftDocument {
  templateCode: string;
  templateName: string;
  templateVersion: string;
  /** Văn bản sinh từ hệ thống luôn là DỰ THẢO cho tới khi được duyệt (CLAUDE.md). */
  status: 'DỰ THẢO';
  agencyParent: string;
  agencyName: string;
  docNumber: string | null;
  placeDate: string | null;
  title: string;
  subtitle: string | null;
  blocks: DraftBlock[];
  missingFields: { key: string; label: string }[];
  warnings: string[];
  generatedAt: string;
  generatedBy: string;
}

// ------------------------------------------------------------------ Dashboard
export interface DashboardSummary {
  scopeLabel: string;
  period: { id: string; code: string; name: string; isRated: boolean; status: string } | null;
  counts: { employees: number; units: number; evaluations: number };
  byStatus: { status: EvaluationStatus; count: number }[];
  progress: {
    notCreated: number | null;
    draft: number;
    submitted: number;
    reviewed: number;
    approved: number;
  };
  averages: { self: number | null; review: number | null; approved: number | null };
  /** Phân bố xếp loại — CHỈ tính hồ sơ đã phê duyệt. */
  ratings: { code: string; label: string; count: number }[];
  units: {
    unitId: string;
    unitName: string;
    evaluations: number;
    approved: number;
    averageApproved: number | null;
  }[];
  missing: {
    employeeId: string;
    employeeCode: string;
    fullName: string;
    unitName: string | null;
  }[];
  pending: {
    id: string;
    employee: string;
    period: string;
    status: EvaluationStatus;
    action: 'self' | 'review' | 'approve';
  }[];
  okr: { objectives: number; keyResults: number; averageProgress: number | null };
}
