/**
 * Kiểm thử engine tính điểm.
 * Phần "golden" đối chiếu với ví dụ [HD05] Phụ lục 2 — xem bảng đối chiếu trong docs/07-tieu-chi-va-tinh-diem.md.
 */
import { describe, expect, it } from 'vitest';
import type { CompositeRow } from '@kpi/shared';
import { d } from './decimal.js';
import { HD05_EXAMPLE_D, HD05_EXAMPLE_ROWS } from './demo-data.js';
import { calculateScore } from './engine.js';
import {
  allPass,
  basicCriteria,
  cloneRule,
  engineInput,
  item,
} from '../../tests/helpers/scoring.js';

const close = (actual: number | null | undefined, expected: number, digits = 6) =>
  expect(actual).toBeCloseTo(expected, digits);

const hd05 = (patch?: Parameters<typeof cloneRule>[0]) =>
  calculateScore(
    engineInput({
      inputs: { ...allPass, ax1: { rows: HD05_EXAMPLE_ROWS, dScores: HD05_EXAMPLE_D } },
      rule: cloneRule(patch),
    }),
  );

describe('Golden — ví dụ [HD05] Phụ lục 2 (lãnh đạo cấp phó, 1 trục 70 điểm)', () => {
  it('A (số lượng) = 10,8 / 12,8 = 84,375% — khớp văn bản (84,4%)', () => {
    const axis = hd05().result.items[0]!;
    close(axis.components?.A?.value, 0.84375);
    const rows = axis.rows!;
    expect(rows.map((r) => r.plannedConverted)).toEqual([3, 1, 1.5, 2.5, 1.8, 3]);
    expect(rows.map((r) => r.completedConverted)).toEqual([3, 0, 1.5, 2.5, 1.8, 2]);
  });

  it('C (tiến độ) = 8,1 / 12,8 = 63,28% — khớp văn bản (63,3%), từng dòng khớp cột (11) bảng 2.3', () => {
    const axis = hd05().result.items[0]!;
    expect(axis.rows!.map((r) => r.timelinessConverted)).toEqual([2, 0, 1.5, 1.25, 1.35, 2]);
    close(axis.components?.C?.value, 8.1 / 12.8, 5); // kết quả lưu 6 chữ số thập phân
  });

  it('D (lãnh đạo) = trung bình(100%, 100%, 50%) = 83,33% — khớp văn bản (83,3%)', () => {
    close(hd05().result.items[0]!.components?.D?.value, 5 / 6);
  });

  it('B (chất lượng): từng dòng khớp cột (11) bảng 2.2; TỔNG đúng là 9,65 (văn bản ghi 10,65)', () => {
    const axis = hd05().result.items[0]!;
    expect(axis.rows!.map((r) => r.qualityConverted)).toEqual([2.75, 0, 1.5, 2.5, 0.9, 2]);
    const sumQuality = axis.rows!.reduce((s, r) => s + r.qualityConverted, 0);
    close(sumQuality, 9.65);
  });

  it('B với mẫu số theo nhãn công thức (11)/(7): 9,65 / 12,8 = 75,39%', () => {
    close(hd05().result.items[0]!.components?.B?.value, 9.65 / 12.8);
  });

  it('B với mẫu số cột (9) (cách văn bản thực tế dùng): 9,65 / 10,8 = 89,35%; văn bản ra 90,3% do cộng sai (10,65/11,8)', () => {
    const r = hd05((c) => (c.composite.qualityDenominator = 'COMPLETED'));
    close(r.result.items[0]!.components?.B?.value, 9.65 / 10.8);
    close(10.65 / 11.8, 0.902542, 5); // con số trong văn bản
  });

  it('KPI và tổng điểm theo cấu hình mặc định (PLANNED): 76,595% → 30 + 53,617 = 83,6', () => {
    const r = hd05();
    const kpi = (0.84375 + 9.65 / 12.8 + 8.1 / 12.8 + 5 / 6) / 4;
    close(r.result.items[0]!.ratio, kpi);
    close(r.general.score, 30);
    close(r.result.score, kpi * 70, 5);
    close(r.total, 30 + kpi * 70, 5);
    expect(r.totalRounded).toBe(83.6);
    expect(r.complete).toBe(true);
  });

  it('đối chiếu số học của văn bản: (84,4 + 90,3 + 63,3 + 83,3)/4 = 80,325% (văn bản ghi 82,3%); 30 + 80,325%×70 = 86,2 (văn bản ghi 80,3)', () => {
    const mean = d(84.4).plus(90.3).plus(63.3).plus(83.3).div(4);
    expect(mean.toNumber()).toBe(80.325);
    expect(d(30).plus(mean.div(100).times(70)).toDecimalPlaces(1).toNumber()).toBe(86.2);
    expect(d(30).plus(d(0.823).times(70)).toDecimalPlaces(2).toNumber()).toBe(87.61);
  });

  it('chỉ số xếp loại tính từ dòng nhiệm vụ: 4/6 nhiệm vụ hoàn thành đủ; 3/6 có chậm tiến độ', () => {
    const r = hd05();
    close(r.metrics.completionRate, 4 / 6);
    close(r.metrics.lateShare, 3 / 6);
    close(r.metrics.failedShare, 1 / 6);
    expect(r.metrics.rowCount).toBe(6);
  });

  it('giải thích có đủ các bước để kiểm chứng', () => {
    const r = hd05();
    const steps = r.result.items[0]!.steps.join('\n');
    expect(steps).toContain('Σ số lượng quy đổi theo kế hoạch (cột 7)');
    expect(steps).toContain('KPI = (A + B + C + D) / 4');
    expect(r.explanation.join('\n')).toContain('Tổng điểm = 30 + ');
  });
});

describe('Công thức theo nhóm đối tượng và cấu hình', () => {
  it('chuyên viên (STAFF): KPI = (A+B+C)/3, không cần D', () => {
    const r = calculateScore(
      engineInput({
        profile: 'STAFF',
        ratingSubject: 'STAFF',
        inputs: { ...allPass, ax1: { rows: HD05_EXAMPLE_ROWS } },
      }),
    );
    close(r.result.items[0]!.ratio, (0.84375 + 9.65 / 12.8 + 8.1 / 12.8) / 3);
    expect(r.issues.some((i) => i.code === 'MISSING_D')).toBe(false);
  });

  it('công thức có trọng số (WEIGHTED)', () => {
    const r = hd05((c) => {
      c.kpiFormulas.LEADER = {
        components: ['A', 'C'],
        aggregate: 'WEIGHTED',
        weights: { A: 3, C: 1 },
      };
    });
    close(r.result.items[0]!.ratio, (0.84375 * 3 + (8.1 / 12.8) * 1) / 4);
  });

  it('mức trừ cấu hình được (10% mỗi lần chậm)', () => {
    const r = hd05((c) => (c.composite.lateDeductionRate = 0.1));
    // Dòng 1: 1 + max(0, 2 − 2×2×0,1) = 2,6
    expect(r.result.items[0]!.rows![0]!.timelinessConverted).toBe(2.6);
  });

  it('trừ điểm không làm âm số lượng (sàn 0 cho phần vi phạm)', () => {
    const rows: CompositeRow[] = [{ ...HD05_EXAMPLE_ROWS[2]!, reworkQty: 1, reworkCount: 9 }];
    const r = calculateScore(
      engineInput({ inputs: { ...allPass, ax1: { rows, dScores: HD05_EXAMPLE_D } } }),
    );
    expect(r.result.items[0]!.rows![0]!.qualityConverted).toBe(0);
  });

  it('vượt kế hoạch: A bị chặn trần 100% (capA = 1); bỏ trần khi capA = null', () => {
    const rows: CompositeRow[] = [
      { ...HD05_EXAMPLE_ROWS[0]!, plannedQty: 2, completedQty: 3, reworkQty: 0, lateQty: 0 },
    ];
    const capped = calculateScore(
      engineInput({ inputs: { ...allPass, ax1: { rows, dScores: HD05_EXAMPLE_D } } }),
    );
    close(capped.result.items[0]!.components?.A?.value, 1);
    const uncapped = calculateScore(
      engineInput({
        inputs: { ...allPass, ax1: { rows, dScores: HD05_EXAMPLE_D } },
        rule: cloneRule((c) => (c.composite.capA = null)),
      }),
    );
    close(uncapped.result.items[0]!.components?.A?.value, 1.5);
  });

  it('làm tròn theo cấu hình: 80,25 → HALF_UP 80,3; HALF_EVEN 80,2; DOWN 80,2', () => {
    const items = basicCriteria('MANUAL_SCORE');
    const inputs = { ...allPass, ax1: { points: 50.25 } };
    const run = (mode: 'HALF_UP' | 'HALF_EVEN' | 'DOWN') =>
      calculateScore(
        engineInput({
          items,
          inputs,
          rule: cloneRule((c) => (c.rounding = { decimals: 1, mode })),
        }),
      ).totalRounded;
    expect(run('HALF_UP')).toBe(80.3);
    expect(run('HALF_EVEN')).toBe(80.2);
    expect(run('DOWN')).toBe(80.2);
  });

  it('"không đảm bảo" → điểm theo passFail.failRatio', () => {
    const r = calculateScore(
      engineInput({
        inputs: {
          ...allPass,
          g12: { passed: false },
          ax1: { rows: HD05_EXAMPLE_ROWS, dScores: HD05_EXAMPLE_D },
        },
      }),
    );
    close(r.general.score, 26);
    const half = calculateScore(
      engineInput({
        inputs: {
          ...allPass,
          g12: { passed: false },
          ax1: { rows: HD05_EXAMPLE_ROWS, dScores: HD05_EXAMPLE_D },
        },
        rule: cloneRule((c) => (c.passFail.failRatio = 0.5)),
      }),
    );
    close(half.general.score, 28);
  });
});

describe('Dữ liệu thiếu, sai, ngoại lệ', () => {
  it('thiếu dữ liệu → complete = false, không đề xuất xếp loại, mục thiếu tính 0 điểm', () => {
    const r = calculateScore(engineInput({ inputs: { g11: { passed: true } } }));
    expect(r.complete).toBe(false);
    expect(r.rating.eligible).toBeNull();
    expect(r.issues.filter((i) => i.code === 'MISSING_INPUT').map((i) => i.itemCode)).toEqual([
      'G12',
      'G13',
      'AX1',
    ]);
    close(r.total, 0);
    expect(r.explanation.join('\n')).toContain('CHƯA ĐỦ DỮ LIỆU');
  });

  it('kế hoạch bằng 0 → lỗi NO_PLAN', () => {
    const rows: CompositeRow[] = [
      { ...HD05_EXAMPLE_ROWS[0]!, plannedQty: 0, completedQty: 0, reworkQty: 0, lateQty: 0 },
    ];
    const r = calculateScore(
      engineInput({ inputs: { ...allPass, ax1: { rows, dScores: HD05_EXAMPLE_D } } }),
    );
    expect(r.issues.some((i) => i.code === 'NO_PLAN')).toBe(true);
    expect(r.complete).toBe(false);
  });

  it('số lượng làm lại lớn hơn số hoàn thành → lỗi; vượt kế hoạch nhiều lần → cảnh báo ngoại lệ', () => {
    const rows: CompositeRow[] = [
      { ...HD05_EXAMPLE_ROWS[2]!, reworkQty: 2 },
      { ...HD05_EXAMPLE_ROWS[0]!, plannedQty: 1, completedQty: 10, reworkQty: 0, lateQty: 0 },
    ];
    const r = calculateScore(
      engineInput({ inputs: { ...allPass, ax1: { rows, dScores: HD05_EXAMPLE_D } } }),
    );
    expect(r.issues.find((i) => i.code === 'INVALID_ROW')?.level).toBe('error');
    expect(r.issues.find((i) => i.code === 'OUTLIER')?.level).toBe('warning');
  });

  it('D thiếu tiêu chí hoặc mức không hợp lệ (0,7) → lỗi', () => {
    const missing = calculateScore(
      engineInput({ inputs: { ...allPass, ax1: { rows: HD05_EXAMPLE_ROWS, dScores: { D1: 1 } } } }),
    );
    expect(missing.issues.some((i) => i.code === 'MISSING_D')).toBe(true);
    const invalid = calculateScore(
      engineInput({
        inputs: {
          ...allPass,
          ax1: { rows: HD05_EXAMPLE_ROWS, dScores: { D1: 1, D2: 0.7, D3: 1 } },
        },
      }),
    );
    expect(invalid.issues.some((i) => i.code === 'INVALID_D')).toBe(true);
  });

  it('điểm chấm trực tiếp vượt điểm tối đa → lỗi', () => {
    const r = calculateScore(
      engineInput({
        items: basicCriteria('MANUAL_SCORE'),
        inputs: { ...allPass, ax1: { points: 71 } },
      }),
    );
    expect(r.issues.some((i) => i.code === 'OVER_MAX')).toBe(true);
  });

  it('miễn trừ không có căn cứ → cảnh báo', () => {
    const rows: CompositeRow[] = [{ ...HD05_EXAMPLE_ROWS[2]!, exemptCount: 1, exemptNote: null }];
    const r = calculateScore(
      engineInput({ inputs: { ...allPass, ax1: { rows, dScores: HD05_EXAMPLE_D } } }),
    );
    expect(r.issues.some((i) => i.code === 'EXEMPT_NO_NOTE')).toBe(true);
  });
});

describe('Tiêu chí không áp dụng', () => {
  const items = basicCriteria().map((i) =>
    i.id === 'g13' ? { ...i, allowNotApplicable: true } : i,
  );
  const inputs = {
    ...allPass,
    g13: { notApplicable: true, naReason: 'Không phát sinh' },
    ax1: { rows: HD05_EXAMPLE_ROWS, dScores: HD05_EXAMPLE_D },
  };

  it('bộ quy tắc NOT_ALLOWED → lỗi, không loại trừ', () => {
    const r = calculateScore(engineInput({ items, inputs }));
    expect(r.issues.some((i) => i.code === 'NA_POLICY')).toBe(true);
    expect(r.complete).toBe(false);
  });

  it('EXCLUDE_AND_RESCALE → loại mục khỏi mẫu số, quy đổi về thang 30', () => {
    const r = calculateScore(
      engineInput({
        items,
        inputs,
        rule: cloneRule((c) => (c.notApplicable.policy = 'EXCLUDE_AND_RESCALE')),
      }),
    );
    close(r.general.score, 30); // 22/22 × 30
    expect(r.complete).toBe(true);
  });

  it('mục không cho phép "không áp dụng" → lỗi dù bộ quy tắc cho phép', () => {
    const r = calculateScore(
      engineInput({
        inputs: { ...inputs, g12: { notApplicable: true } },
        items,
        rule: cloneRule((c) => (c.notApplicable.policy = 'EXCLUDE_AND_RESCALE')),
      }),
    );
    expect(r.issues.some((i) => i.code === 'NA_NOT_ALLOWED')).toBe(true);
  });
});

describe('Trục có chỉ tiêu con theo trọng số (KPI/KR định lượng)', () => {
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
      target: 20,
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
      allowNotApplicable: true,
    }),
  ];

  it('tỷ lệ trục = Σ(tỷ lệ × trọng số)/Σ trọng số', () => {
    const r = calculateScore(
      engineInput({ items, inputs: { ...allPass, k1: { actual: 20 }, k2: { actual: 6 } } }),
    );
    // k1: 20/20 = 100%; k2: (10−6)/(10−2) = 50% → 0,6×1 + 0,4×0,5 = 0,8
    close(r.result.items[0]!.ratio, 0.8);
    close(r.result.score, 56);
  });

  it('vượt mục tiêu bị chặn trần 100% (targetRatio.cap = 1); bỏ trần khi cap = null', () => {
    const capped = calculateScore(
      engineInput({ items, inputs: { ...allPass, k1: { actual: 30 }, k2: { actual: 2 } } }),
    );
    close(capped.result.items[0]!.ratio, 1);
    const free = calculateScore(
      engineInput({
        items,
        inputs: { ...allPass, k1: { actual: 30 }, k2: { actual: 2 } },
        rule: cloneRule((c) => (c.targetRatio.cap = null)),
      }),
    );
    close(free.result.items[0]!.ratio, 0.6 * 1.5 + 0.4 * 1);
    expect(free.issues.some((i) => i.code === 'OVER_SCALE')).toBe(true);
  });

  it('chỉ tiêu giảm theo phương pháp Mục tiêu/Thực tế', () => {
    const r = calculateScore(
      engineInput({
        items,
        inputs: { ...allPass, k1: { actual: 20 }, k2: { actual: 4 } },
        rule: cloneRule((c) => (c.targetRatio.decreaseMethod = 'TARGET_OVER_ACTUAL')),
      }),
    );
    close(r.result.items[0]!.children![1]!.ratio, 0.5); // 2/4
  });

  it('chỉ tiêu không áp dụng được loại khỏi trọng số khi bộ quy tắc cho phép', () => {
    const r = calculateScore(
      engineInput({
        items,
        inputs: {
          ...allPass,
          k1: { actual: 10 },
          k2: { notApplicable: true, naReason: 'Không phát sinh' },
        },
        rule: cloneRule((c) => (c.notApplicable.policy = 'EXCLUDE_AND_RESCALE')),
      }),
    );
    close(r.result.items[0]!.ratio, 0.5); // chỉ còn k1: 10/20
  });

  it('mục tiêu bằng 0 (chỉ tiêu tăng) → lỗi', () => {
    const bad = items.map((i) => (i.id === 'k1' ? { ...i, target: 0 } : i));
    const r = calculateScore(
      engineInput({ items: bad, inputs: { ...allPass, k1: { actual: 5 }, k2: { actual: 6 } } }),
    );
    expect(r.issues.some((i) => i.code === 'INVALID_TARGET')).toBe(true);
  });

  it('định tính theo mức', () => {
    const q = [
      ...basicCriteria('WEIGHTED_INDICATORS'),
      item({
        id: 'q1',
        kind: 'AXIS_INDICATOR',
        parentId: 'ax1',
        maxPoints: 100,
        weight: 100,
        scoringMethod: 'QUALITATIVE_LEVEL',
      }),
    ];
    const r = calculateScore(
      engineInput({ items: q, inputs: { ...allPass, q1: { level: 'M2' } } }),
    );
    close(r.result.items[0]!.ratio, 0.5);
    const bad = calculateScore(
      engineInput({ items: q, inputs: { ...allPass, q1: { level: 'KHONG_CO' } } }),
    );
    expect(bad.issues.some((i) => i.code === 'INVALID_LEVEL')).toBe(true);
  });
});
