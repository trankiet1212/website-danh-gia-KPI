/** Danh sách kỳ đánh giá trong ô chọn: nhóm theo loại kỳ, kèm khoảng ngày và đánh dấu kỳ hiện tại. */
import { PERIOD_TYPE_LABELS, type PeriodDto, type PeriodType } from '@kpi/shared';
import { todayIso } from '@/lib/format';
import { periodLabel } from './period-utils';

export function PeriodOptions({ periods, types }: { periods: PeriodDto[]; types: PeriodType[] }) {
  const today = todayIso();
  return (
    <>
      {types.map((t) => {
        const list = periods.filter((p) => p.type === t);
        if (list.length === 0) return null;
        return (
          <optgroup key={t} label={`Theo ${PERIOD_TYPE_LABELS[t].toLowerCase()}`}>
            {list.map((p) => (
              <option key={p.id} value={p.id}>
                {periodLabel(p, today)}
              </option>
            ))}
          </optgroup>
        );
      })}
    </>
  );
}
