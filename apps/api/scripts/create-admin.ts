/**
 * Tạo tài khoản Quản trị hệ thống (SUPER_ADMIN) — dùng cho môi trường thật, KHÔNG có mật khẩu mặc định.
 *   npm run create-admin
 * Hỏi tên đăng nhập, tên hiển thị và mật khẩu (nhập ẩn). Mật khẩu phải đạt chính sách mật khẩu.
 * Có thể chạy không tương tác bằng biến môi trường ADMIN_USERNAME / ADMIN_DISPLAY_NAME / ADMIN_PASSWORD.
 */
import { createInterface } from 'node:readline/promises';
import { checkPasswordStrength, usernameField } from '@kpi/shared';
import { loadEnv } from '../src/config/env.js';
import { hashPassword } from '../src/lib/password.js';
import { createPrismaClient } from '../src/lib/prisma.js';

/** Đọc một dòng từ bàn phím không hiển thị ký tự (mật khẩu). */
function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(question);
    if (!stdin.isTTY) {
      stdin.once('data', (d) => resolve(String(d).trim()));
      return;
    }
    let value = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (ch: string) => {
      if (ch === '\r' || ch === '\n' || ch === '\u0004') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.off('data', onData);
        process.stdout.write('\n');
        resolve(value);
      } else if (ch === '\u0003') {
        process.exit(130);
      } else if (ch === '\u0008' || ch === '\u007f') {
        value = value.slice(0, -1);
      } else {
        value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

async function main(): Promise<number> {
  const env = loadEnv();
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const usernameRaw =
    process.env['ADMIN_USERNAME'] ?? (await rl.question('Tên đăng nhập quản trị: '));
  const displayName =
    process.env['ADMIN_DISPLAY_NAME'] ??
    ((await rl.question('Tên hiển thị (Enter = "Quản trị hệ thống"): ')) || 'Quản trị hệ thống');
  rl.close();

  const parsed = usernameField.safeParse(usernameRaw);
  if (!parsed.success) {
    console.error(`✗ ${parsed.error.issues[0]?.message}`);
    return 1;
  }
  const username = parsed.data;
  const password = process.env['ADMIN_PASSWORD'] ?? (await promptHidden('Mật khẩu: '));
  const issues = checkPasswordStrength(password, username);
  if (issues.length > 0) {
    console.error(`✗ Mật khẩu chưa đạt yêu cầu:\n  - ${issues.join('\n  - ')}`);
    return 1;
  }
  if (!process.env['ADMIN_PASSWORD'] && (await promptHidden('Nhập lại mật khẩu: ')) !== password) {
    console.error('✗ Mật khẩu nhập lại không khớp');
    return 1;
  }

  const db = createPrismaClient(env.DATABASE_URL);
  try {
    if (await db.user.findUnique({ where: { username } })) {
      console.error(`✗ Tên đăng nhập "${username}" đã tồn tại`);
      return 1;
    }
    const role = await db.role.findUnique({ where: { code: 'SUPER_ADMIN' } });
    if (!role) {
      console.error(
        '✗ Chưa có vai trò SUPER_ADMIN — chạy `npm run db:seed` hoặc seed danh mục quyền trước',
      );
      return 1;
    }
    const user = await db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          username,
          displayName,
          passwordHash: await hashPassword(password),
          mustChangePassword: false,
        },
      });
      await tx.userRole.create({
        data: { userId: created.id, roleId: role.id, scopeType: 'NONE' },
      });
      await tx.auditLog.create({
        data: {
          action: 'user.create_admin_cli',
          entityType: 'user',
          entityId: created.id,
          result: 'SUCCESS',
        },
      });
      return created;
    });
    console.log(`✓ Đã tạo tài khoản quản trị "${user.username}"`);
    return 0;
  } finally {
    await db.$disconnect();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
