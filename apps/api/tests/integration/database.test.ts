/**
 * Kiểm thử với PostgreSQL THẬT trên database kiểm thử (TEST_DATABASE_URL).
 * Mọi thao tác ghi đều nằm trong transaction và được ROLLBACK — không để lại dữ liệu.
 * Yêu cầu: `npm run db:up` và `npm run db:migrate:test`. Tự bỏ qua nếu không có TEST_DATABASE_URL.
 */
import path from 'node:path';
import { config as loadDotenv } from 'dotenv';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkDatabase, createPrismaClient, type Db } from '../../src/lib/prisma.js';

loadDotenv({ path: path.resolve(import.meta.dirname, '../../../../.env'), quiet: true });
const TEST_URL = process.env['TEST_DATABASE_URL'];

describe.skipIf(!TEST_URL)('PostgreSQL (web_kpi_test)', () => {
  let db: Db;
  let client: pg.Client;

  beforeAll(async () => {
    if (TEST_URL === process.env['DATABASE_URL'])
      throw new Error('TEST_DATABASE_URL trùng DATABASE_URL');
    db = createPrismaClient(TEST_URL!);
    client = new pg.Client({ connectionString: TEST_URL });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
    await db?.$disconnect();
  });

  it('kết nối được và đã áp migration', async () => {
    const result = await checkDatabase(db);
    expect(result.ok).toBe(true);
    const { rows } = await client.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL',
    );
    expect(Number(rows[0]?.n)).toBeGreaterThan(0);
  });

  /** Chạy fn trong transaction rồi luôn ROLLBACK. */
  async function inRollback(fn: () => Promise<void>): Promise<void> {
    await client.query('BEGIN');
    try {
      await fn();
    } finally {
      await client.query('ROLLBACK');
    }
  }

  it('audit_logs chỉ cho phép ghi thêm (chặn UPDATE/DELETE)', async () => {
    await inRollback(async () => {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO audit_logs (action, entity_type, result) VALUES ('test.write', 'test', 'SUCCESS') RETURNING id`,
      );
      const id = rows[0]!.id;
      await client.query('SAVEPOINT s1');
      await expect(
        client.query(`UPDATE audit_logs SET action = 'x' WHERE id = $1`, [id]),
      ).rejects.toThrow(/append-only/);
      await client.query('ROLLBACK TO SAVEPOINT s1');
      await expect(client.query('DELETE FROM audit_logs WHERE id = $1', [id])).rejects.toThrow(
        /append-only/,
      );
    });
  });

  it('mỗi cán bộ chỉ có 1 phân công chính đang hiệu lực', async () => {
    await inRollback(async () => {
      const unit = await client.query<{ id: string }>(
        `INSERT INTO organizational_units (id, code, name, type, updated_at)
         VALUES (gen_random_uuid(), 'T-UNIT', 'Đơn vị test', 'DEPARTMENT', now()) RETURNING id`,
      );
      const pos = await client.query<{ id: string }>(
        `INSERT INTO positions (id, code, name, level, is_leadership, kpi_profile, updated_at)
         VALUES (gen_random_uuid(), 'T-POS', 'Chức vụ test', 5, false, 'STAFF', now()) RETURNING id`,
      );
      const emp = await client.query<{ id: string }>(
        `INSERT INTO employees (id, employee_code, full_name, updated_at)
         VALUES (gen_random_uuid(), 'T-EMP', 'Cán bộ test', now()) RETURNING id`,
      );
      const insertAssignment = (start: string) =>
        client.query(
          `INSERT INTO employee_assignments (id, employee_id, unit_id, position_id, start_date, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, now())`,
          [emp.rows[0]!.id, unit.rows[0]!.id, pos.rows[0]!.id, start],
        );
      await insertAssignment('2026-01-01');
      await expect(insertAssignment('2026-06-01')).rejects.toThrow(/phân công chính đang hiệu lực/);
    });
  });

  it('CHECK: cấp chức vụ phải từ 1 đến 5', async () => {
    await inRollback(async () => {
      await expect(
        client.query(
          `INSERT INTO positions (id, code, name, level, is_leadership, kpi_profile, updated_at)
           VALUES (gen_random_uuid(), 'T-BAD', 'Sai cấp', 9, false, 'STAFF', now())`,
        ),
      ).rejects.toThrow(/positions_level_check/);
    });
  });
});
