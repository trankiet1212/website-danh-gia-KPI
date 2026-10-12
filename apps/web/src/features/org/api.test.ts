import { describe, expect, it } from 'vitest';
import type { UnitDto } from '@kpi/shared';
import { qs } from '@/lib/api-client';
import { flattenUnitTree } from './api';

const unit = (id: string, parentId: string | null, sortOrder = 0): UnitDto => ({
  id,
  code: id.toUpperCase(),
  name: `Đơn vị ${id}`,
  shortName: null,
  type: 'DEPARTMENT',
  parentId,
  sortOrder,
  status: 'ACTIVE',
  activeEmployeeCount: 0,
  version: 1,
});

describe('flattenUnitTree', () => {
  it('sắp xếp cha trước con, kèm độ sâu', () => {
    const rows = flattenUnitTree([unit('c', 'b'), unit('a', null), unit('b', 'a'), unit('d', 'a')]);
    expect(rows.map((r) => [r.id, r.depth])).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 2],
      ['d', 1],
    ]);
  });

  it('đơn vị có cấp trên không nằm trong danh sách (đã lưu trữ) được đưa lên cấp gốc', () => {
    const rows = flattenUnitTree([unit('x', 'khong-co')]);
    expect(rows).toEqual([expect.objectContaining({ id: 'x', depth: 0 })]);
  });
});

describe('qs', () => {
  it('bỏ qua giá trị rỗng và mã hóa ký tự đặc biệt', () => {
    expect(qs({ q: 'Nguyễn Văn', page: 2, empty: '', none: undefined, flag: false })).toBe(
      '?q=Nguy%E1%BB%85n+V%C4%83n&page=2&flag=false',
    );
    expect(qs({})).toBe('');
  });
});
