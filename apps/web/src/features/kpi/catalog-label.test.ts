import { describe, expect, it } from 'vitest';
import { catalogLabel, LABEL_FROM_CATALOG_MAX } from './catalog-label';

describe('catalogLabel — tên nhiệm vụ tự điền từ danh mục', () => {
  it('giữ nguyên tên ngắn, chuẩn hóa khoảng trắng', () => {
    expect(catalogLabel('  Soạn thảo   công văn  ')).toBe('Soạn thảo công văn');
  });

  it('rút gọn tên dài theo ranh giới từ, có dấu …, không vượt giới hạn', () => {
    const long =
      'Tổng hợp danh sách, hồ sơ, thẩm định, báo cáo thẩm định tiêu chuẩn, điều kiện '.repeat(10);
    const out = catalogLabel(long);
    expect(out.length).toBeLessThanOrEqual(LABEL_FROM_CATALOG_MAX);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toMatch(/[\s,]…$/);
    expect(long.startsWith(out.slice(0, -1))).toBe(true);
  });
});
