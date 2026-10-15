import { describe, expect, it } from 'vitest';
import { addDaysIso, weekDays, weekStart, weekdayName } from './week';

describe('Tuần làm việc', () => {
  it('Thứ Hai của tuần: ngày giữa tuần, Thứ Hai, Chủ nhật', () => {
    expect(weekStart('2026-10-14')).toBe('2026-10-12'); // Thứ Tư
    expect(weekStart('2026-10-12')).toBe('2026-10-12'); // Thứ Hai
    expect(weekStart('2026-10-18')).toBe('2026-10-12'); // Chủ nhật thuộc tuần trước đó
  });

  it('7 ngày qua ranh giới tháng, năm nhuận', () => {
    expect(weekDays('2028-02-28')).toEqual([
      '2028-02-28',
      '2028-02-29',
      '2028-03-01',
      '2028-03-02',
      '2028-03-03',
      '2028-03-04',
      '2028-03-05',
    ]);
    expect(addDaysIso('2026-12-28', 7)).toBe('2027-01-04');
  });

  it('tên thứ trong tuần', () => {
    expect(weekdayName('2026-10-12')).toBe('Thứ Hai');
    expect(weekdayName('2026-10-18')).toBe('Chủ nhật');
  });
});
