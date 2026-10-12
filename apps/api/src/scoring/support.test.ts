import { describe, expect, it } from 'vitest';
import { ruleConfigSchema } from '@kpi/shared';
import { QD39_HD05_CONFIG } from '../../prisma/seed/rule-config-qd39-hd05.js';
import { aggregatePeriods } from './aggregate.js';
import { checksumOf } from './checksum.js';
import { krProgress, objectiveProgress } from './kr-progress.js';
import { basicCriteria, cloneRule, item } from '../../tests/helpers/scoring.js';
import { validateCriteria } from './validate-criteria.js';

describe('Cấu hình bộ quy tắc', () => {
  it('cấu hình DEMO [QĐ39]/[HD05] hợp lệ theo schema', () => {
    expect(ruleConfigSchema.safeParse(QD39_HD05_CONFIG).success).toBe(true);
  });

  it('từ chối: điểm chung + kết quả ≠ thang; mức tham chiếu không tồn tại; cờ chưa khai báo', () => {
    const bad = cloneRule((c) => {
      c.scale.generalMax = 40;
      c.rating.conditions.push({
        rating: 'KHONG_CO',
        appliesTo: ['STAFF'],
        all: [{ type: 'noFlag', flag: 'X' }],
      });
    });
    const res = ruleConfigSchema.safeParse(bad);
    expect(res.success).toBe(false);
    const messages = res.error!.issues.map((i) => i.message).join('\n');
    expect(messages).toContain('phải bằng thang điểm tối đa');
    expect(messages).toContain('KHONG_CO');
    expect(messages).toContain('Cờ "X" chưa khai báo');
  });

  it('công thức WEIGHTED thiếu trọng số → lỗi', () => {
    const bad = cloneRule(
      (c) =>
        (c.kpiFormulas.STAFF = {
          components: ['A', 'B'],
          aggregate: 'WEIGHTED',
          weights: { A: 1 },
        }),
    );
    expect(ruleConfigSchema.safeParse(bad).success).toBe(false);
  });
});

describe('Kiểm tra cấu trúc bộ tiêu chí', () => {
  const rule = cloneRule();

  it('bộ tiêu chí chuẩn (30 + 70) không có lỗi', () => {
    expect(
      validateCriteria(basicCriteria(), 30, 70, rule).filter((i) => i.level === 'error'),
    ).toEqual([]);
  });

  it('tổng điểm tiêu chí chung, nhóm, trục sai → lỗi', () => {
    const items = basicCriteria().map((i) =>
      i.id === 'g13' ? { ...i, maxPoints: 5 } : i.id === 'ax1' ? { ...i, maxPoints: 60 } : i,
    );
    const codes = validateCriteria(items, 30, 70, rule).map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(['GENERAL_TOTAL', 'GROUP_TOTAL', 'AXIS_TOTAL']));
  });

  it('tổng trọng số chỉ tiêu con khác 100% → lỗi; thiếu trọng số → lỗi', () => {
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
        target: 1,
      }),
      item({
        id: 'k2',
        kind: 'AXIS_INDICATOR',
        parentId: 'ax1',
        maxPoints: 100,
        weight: 30,
        scoringMethod: 'TARGET_RATIO',
        direction: 'INCREASE',
        target: 1,
      }),
    ];
    expect(validateCriteria(items, 30, 70, rule).map((i) => i.code)).toContain('WEIGHT_TOTAL');
    const missing = items.map((i) => (i.id === 'k2' ? { ...i, weight: null } : i));
    expect(validateCriteria(missing, 30, 70, rule).map((i) => i.code)).toContain('MISSING_WEIGHT');
  });

  it('quan hệ cha–con, phương pháp, mã trùng, thiếu mục tiêu', () => {
    const items = [
      ...basicCriteria(),
      item({
        id: 'x1',
        kind: 'GENERAL_ITEM',
        code: 'G11',
        parentId: 'ax1',
        maxPoints: 0,
        scoringMethod: 'KPI_COMPOSITE',
      }),
      item({
        id: 'x2',
        kind: 'AXIS_INDICATOR',
        parentId: 'ax1',
        maxPoints: 0,
        scoringMethod: 'TARGET_RATIO',
      }),
    ];
    const codes = validateCriteria(items, 30, 70, rule).map((i) => i.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        'DUPLICATE_CODE',
        'INVALID_PARENT',
        'INVALID_METHOD',
        'MISSING_TARGET',
        'MISSING_DIRECTION',
      ]),
    );
  });

  it('không gắn bộ quy tắc → cảnh báo; thang điểm khác bộ quy tắc → lỗi', () => {
    expect(validateCriteria(basicCriteria(), 30, 70, null).map((i) => i.code)).toContain(
      'NO_RULESET',
    );
    const items = basicCriteria().map((i) => (i.id === 'ax1' ? { ...i, maxPoints: 80 } : i));
    expect(validateCriteria(items, 30, 80, rule).map((i) => i.code)).toContain('SCALE_MISMATCH');
  });
});

describe('Tổng hợp nhiều kỳ', () => {
  const scores = [
    { periodCode: '2026-Q1', total: 80, rating: 'HTTNV' },
    { periodCode: '2026-Q2', total: 90, rating: 'HTXS' },
  ];

  it('MANUAL_WITH_REFERENCE: không tự tính, chỉ liệt kê căn cứ (mặc định — không tự lấy trung bình cộng)', () => {
    const r = aggregatePeriods(scores, cloneRule());
    expect(r.value).toBeNull();
    expect(r.steps.join('\n')).toContain('2026-Q1: 80');
  });

  it('WEIGHTED_AVERAGE theo trọng số đã cấu hình', () => {
    const r = aggregatePeriods(
      scores,
      cloneRule(
        (c) =>
          (c.annualAggregation = {
            strategy: 'WEIGHTED_AVERAGE',
            weights: { '2026-Q1': 1, '2026-Q2': 3 },
          }),
      ),
    );
    expect(r.value).toBe(87.5);
  });

  it('thiếu điểm một kỳ → không tính', () => {
    const r = aggregatePeriods(
      [...scores, { periodCode: '2026-Q3', total: null, rating: null }],
      cloneRule(
        (c) =>
          (c.annualAggregation = {
            strategy: 'WEIGHTED_AVERAGE',
            weights: { '2026-Q1': 1, '2026-Q2': 1, '2026-Q3': 1 },
          }),
      ),
    );
    expect(r.value).toBeNull();
  });
});

describe('Tiến độ OKR (chỉ theo dõi)', () => {
  it('chỉ tiêu tăng, giảm, đạt/không đạt; giới hạn 0–100%', () => {
    expect(
      krProgress({
        measureType: 'NUMBER',
        direction: 'INCREASE',
        baseline: 0,
        target: 10,
        currentValue: 4,
      }).ratio,
    ).toBe(0.4);
    expect(
      krProgress({
        measureType: 'PERCENT',
        direction: 'DECREASE',
        baseline: 20,
        target: 10,
        currentValue: 15,
      }).ratio,
    ).toBe(0.5);
    expect(
      krProgress({
        measureType: 'NUMBER',
        direction: 'INCREASE',
        baseline: 0,
        target: 10,
        currentValue: 15,
      }).ratio,
    ).toBe(1);
    expect(
      krProgress({
        measureType: 'BOOLEAN',
        direction: 'INCREASE',
        baseline: null,
        target: 1,
        currentValue: 1,
      }).ratio,
    ).toBe(1);
    expect(
      krProgress({
        measureType: 'NUMBER',
        direction: 'INCREASE',
        baseline: 0,
        target: 10,
        currentValue: null,
      }).ratio,
    ).toBeNull();
  });

  it('tiến độ mục tiêu theo trọng số KR; thiếu trọng số → bình quân', () => {
    expect(
      objectiveProgress([
        { ratio: 1, weight: 75 },
        { ratio: 0, weight: 25 },
      ]),
    ).toBe(0.75);
    expect(
      objectiveProgress([
        { ratio: 1, weight: null },
        { ratio: 0, weight: 25 },
      ]),
    ).toBe(0.5);
    expect(objectiveProgress([{ ratio: null, weight: 1 }])).toBeNull();
  });
});

describe('Checksum dấu vết', () => {
  it('không phụ thuộc thứ tự khóa; thay đổi dữ liệu → đổi checksum', () => {
    expect(checksumOf({ a: 1, b: [1, { c: 2, d: 3 }] })).toBe(
      checksumOf({ b: [1, { d: 3, c: 2 }], a: 1 }),
    );
    expect(checksumOf({ a: 1 })).not.toBe(checksumOf({ a: 2 }));
  });
});
