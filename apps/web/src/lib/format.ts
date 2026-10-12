/** Định dạng hiển thị theo chuẩn Việt Nam, múi giờ Asia/Ho_Chi_Minh. */

const TZ = 'Asia/Ho_Chi_Minh';

/** 'YYYY-MM-DD' → 'DD/MM/YYYY'. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const [y, m, d] = value.slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : value;
}

/** Thời điểm ISO → 'DD/MM/YYYY HH:mm' giờ Việt Nam. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

/** Ngày hôm nay giờ Việt Nam dạng 'YYYY-MM-DD' (giá trị mặc định cho ô ngày). */
export function todayIso(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(new Date());
}
