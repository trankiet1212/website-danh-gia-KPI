/** Định dạng hiển thị trong báo cáo (giờ Việt Nam, số kiểu Việt Nam) và chống chèn công thức bảng tính. */
const TZ = 'Asia/Ho_Chi_Minh';

export function fmtDateTimeVn(d: Date): string {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function fmtNumber(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined) return '';
  return n.toLocaleString('vi-VN', { maximumFractionDigits: digits });
}

export function fmtPercent(n: number | null | undefined, digits = 1): string {
  return n === null || n === undefined ? '' : `${fmtNumber(n * 100, digits)}%`;
}

/**
 * Chuỗi bắt đầu bằng = + - @ (hoặc tab/CR) có thể bị Excel/LibreOffice hiểu là công thức (CSV/formula injection)
 * → thêm dấu nháy đơn ở đầu để luôn là văn bản.
 */
export function safeText(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** Tên file an toàn (bỏ dấu, ký tự đặc biệt). */
export function safeFileName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}
