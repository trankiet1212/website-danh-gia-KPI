/** Tiện ích hiển thị kỳ đánh giá: khoảng ngày theo lịch thực tế, kỳ hiện tại, năm để chọn. */
import type { PeriodDto } from '@kpi/shared';
import { formatDate, todayIso } from '@/lib/format';

/** Kỳ chứa ngày hôm nay (giờ Việt Nam). */
export const isCurrentPeriod = (p: PeriodDto, today = todayIso()) =>
  p.startDate <= today && today <= p.endDate;

export function periodLabel(p: PeriodDto, today = todayIso()): string {
  const current = isCurrentPeriod(p, today) ? ' — hiện tại' : '';
  return `${p.name} (${formatDate(p.startDate)} – ${formatDate(p.endDate)})${current}`;
}

/** Năm hiện tại, năm trước và năm sau. */
export function yearChoices(): number[] {
  const y = Number(todayIso().slice(0, 4));
  return [y - 1, y, y + 1];
}
