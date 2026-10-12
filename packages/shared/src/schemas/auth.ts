import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 12;

/**
 * Chính sách mật khẩu: tối thiểu 12 ký tự, có ít nhất 3 trong 4 nhóm (chữ thường, chữ hoa, số, ký tự đặc biệt),
 * không chứa tên đăng nhập. Trả về danh sách lỗi (rỗng = hợp lệ).
 */
export function checkPasswordStrength(password: string, username?: string): string[] {
  const errors: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.push(`Mật khẩu phải có ít nhất ${PASSWORD_MIN_LENGTH} ký tự`);
  }
  if (password.length > 128) errors.push('Mật khẩu tối đa 128 ký tự');
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) =>
    r.test(password),
  ).length;
  if (classes < 3) {
    errors.push('Mật khẩu cần ít nhất 3 trong 4 loại: chữ thường, chữ hoa, chữ số, ký tự đặc biệt');
  }
  if (username && username.length >= 3 && password.toLowerCase().includes(username.toLowerCase())) {
    errors.push('Mật khẩu không được chứa tên đăng nhập');
  }
  return errors;
}

export const usernameField = z
  .string({ error: 'Vui lòng nhập tên đăng nhập' })
  .transform((v) => v.trim().toLowerCase())
  .pipe(
    z
      .string()
      .min(3, 'Tên đăng nhập tối thiểu 3 ký tự')
      .max(50, 'Tên đăng nhập tối đa 50 ký tự')
      .regex(/^[a-z0-9._-]+$/, 'Tên đăng nhập chỉ gồm chữ không dấu, số và . _ -'),
  );

export const loginSchema = z.object({
  username: z
    .string({ error: 'Vui lòng nhập tên đăng nhập' })
    .trim()
    .toLowerCase()
    .min(1, 'Vui lòng nhập tên đăng nhập')
    .max(100),
  password: z.string({ error: 'Vui lòng nhập mật khẩu' }).min(1, 'Vui lòng nhập mật khẩu').max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Vui lòng nhập mật khẩu hiện tại').max(200),
    newPassword: z.string().min(1, 'Vui lòng nhập mật khẩu mới').max(128),
    confirmPassword: z.string().min(1, 'Vui lòng nhập lại mật khẩu mới'),
  })
  .superRefine((v, ctx) => {
    for (const msg of checkPasswordStrength(v.newPassword)) {
      ctx.addIssue({ code: 'custom', path: ['newPassword'], message: msg });
    }
    if (v.newPassword !== v.confirmPassword) {
      ctx.addIssue({
        code: 'custom',
        path: ['confirmPassword'],
        message: 'Mật khẩu nhập lại không khớp',
      });
    }
    if (v.newPassword === v.currentPassword) {
      ctx.addIssue({
        code: 'custom',
        path: ['newPassword'],
        message: 'Mật khẩu mới phải khác mật khẩu hiện tại',
      });
    }
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
