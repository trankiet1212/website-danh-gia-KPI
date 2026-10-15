/**
 * Tên nhiệm vụ tự điền khi chọn sản phẩm trong danh mục SP/CV. Tên sản phẩm có thể rất dài
 * (vượt giới hạn lưu 500 ký tự của tên nhiệm vụ) → rút gọn theo ranh giới từ, thêm dấu "…".
 */
export const LABEL_FROM_CATALOG_MAX = 160;

export function catalogLabel(name: string): string {
  const clean = name.replace(/\s+/g, ' ').trim();
  if (clean.length <= LABEL_FROM_CATALOG_MAX) return clean;
  const cut = clean.lastIndexOf(' ', LABEL_FROM_CATALOG_MAX - 1);
  const head = clean.slice(0, cut > 80 ? cut : LABEL_FROM_CATALOG_MAX - 1);
  return `${head.replace(/[\s,;:.…-]+$/, '')}…`;
}
