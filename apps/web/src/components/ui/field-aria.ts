/** Thuộc tính aria cho ô nhập có lỗi. */
export function fieldAria(id: string, error?: string) {
  return {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : `${id}-hint`,
  } as const;
}
