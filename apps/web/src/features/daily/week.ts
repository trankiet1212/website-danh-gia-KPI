/** Tính tuần làm việc (Thứ Hai → Chủ nhật) trên chuỗi ngày 'YYYY-MM-DD' — không phụ thuộc múi giờ máy. */

const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const toIso = (d: Date) => d.toISOString().slice(0, 10);

export function addDaysIso(iso: string, days: number): string {
  return toIso(new Date(toDate(iso).getTime() + days * 86_400_000));
}

/** Thứ Hai của tuần chứa ngày `iso`. */
export function weekStart(iso: string): string {
  const dow = toDate(iso).getUTCDay(); // 0 = Chủ nhật
  return addDaysIso(iso, dow === 0 ? -6 : 1 - dow);
}

/** 7 ngày của tuần bắt đầu từ Thứ Hai `monday`. */
export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysIso(monday, i));
}

const WEEKDAY_NAMES = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

export function weekdayName(iso: string): string {
  return WEEKDAY_NAMES[toDate(iso).getUTCDay()]!;
}

/** 'YYYY-MM-DD' → 'DD/MM'. */
export function shortDate(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}
