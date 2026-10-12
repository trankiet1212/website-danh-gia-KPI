/** Tham số truy vấn dashboard, báo cáo, xuất file, dự thảo (GĐ6). */
import { z } from 'zod';
import { EVALUATION_STATUSES } from '../kpi-types.js';
import { uuid } from './common.js';

const optionalId = uuid.optional().or(z.literal('').transform(() => undefined));

export const dashboardQuerySchema = z.object({
  periodId: optionalId,
  unitId: optionalId,
  employeeId: optionalId,
  status: z
    .enum(EVALUATION_STATUSES)
    .optional()
    .or(z.literal('').transform(() => undefined)),
});
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

export const individualReportQuerySchema = z.object({
  employeeId: uuid,
  year: z.coerce.number().int().min(2000).max(9999),
});
export const unitReportQuerySchema = z.object({ periodId: uuid, unitId: uuid });
export const agencyReportQuerySchema = z.object({ periodId: uuid });
export const aggregateReportQuerySchema = z.object({ periodId: uuid, unitId: optionalId });
export const exportFormatSchema = z.object({
  format: z.enum(['xlsx', 'pdf'], { error: 'Định dạng xuất phải là xlsx hoặc pdf' }),
});
export type ExportFormat = z.infer<typeof exportFormatSchema>['format'];

export const DRAFT_TEMPLATE_CODES = ['BC-KQDG', 'PHIEU-KQDG'] as const;
export const draftRequestSchema = z
  .object({
    templateCode: z.enum(DRAFT_TEMPLATE_CODES, { error: 'Mẫu dự thảo không hợp lệ' }),
    periodId: optionalId,
    unitId: optionalId,
    evaluationId: optionalId,
  })
  .superRefine((v, ctx) => {
    if (v.templateCode === 'BC-KQDG' && !v.periodId) {
      ctx.addIssue({ code: 'custom', path: ['periodId'], message: 'Chọn kỳ đánh giá' });
    }
    if (v.templateCode === 'PHIEU-KQDG' && !v.evaluationId) {
      ctx.addIssue({ code: 'custom', path: ['evaluationId'], message: 'Chọn hồ sơ đánh giá' });
    }
  });
export type DraftRequest = z.infer<typeof draftRequestSchema>;
