/**
 * Kiểm tra công thức bằng BỘ DỮ LIỆU MẪU có kết quả kỳ vọng tính tay (QA GĐ7).
 * Cấu hình: bộ quy tắc DEMO (QĐ39 + HD05): trừ 25%/lần, mẫu số B/C = kế hoạch, làm tròn 1 chữ số HALF_UP.
 * Bộ tiêu chí: 3 tiêu chí chung (18 + 4 + 8 = 30 điểm) + 1 trục 70 điểm.
 * Mỗi dòng ghi cách tính để người đọc đối chiếu được bằng tay.
 */
import { describe, expect, it } from 'vitest';
import type { CompositeRow, ItemInput, KpiProfile } from '@kpi/shared';
import {
  allPass,
  basicCriteria,
  cloneRule,
  engineInput,
  item,
} from '../../tests/helpers/scoring.js';
import { calculateScore } from './engine.js';

const row = (p: Partial<CompositeRow>): CompositeRow => ({
  label: 'Nhiệm vụ',
  catalogItemCode: null,
  coefficient: 1,
  plannedQty: 1,
  completedQty: 1,
  reworkQty: 0,
  reworkCount: 0,
  lateQty: 0,
  lateCount: 0,
  exemptCount: 0,
  exemptNote: null,
  exceeded: false,
  ...p,
});
const FULL_D = { D1: 1, D2: 1, D3: 1 };

interface Dataset {
  name: string;
  profile: KpiProfile;
  inputs: Record<string, ItemInput>;
  flags?: string[];
  expect: { total: number; kpi?: number; rating: string | null; complete?: boolean };
  /** Cách tính bằng tay. */
  how: string;
}

const DATASETS: Dataset[] = [
  {
    name: 'D1 — lãnh đạo hoàn thành đủ, đúng hạn, không vượt mức',
    profile: 'LEADER',
    inputs: {
      ...allPass,
      ax1: { rows: [row({ plannedQty: 5, completedQty: 5 })], dScores: FULL_D },
    },
    expect: { total: 100, kpi: 1, rating: 'HTTNV' },
    how: 'A=B=C=D=100% → 30 + 70 = 100; HTXS cần ≥30% nhiệm vụ vượt mức → xét HTTNV (đủ điều kiện)',
  },
  {
    name: 'D2 — như D1 và có nhiệm vụ vượt mức',
    profile: 'LEADER',
    inputs: {
      ...allPass,
      ax1: { rows: [row({ plannedQty: 5, completedQty: 5, exceeded: true })], dScores: FULL_D },
    },
    expect: { total: 100, kpi: 1, rating: 'HTXS' },
    how: 'Tỷ lệ vượt mức 100% ≥ 30%, hoàn thành 100%, không chậm → HTXS',
  },
  {
    name: 'D3 — không đảm bảo tiêu chí chung 18 điểm',
    profile: 'LEADER',
    inputs: { ...allPass, g11: { passed: false }, ax1: { rows: [row({})], dScores: FULL_D } },
    expect: { total: 82, rating: 'HTTNV' },
    how: '0 + 4 + 8 = 12 điểm chung; 12 + 70 = 82 → khoảng HTTNV, đủ điều kiện',
  },
  {
    name: 'D4 — chuyên viên (A+B+C)/3, hoàn thành thiếu và có làm lại',
    profile: 'STAFF',
    inputs: {
      ...allPass,
      ax1: {
        rows: [
          row({ coefficient: 2, plannedQty: 4, completedQty: 3, reworkQty: 1, reworkCount: 1 }),
        ],
      },
    },
    expect: { total: 81, kpi: (0.75 + 0.6875 + 0.75) / 3, rating: null },
    how: 'KH=8, HT=6 → A=75%; CL=2×(3−1)+max(0, 2−2×1×25%)=5,5 → B=68,75%; C=6/8=75%; KPI=72,9167% → 51,0417 → 81,0417 → 81,0; chưa hoàn thành 100% nhiệm vụ → không mức nào đủ điều kiện',
  },
  {
    name: 'D5 — lãnh đạo, 2 sản phẩm chậm 2 lần, D = (100, 100, 50)',
    profile: 'LEADER',
    inputs: {
      ...allPass,
      ax1: {
        rows: [row({ plannedQty: 2, completedQty: 2, lateQty: 2, lateCount: 2 })],
        dScores: { D1: 1, D2: 1, D3: 0.5 },
      },
    },
    expect: { total: 88.3, kpi: (1 + 1 + 0.5 + 5 / 6) / 4, rating: null },
    how: 'TĐ=1×0+max(0, 2−2×2×25%)=1 → C=50%; D=83,33%; KPI=83,33% → 58,333 → 88,333 → 88,3; 100% nhiệm vụ chậm → không đạt HTTNV/HTNV',
  },
  {
    name: 'D6 — trừ vượt quá giá trị sản phẩm (sàn 0)',
    profile: 'STAFF',
    inputs: { ...allPass, ax1: { rows: [row({ reworkQty: 1, reworkCount: 5 })] } },
    expect: { total: 76.7, kpi: 2 / 3, rating: 'HTTNV' },
    how: 'CL=max(0, 1−1×5×25%)=0 → B=0; A=C=100%; KPI=66,67% → 46,667 → 76,667 → 76,7',
  },
  {
    name: 'D7 — điểm cao nhưng có cờ kỷ luật',
    profile: 'LEADER',
    inputs: { ...allPass, ax1: { rows: [row({ exceeded: true })], dScores: FULL_D } },
    flags: ['DISCIPLINE'],
    expect: { total: 100, rating: 'KHTNV' },
    how: 'Cờ DISCIPLINE thuộc rating.forced → bắt buộc KHTNV dù 100 điểm',
  },
];

describe('Bộ dữ liệu mẫu — kết quả kỳ vọng tính tay', () => {
  for (const ds of DATASETS) {
    it(`${ds.name}: ${ds.how}`, () => {
      const r = calculateScore(
        engineInput({
          profile: ds.profile,
          ratingSubject: ds.profile,
          inputs: ds.inputs,
          flags: ds.flags ?? [],
        }),
      );
      expect(r.complete).toBe(ds.expect.complete ?? true);
      expect(r.totalRounded).toBe(ds.expect.total);
      if (ds.expect.kpi !== undefined)
        expect(r.result.items[0]!.ratio).toBeCloseTo(ds.expect.kpi, 5);
      expect(r.rating.eligible).toBe(ds.expect.rating);
    });
  }

  it('D8 — tổng dưới 50 điểm → KHTNV theo khoảng điểm', () => {
    // Chung: 0 + 4 + 0 = 4; A=B=C=2/4=50% → KPI 50% → 35 điểm; tổng 39 < 50 → KHTNV (mức chỉ xếp trong khoảng của nó)
    const r = calculateScore(
      engineInput({
        profile: 'STAFF',
        ratingSubject: 'STAFF',
        inputs: {
          g11: { passed: false },
          g12: { passed: true },
          g13: { passed: false },
          ax1: { rows: [row({ plannedQty: 4, completedQty: 2 })] },
        },
      }),
    );
    expect(r.general.score).toBe(4);
    expect(r.result.items[0]!.ratio).toBeCloseTo(0.5, 6);
    expect(r.totalRounded).toBe(39);
    expect(r.rating.eligible).toBe('KHTNV');
  });

  it('D9 — thiếu dữ liệu một tiêu chí: chưa đủ để đề xuất xếp loại', () => {
    const { g12: _omit, ...rest } = allPass;
    const r = calculateScore(
      engineInput({ inputs: { ...rest, ax1: { rows: [row({})], dScores: FULL_D } } }),
    );
    expect(r.complete).toBe(false);
    expect(r.rating.eligible).toBeNull();
    expect(r.explanation.join(' ')).toContain('CHƯA ĐỦ DỮ LIỆU');
  });

  it('D10 — không có kế hoạch (KH = 0): báo lỗi, không chia cho 0, không tự cho 100%', () => {
    const r = calculateScore(
      engineInput({
        inputs: {
          ...allPass,
          ax1: { rows: [row({ plannedQty: 0, completedQty: 0 })], dScores: FULL_D },
        },
      }),
    );
    expect(r.complete).toBe(false);
    expect(r.issues.some((i) => i.code === 'NO_PLAN')).toBe(true);
  });

  it('D11 — trục có chỉ tiêu trọng số 60/40 (tăng 8/10; giảm từ 10 xuống 6, mục tiêu 2)', () => {
    // k1 = 8/10 = 80%; k2 = (10−6)/(10−2) = 50%; trục = 80%×0,6 + 50%×0,4 = 68% → 47,6 → tổng 77,6
    const items = [
      ...basicCriteria('WEIGHTED_INDICATORS'),
      item({
        id: 'k1',
        kind: 'AXIS_INDICATOR',
        parentId: 'ax1',
        maxPoints: 100,
        weight: 60,
        scoringMethod: 'TARGET_RATIO',
        direction: 'INCREASE',
        target: 10,
      }),
      item({
        id: 'k2',
        kind: 'AXIS_INDICATOR',
        parentId: 'ax1',
        maxPoints: 100,
        weight: 40,
        scoringMethod: 'TARGET_RATIO',
        direction: 'DECREASE',
        baseline: 10,
        target: 2,
      }),
    ];
    const r = calculateScore(
      engineInput({ items, inputs: { ...allPass, k1: { actual: 8 }, k2: { actual: 6 } } }),
    );
    expect(r.result.items[0]!.ratio).toBeCloseTo(0.68, 6);
    expect(r.totalRounded).toBe(77.6);
  });

  it('D12 — làm tròn biên .x5: 74,45 → HALF_UP 74,5; HALF_EVEN 74,4; DOWN 74,4', () => {
    const items = basicCriteria('MANUAL_SCORE');
    const run = (mode: 'HALF_UP' | 'HALF_EVEN' | 'DOWN') =>
      calculateScore(
        engineInput({
          items,
          inputs: { ...allPass, ax1: { points: 44.45 } },
          rule: cloneRule((c) => (c.rounding = { decimals: 1, mode })),
        }),
      ).totalRounded;
    expect(run('HALF_UP')).toBe(74.5);
    expect(run('HALF_EVEN')).toBe(74.4);
    expect(run('DOWN')).toBe(74.4);
  });

  it('D13 — đổi cấu hình (mức trừ 10%, mẫu số B = hoàn thành) làm đổi kết quả đúng như công thức', () => {
    // KH=4, HT=3, 1 sản phẩm làm lại 1 lần: CL = 2 + max(0, 1 − 10%) = 2,9 → B = 2,9/3 = 96,67%
    const r = calculateScore(
      engineInput({
        profile: 'STAFF',
        ratingSubject: 'STAFF',
        inputs: {
          ...allPass,
          ax1: { rows: [row({ plannedQty: 4, completedQty: 3, reworkQty: 1, reworkCount: 1 })] },
        },
        rule: cloneRule((c) => {
          c.composite.reworkDeductionRate = 0.1;
          c.composite.qualityDenominator = 'COMPLETED';
        }),
      }),
    );
    expect(r.result.items[0]!.components?.B?.value).toBeCloseTo(2.9 / 3, 5);
  });
});
