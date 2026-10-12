/** Tiện ích dựng bộ tiêu chí/cấu hình cho unit test engine. */
import type { ItemInput, RuleConfig } from '@kpi/shared';
import { QD39_HD05_CONFIG } from '../../prisma/seed/rule-config-qd39-hd05.js';
import type { EngineCriteriaItem, EngineInput } from '../../src/scoring/types.js';

export const cloneRule = (patch: (r: RuleConfig) => void = () => undefined): RuleConfig => {
  const r = structuredClone(QD39_HD05_CONFIG);
  patch(r);
  return r;
};

export function item(
  partial: Partial<EngineCriteriaItem> & Pick<EngineCriteriaItem, 'id' | 'kind'>,
): EngineCriteriaItem {
  return {
    parentId: null,
    code: partial.id.toUpperCase(),
    name: `Mục ${partial.id}`,
    maxPoints: 0,
    weight: null,
    scoringMethod: null,
    direction: null,
    target: null,
    baseline: null,
    allowNotApplicable: false,
    sortOrder: 0,
    ...partial,
  };
}

/** Bộ tiêu chí tối giản: 1 nhóm chung 30 điểm (3 mục đảm bảo/không) + 1 trục KPI tổng hợp 70 điểm. */
export function basicCriteria(
  axisMethod: EngineCriteriaItem['scoringMethod'] = 'KPI_COMPOSITE',
): EngineCriteriaItem[] {
  return [
    item({ id: 'g1', kind: 'GENERAL_GROUP', maxPoints: 30, sortOrder: 1 }),
    item({
      id: 'g11',
      kind: 'GENERAL_ITEM',
      parentId: 'g1',
      maxPoints: 18,
      scoringMethod: 'PASS_FAIL',
      sortOrder: 1,
    }),
    item({
      id: 'g12',
      kind: 'GENERAL_ITEM',
      parentId: 'g1',
      maxPoints: 4,
      scoringMethod: 'PASS_FAIL',
      sortOrder: 2,
    }),
    item({
      id: 'g13',
      kind: 'GENERAL_ITEM',
      parentId: 'g1',
      maxPoints: 8,
      scoringMethod: 'PASS_FAIL',
      sortOrder: 3,
    }),
    item({ id: 'ax1', kind: 'AXIS', maxPoints: 70, scoringMethod: axisMethod, sortOrder: 10 }),
  ];
}

export const allPass: Record<string, ItemInput> = {
  g11: { passed: true },
  g12: { passed: true },
  g13: { passed: true },
};

export function engineInput(overrides: Partial<EngineInput> = {}): EngineInput {
  return {
    profile: 'LEADER',
    ratingSubject: 'LEADER',
    generalMax: 30,
    resultMax: 70,
    items: basicCriteria(),
    inputs: { ...allPass },
    flags: [],
    rule: cloneRule(),
    ruleConfirmed: true,
    ...overrides,
  };
}
