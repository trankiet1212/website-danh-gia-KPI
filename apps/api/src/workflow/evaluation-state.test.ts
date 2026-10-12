import { describe, expect, it } from 'vitest';
import { EVALUATION_STATUSES, type EvaluationStatus } from '@kpi/shared';
import {
  EVALUATION_ACTIONS,
  canTransition,
  isLocked,
  nextStatus,
  periodAllows,
} from './evaluation-state.js';

describe('Máy trạng thái hồ sơ đánh giá', () => {
  it('luồng chuẩn: tự đánh giá → nộp → thẩm định → phê duyệt', () => {
    let s: EvaluationStatus = 'DRAFT';
    for (const action of [
      'saveSelf',
      'submit',
      'saveReview',
      'completeReview',
      'approve',
    ] as const) {
      const next = nextStatus(s, action);
      expect(next, `${s} --${action}-->`).not.toBeNull();
      s = next!;
    }
    expect(s).toBe('APPROVED');
  });

  it('trả lại → cán bộ sửa và nộp lại', () => {
    expect(nextStatus('UNDER_REVIEW', 'return')).toBe('RETURNED');
    expect(nextStatus('REVIEWED', 'return')).toBe('RETURNED');
    expect(nextStatus('RETURNED', 'saveSelf')).toBe('DRAFT');
    expect(nextStatus('RETURNED', 'submit')).toBe('SUBMITTED');
  });

  it('ĐÃ PHÊ DUYỆT: mọi thao tác sửa đều bị chặn, chỉ được mở lại', () => {
    expect(isLocked('APPROVED')).toBe(true);
    for (const action of EVALUATION_ACTIONS.filter((a) => a !== 'reopen')) {
      expect(canTransition('APPROVED', action), action).toBe(false);
    }
    expect(nextStatus('APPROVED', 'reopen')).toBe('REOPENED');
  });

  it('mở lại → phải thẩm định lại trước khi phê duyệt lại (không phê duyệt thẳng)', () => {
    expect(canTransition('REOPENED', 'approve')).toBe(false);
    expect(nextStatus('REOPENED', 'completeReview')).toBe('REVIEWED');
  });

  it('không phê duyệt khi chưa thẩm định; không nộp lại khi đang thẩm định', () => {
    expect(canTransition('SUBMITTED', 'approve')).toBe(false);
    expect(canTransition('DRAFT', 'approve')).toBe(false);
    expect(canTransition('UNDER_REVIEW', 'submit')).toBe(false);
    expect(canTransition('REVIEWED', 'saveSelf')).toBe(false);
  });

  it('hồ sơ đã hủy không có thao tác nào', () => {
    for (const action of EVALUATION_ACTIONS) expect(canTransition('CANCELLED', action)).toBe(false);
  });

  it('mọi trạng thái đều được khai báo', () => {
    expect(EVALUATION_STATUSES).toHaveLength(8);
  });
});

describe('Ràng buộc theo trạng thái kỳ (docs/06 §5.4)', () => {
  it('kỳ đang chuẩn bị (PLANNING): chưa được chấm, nộp, thẩm định, phê duyệt hay mở lại', () => {
    for (const action of EVALUATION_ACTIONS)
      expect(periodAllows('PLANNING', action, 'DRAFT')).toBe(false);
  });

  it('tự đánh giá/nộp khi kỳ mở hoặc đang tự đánh giá', () => {
    expect(periodAllows('OPEN', 'submit', 'DRAFT')).toBe(true);
    expect(periodAllows('SELF_ASSESSMENT', 'saveSelf', 'DRAFT')).toBe(true);
    expect(periodAllows('REVIEW', 'submit', 'DRAFT')).toBe(false);
  });

  it('giai đoạn thẩm định: chỉ hồ sơ bị trả lại được nộp lại', () => {
    expect(periodAllows('REVIEW', 'submit', 'RETURNED')).toBe(true);
    expect(periodAllows('REVIEW', 'saveSelf', 'RETURNED')).toBe(true);
    expect(periodAllows('REVIEW', 'approve', 'REVIEWED')).toBe(true);
  });

  it('kỳ đã đóng: chỉ còn mở lại (có quyền + lý do)', () => {
    expect(periodAllows('CLOSED', 'approve', 'REVIEWED')).toBe(false);
    expect(periodAllows('CLOSED', 'saveReview', 'SUBMITTED')).toBe(false);
    expect(periodAllows('CLOSED', 'reopen', 'APPROVED')).toBe(true);
  });
});
