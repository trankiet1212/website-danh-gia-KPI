/**
 * Sổ giao việc hằng ngày (docs/06 §5.7): cấp trên giao việc theo ngày, cán bộ báo cáo, cấp trên đánh giá.
 * Chỉ theo dõi — không quy đổi thành điểm (docs/09 #35).
 */
import { z } from 'zod';
import { dateOnly, optionalText, requiredText, uuid, versionField } from './common.js';

export const DAILY_REPORT_STATUSES = ['PENDING', 'DONE', 'NOT_DONE'] as const;
export type DailyReportStatus = (typeof DAILY_REPORT_STATUSES)[number];
export const DAILY_TASK_RESULTS = ['COMPLETED', 'NOT_COMPLETED'] as const;
export type DailyTaskResult = (typeof DAILY_TASK_RESULTS)[number];
export const DAILY_TASK_QUALITIES = ['MEETS', 'REWORK'] as const;
export type DailyTaskQuality = (typeof DAILY_TASK_QUALITIES)[number];
export const DAILY_TASK_TIMELINESS = ['ON_TIME', 'LATE'] as const;
export type DailyTaskTimeliness = (typeof DAILY_TASK_TIMELINESS)[number];

export const DAILY_REPORT_STATUS_LABELS: Record<DailyReportStatus, string> = {
  PENDING: 'Chưa báo cáo',
  DONE: 'Đã xong',
  NOT_DONE: 'Chưa xong',
};
export const DAILY_TASK_RESULT_LABELS: Record<DailyTaskResult, string> = {
  COMPLETED: 'Hoàn thành',
  NOT_COMPLETED: 'Chưa hoàn thành',
};
export const DAILY_TASK_QUALITY_LABELS: Record<DailyTaskQuality, string> = {
  MEETS: 'Đạt yêu cầu',
  REWORK: 'Phải làm lại',
};
export const DAILY_TASK_TIMELINESS_LABELS: Record<DailyTaskTimeliness, string> = {
  ON_TIME: 'Đúng hạn',
  LATE: 'Chậm',
};

/** Khoảng ngày tối đa của một lần xem (một tháng dài + vài ngày đệm). */
export const DAILY_TASK_MAX_RANGE_DAYS = 62;

export const dailyTaskListQuerySchema = z
  .object({
    from: dateOnly,
    to: dateOnly,
    employeeId: uuid.optional(),
  })
  .refine((q) => q.from <= q.to, { message: 'Ngày bắt đầu phải trước ngày kết thúc', path: ['to'] })
  .refine(
    (q) =>
      (Date.parse(`${q.to}T00:00:00Z`) - Date.parse(`${q.from}T00:00:00Z`)) / 86_400_000 <
      DAILY_TASK_MAX_RANGE_DAYS,
    { message: `Chỉ xem tối đa ${DAILY_TASK_MAX_RANGE_DAYS} ngày mỗi lần`, path: ['to'] },
  );
export type DailyTaskListQuery = z.infer<typeof dailyTaskListQuerySchema>;

export const createDailyTaskSchema = z.object({
  employeeIds: z
    .array(uuid)
    .min(1, 'Chọn ít nhất một cán bộ')
    .max(50, 'Giao tối đa 50 cán bộ mỗi lần'),
  workDate: dateOnly,
  title: requiredText('Nội dung công việc', 500),
  description: optionalText('Yêu cầu, sản phẩm', 4000),
});
export type CreateDailyTaskInput = z.infer<typeof createDailyTaskSchema>;

export const updateDailyTaskSchema = z.object({
  workDate: dateOnly,
  title: requiredText('Nội dung công việc', 500),
  description: optionalText('Yêu cầu, sản phẩm', 4000),
  version: versionField,
});
export type UpdateDailyTaskInput = z.infer<typeof updateDailyTaskSchema>;

export const dailyTaskVersionQuerySchema = z.object({ version: versionField });

export const reportDailyTaskSchema = z.object({
  status: z.enum(['DONE', 'NOT_DONE'], { error: 'Chọn kết quả: đã xong hoặc chưa xong' }),
  note: optionalText('Báo cáo', 4000),
  version: versionField,
});
export type ReportDailyTaskInput = z.infer<typeof reportDailyTaskSchema>;

export const evaluateDailyTaskSchema = z
  .object({
    result: z.enum(DAILY_TASK_RESULTS, { error: 'Chọn kết quả đánh giá' }),
    quality: z.enum(DAILY_TASK_QUALITIES).nullish(),
    timeliness: z.enum(DAILY_TASK_TIMELINESS).nullish(),
    comment: optionalText('Nhận xét', 4000),
    version: versionField,
  })
  .superRefine((v, ctx) => {
    if (v.result === 'COMPLETED') {
      if (!v.quality)
        ctx.addIssue({ code: 'custom', path: ['quality'], message: 'Chọn chất lượng' });
      if (!v.timeliness)
        ctx.addIssue({ code: 'custom', path: ['timeliness'], message: 'Chọn tiến độ' });
    }
  })
  // Chưa hoàn thành: không đánh giá chất lượng, tiến độ
  .transform((v) => (v.result === 'COMPLETED' ? v : { ...v, quality: null, timeliness: null }));
export type EvaluateDailyTaskInput = z.infer<typeof evaluateDailyTaskSchema>;

export interface DailyTaskDto {
  id: string;
  workDate: string;
  title: string;
  description: string | null;
  employee: { id: string; employeeCode: string; fullName: string };
  unitName: string;
  reportStatus: DailyReportStatus;
  reportNote: string | null;
  reportedAt: string | null;
  result: DailyTaskResult | null;
  quality: DailyTaskQuality | null;
  timeliness: DailyTaskTimeliness | null;
  evalComment: string | null;
  evaluatedBy: string | null;
  evaluatedAt: string | null;
  assignedBy: string | null;
  createdAt: string;
  version: number;
  can: { edit: boolean; delete: boolean; report: boolean; evaluate: boolean };
}

export interface DailyAssigneeDto {
  id: string;
  employeeCode: string;
  fullName: string;
  unitName: string | null;
  positionName: string | null;
}
