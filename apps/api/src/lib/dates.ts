/** Ngày nghiệp vụ lưu kiểu `date` (UTC 00:00). Chuyển đổi qua lại với chuỗi 'YYYY-MM-DD'. */

export function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function toDateOnly(value: Date): string;
export function toDateOnly(value: Date | null | undefined): string | null;
export function toDateOnly(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/** Ngày hôm nay theo giờ Việt Nam (UTC+7), dạng Date UTC 00:00. */
export function todayVn(now = new Date()): Date {
  return parseDateOnly(new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10));
}
