import { describe, expect, it } from 'vitest';
import type { CompositeRow } from '@kpi/shared';
import { HD05_EXAMPLE_D } from './demo-data.js';
import { calculateScore } from './engine.js';
import { suggestRating } from './rating.js';
import { allPass, basicCriteria, cloneRule, engineInput } from '../../tests/helpers/scoring.js';

const rule = cloneRule();
const perfect = { completionRate: 1, exceededShare: 0.5, lateShare: 0, failedShare: 0 };

describe('Đề xuất xếp loại theo cấu hình', () => {
  it('đủ điểm và đủ điều kiện → mức theo khoảng điểm', () => {
    expect(suggestRating(92, perfect, [], rule, 'STAFF', true).eligible).toBe('HTXS');
    expect(suggestRating(89.9, perfect, [], rule, 'STAFF', true).eligible).toBe('HTTNV');
    expect(suggestRating(70, perfect, [], rule, 'STAFF', true).eligible).toBe('HTTNV');
    expect(suggestRating(49.9, perfect, [], rule, 'STAFF', true).eligible).toBe('KHTNV');
  });

  it('đủ điểm HTXS nhưng chưa đủ 30% vượt mức → hạ xuống HTTNV, có giải thích', () => {
    const r = suggestRating(95, { ...perfect, exceededShare: 0.1 }, [], rule, 'STAFF', true);
    expect(r.eligible).toBe('HTTNV');
    expect(r.steps.join('\n')).toContain('Tỷ lệ nhiệm vụ vượt mức yêu cầu >= 30%');
  });

  it('có nhiệm vụ chậm 10% → không đạt HTXS, HTTNV; đạt HTNV (≤ 20%)', () => {
    expect(
      suggestRating(95, { ...perfect, lateShare: 0.1 }, [], rule, 'STAFF', true).eligible,
    ).toBe('HTNV');
  });

  it('không đáp ứng điều kiện của mức nào → null, cấp có thẩm quyền quyết định', () => {
    const r = suggestRating(75, { ...perfect, completionRate: 0.8 }, [], rule, 'STAFF', true);
    expect(r.eligible).toBeNull();
    expect(r.steps.at(-1)).toContain('cấp có thẩm quyền');
  });

  it('cờ vi phạm (kỷ luật) → buộc "Không hoàn thành nhiệm vụ" dù điểm cao', () => {
    expect(suggestRating(98, perfect, ['DISCIPLINE'], rule, 'STAFF', true).eligible).toBe('KHTNV');
  });

  it('cờ "chưa khắc phục hạn chế" chặn HTXS', () => {
    expect(
      suggestRating(95, perfect, ['UNRESOLVED_SHORTCOMINGS'], rule, 'STAFF', true).eligible,
    ).toBe('HTTNV');
  });

  it('thiếu chỉ số (không có dữ liệu nhiệm vụ) → không xác định được điều kiện', () => {
    const r = suggestRating(95, {}, [], rule, 'STAFF', true);
    expect(r.eligible).toBeNull();
    expect(r.steps.join('\n')).toContain('thiếu dữ liệu');
  });

  it('bộ quy tắc chưa xác nhận → kết quả gắn nhãn tạm', () => {
    const r = suggestRating(92, perfect, [], rule, 'STAFF', false);
    expect(r.provisional).toBe(true);
    expect(r.steps[0]).toContain('CHƯA được xác nhận');
  });

  it('ngưỡng điểm do cấu hình quyết định (không viết cứng)', () => {
    const custom = cloneRule((c) => {
      c.rating.bands = [
        { code: 'TOT', label: 'Tốt', min: 60, maxExclusive: null, assignOnlyWithinRange: false },
        {
          code: 'CHUA',
          label: 'Chưa tốt',
          min: null,
          maxExclusive: 60,
          assignOnlyWithinRange: false,
        },
      ];
      c.rating.conditions = [];
      c.rating.forced = [];
    });
    expect(suggestRating(61, {}, [], custom, 'STAFF', true).eligible).toBe('TOT');
    expect(suggestRating(59, {}, [], custom, 'STAFF', true).eligible).toBe('CHUA');
  });
});

describe('Xếp loại từ kết quả engine (ví dụ [HD05])', () => {
  it('ví dụ HD05: 83,6 điểm nhưng chỉ 4/6 nhiệm vụ hoàn thành → không đủ điều kiện mức nào', () => {
    const r = calculateScore(
      engineInput({
        inputs: {
          ...allPass,
          ax1: {
            rows: [
              {
                label: 'X',
                coefficient: 1,
                plannedQty: 2,
                completedQty: 1,
                reworkQty: 0,
                reworkCount: 0,
                lateQty: 0,
                lateCount: 0,
                exemptCount: 0,
                exceeded: false,
              } as CompositeRow,
            ],
            dScores: HD05_EXAMPLE_D,
          },
        },
      }),
    );
    expect(r.rating.eligible).toBeNull();
  });

  it('hoàn thành đủ, đúng hạn, 50% vượt mức, 95 điểm → HTXS', () => {
    const rows: CompositeRow[] = [
      {
        label: 'A',
        coefficient: 1,
        plannedQty: 2,
        completedQty: 2,
        reworkQty: 0,
        reworkCount: 0,
        lateQty: 0,
        lateCount: 0,
        exemptCount: 0,
        exceeded: true,
      },
      {
        label: 'B',
        coefficient: 2,
        plannedQty: 1,
        completedQty: 1,
        reworkQty: 0,
        reworkCount: 0,
        lateQty: 0,
        lateCount: 0,
        exemptCount: 0,
        exceeded: false,
      },
    ];
    const r = calculateScore(
      engineInput({
        profile: 'STAFF',
        ratingSubject: 'STAFF',
        items: basicCriteria(),
        inputs: { ...allPass, ax1: { rows } },
      }),
    );
    expect(r.totalRounded).toBe(100);
    expect(r.rating.eligible).toBe('HTXS');
    expect(r.rating.provisional).toBe(true); // rating.conditions đang là giá trị chờ xác nhận
  });
});
