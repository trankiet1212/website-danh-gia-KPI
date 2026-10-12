/**
 * Máy trạng thái hồ sơ đánh giá (docs/06-quy-trinh-trang-thai.md §5.1) — hàm thuần, không truy cập DB.
 *
 *   DRAFT ──submit──▶ SUBMITTED ──review──▶ UNDER_REVIEW ──completeReview──▶ REVIEWED ──approve──▶ APPROVED
 *     ▲                 │  ▲                     │                               │                     │
 *     └──(sửa lại)── RETURNED ◀──────return──────┴───────────────return──────────┘                  reopen
 *                                                                                                    ▼
 *                                         REOPENED ──review/completeReview──▶ REVIEWED ──approve──▶ APPROVED
 */
import type { EvaluationStatus, PeriodStatus } from '@kpi/shared';

export const EVALUATION_ACTIONS = [
  'saveSelf',
  'submit',
  'saveReview',
  'completeReview',
  'return',
  'approve',
  'reopen',
] as const;
export type EvaluationAction = (typeof EVALUATION_ACTIONS)[number];

const TRANSITIONS: Record<
  EvaluationAction,
  { from: readonly EvaluationStatus[]; to: EvaluationStatus | 'SAME' }
> = {
  saveSelf: { from: ['DRAFT', 'RETURNED'], to: 'DRAFT' },
  submit: { from: ['DRAFT', 'RETURNED'], to: 'SUBMITTED' },
  saveReview: { from: ['SUBMITTED', 'UNDER_REVIEW', 'REOPENED'], to: 'UNDER_REVIEW' },
  completeReview: { from: ['SUBMITTED', 'UNDER_REVIEW', 'REOPENED'], to: 'REVIEWED' },
  return: { from: ['SUBMITTED', 'UNDER_REVIEW', 'REVIEWED'], to: 'RETURNED' },
  approve: { from: ['REVIEWED'], to: 'APPROVED' },
  reopen: { from: ['APPROVED'], to: 'REOPENED' },
};

export const ACTION_LABELS: Record<EvaluationAction, string> = {
  saveSelf: 'Lưu tự đánh giá',
  submit: 'Nộp tự đánh giá',
  saveReview: 'Lưu thẩm định',
  completeReview: 'Hoàn tất thẩm định',
  return: 'Trả lại',
  approve: 'Phê duyệt',
  reopen: 'Mở lại kết quả đã duyệt',
};

export function canTransition(from: EvaluationStatus, action: EvaluationAction): boolean {
  return TRANSITIONS[action].from.includes(from);
}

/** Trạng thái đích; null nếu chuyển trạng thái không hợp lệ. */
export function nextStatus(
  from: EvaluationStatus,
  action: EvaluationAction,
): EvaluationStatus | null {
  if (!canTransition(from, action)) return null;
  const to = TRANSITIONS[action].to;
  return to === 'SAME' ? from : to;
}

/** Hồ sơ đã khóa (chỉ được mở lại). */
export const isLocked = (status: EvaluationStatus) => status === 'APPROVED';

const PERIOD_STATUSES_FOR: Record<EvaluationAction, readonly PeriodStatus[]> = {
  saveSelf: ['OPEN', 'SELF_ASSESSMENT'],
  submit: ['OPEN', 'SELF_ASSESSMENT'],
  saveReview: ['OPEN', 'SELF_ASSESSMENT', 'REVIEW'],
  completeReview: ['OPEN', 'SELF_ASSESSMENT', 'REVIEW'],
  return: ['OPEN', 'SELF_ASSESSMENT', 'REVIEW'],
  approve: ['OPEN', 'SELF_ASSESSMENT', 'REVIEW'],
  reopen: ['OPEN', 'SELF_ASSESSMENT', 'REVIEW', 'CLOSED'],
};

/**
 * Thao tác có được phép theo trạng thái kỳ không (docs/06 §5.4).
 * Hồ sơ bị trả lại được tự đánh giá/nộp lại cả khi kỳ đã sang giai đoạn REVIEW.
 */
export function periodAllows(
  period: PeriodStatus,
  action: EvaluationAction,
  record: EvaluationStatus,
): boolean {
  if (
    (action === 'saveSelf' || action === 'submit') &&
    period === 'REVIEW' &&
    record === 'RETURNED'
  )
    return true;
  return PERIOD_STATUSES_FOR[action].includes(period);
}
