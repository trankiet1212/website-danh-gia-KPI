/**
 * Seed dữ liệu DEMO — chạy:  npm run db:seed   (sau `npm run db:migrate`)
 *
 * - Idempotent: chạy lại nhiều lần không tạo trùng (upsert theo mã).
 * - Không xóa dữ liệu nào.
 * - Tài khoản DEMO chỉ được tạo khi có DEMO_USER_PASSWORD (không có mật khẩu mặc định trong mã nguồn).
 *   Tài khoản quản trị THẬT tạo bằng `npm run create-admin`.
 * - Họ tên cán bộ là TÊN GIẢ (is_demo = true); cấu trúc theo sơ đồ phân công thật.
 * - Bị chặn khi NODE_ENV=production hoặc SEED_DEMO khác "true".
 */
import { readFileSync } from 'node:fs';
import { PERMISSIONS, ROLE_CODES } from '@kpi/shared';
import { loadEnv } from '../../src/config/env.js';
import { createPrismaClient, type Db } from '../../src/lib/prisma.js';
import type { PeriodType } from '../../src/generated/prisma/client.js';
import { DEMO_USERS, STAFF_DEMO_USERS, seedDemoUsers } from './demo-users.js';
import { seedJobPositionWorkItems } from './job-position-work-items.js';
import { seedKpiDemo } from './kpi-demo.js';
import { seedPermissionsAndRoles } from './rbac.js';
import { JOB_POSITIONS, POSITIONS, UNITS } from './reference-data.js';

type Tx = Parameters<Parameters<Db['$transaction']>[0]>[0];

interface OrgPositionSeed {
  key: string;
  level: number;
  unit: string;
  position: string;
  jobPosition: string;
  managerKey: string | null;
  supervisesUnit: string | null;
  vacant: boolean;
  demoName: string | null;
  duties: string;
  kpiOkr: string;
}

const DEMO_YEAR = 2026;
/** Ngày bắt đầu phân công giả định cho dữ liệu demo. */
const DEMO_ASSIGNMENT_START = utcDate(DEMO_YEAR, 1, 1);

function utcDate(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}
function lastDayOfMonth(y: number, m: number): Date {
  return new Date(Date.UTC(y, m, 0));
}

async function seedOrganization(tx: Tx): Promise<Map<string, string>> {
  const unitIdByCode = new Map<string, string>();
  for (const u of UNITS) {
    const parentId = u.parentCode ? unitIdByCode.get(u.parentCode)! : null;
    const unit = await tx.organizationalUnit.upsert({
      where: { code: u.code },
      update: {
        name: u.name,
        shortName: u.shortName,
        type: u.type,
        parentId,
        sortOrder: u.sortOrder,
      },
      create: {
        code: u.code,
        name: u.name,
        shortName: u.shortName,
        type: u.type,
        parentId,
        sortOrder: u.sortOrder,
      },
    });
    unitIdByCode.set(u.code, unit.id);
  }
  for (const p of POSITIONS) {
    await tx.position.upsert({ where: { code: p.code }, update: { ...p }, create: { ...p } });
  }
  for (const j of JOB_POSITIONS) {
    await tx.jobPosition.upsert({
      where: { code: j.code },
      update: { name: j.name, group: j.group, isProvisional: true },
      create: {
        ...j,
        isProvisional: true,
        description: 'Danh mục tạm cho môi trường demo — chờ danh mục VTVL chính thức.',
      },
    });
  }
  return unitIdByCode;
}

async function seedEmployees(tx: Tx, unitIdByCode: Map<string, string>): Promise<number> {
  const file = new URL('./data/org-structure.json', import.meta.url);
  const { positions } = JSON.parse(readFileSync(file, 'utf8')) as { positions: OrgPositionSeed[] };
  const positionIdByCode = new Map((await tx.position.findMany()).map((p) => [p.code, p.id]));
  const jobIdByCode = new Map((await tx.jobPosition.findMany()).map((j) => [j.code, j.id]));

  // Lượt 1: hồ sơ cán bộ (bỏ qua vị trí trống)
  const employeeIdByKey = new Map<string, string>();
  for (const p of positions) {
    if (p.vacant || !p.demoName) continue;
    const employeeCode = `DEMO-${p.key}`;
    const emp = await tx.employee.upsert({
      where: { employeeCode },
      update: { fullName: p.demoName, isDemo: true },
      create: { employeeCode, fullName: p.demoName, isDemo: true },
    });
    employeeIdByKey.set(p.key, emp.id);
  }

  // Lượt 2: phân công chính đang hiệu lực + lãnh đạo Ban phụ trách đơn vị
  for (const p of positions) {
    const employeeId = employeeIdByKey.get(p.key);
    if (!employeeId) continue;
    const data = {
      unitId: unitIdByCode.get(p.unit)!,
      positionId: positionIdByCode.get(p.position)!,
      jobPositionId: jobIdByCode.get(p.jobPosition) ?? null,
      managerEmployeeId: p.managerKey ? (employeeIdByKey.get(p.managerKey) ?? null) : null,
      duties: p.duties || null,
      note: 'DEMO',
    };
    const active = await tx.employeeAssignment.findFirst({
      where: { employeeId, isPrimary: true, endDate: null },
    });
    if (active) {
      await tx.employeeAssignment.update({ where: { id: active.id }, data });
    } else {
      await tx.employeeAssignment.create({
        data: { ...data, employeeId, isPrimary: true, startDate: DEMO_ASSIGNMENT_START },
      });
    }

    if (p.supervisesUnit) {
      const unitId = unitIdByCode.get(p.supervisesUnit)!;
      const existing = await tx.unitSupervision.findFirst({
        where: { employeeId, unitId, endDate: null },
      });
      if (!existing) {
        await tx.unitSupervision.create({
          data: { employeeId, unitId, startDate: DEMO_ASSIGNMENT_START },
        });
      }
    }
  }
  return employeeIdByKey.size;
}

/** Cây kỳ đánh giá của một năm: Năm → 6 tháng → Quý → Tháng. Quý IV không xếp loại riêng. */
async function seedPeriods(tx: Tx, year: number): Promise<number> {
  let count = 0;
  const upsert = async (
    type: PeriodType,
    seq: number,
    code: string,
    name: string,
    start: Date,
    end: Date,
    parentId: string | null,
    isRated = true,
  ) => {
    count++;
    const row = await tx.evaluationPeriod.upsert({
      where: { code },
      update: { name, startDate: start, endDate: end, parentId, isRated },
      create: {
        code,
        name,
        type,
        year,
        seq,
        startDate: start,
        endDate: end,
        parentId,
        isRated,
        isDemo: true,
      },
    });
    return row.id;
  };

  const yearId = await upsert(
    'YEAR',
    1,
    `${year}`,
    `Năm ${year}`,
    utcDate(year, 1, 1),
    utcDate(year, 12, 31),
    null,
  );
  const roman = ['I', 'II', 'III', 'IV'];
  for (let h = 1; h <= 2; h++) {
    const halfId = await upsert(
      'HALF_YEAR',
      h,
      `${year}-H${h}`,
      `${h === 1 ? '6 tháng đầu' : '6 tháng cuối'} năm ${year}`,
      utcDate(year, h === 1 ? 1 : 7, 1),
      lastDayOfMonth(year, h === 1 ? 6 : 12),
      yearId,
    );
    for (let q = h * 2 - 1; q <= h * 2; q++) {
      // [QĐ39] Điều 14, [HD05] III.6: Quý IV không xếp loại riêng, kết hợp vào xếp loại cuối năm.
      const quarterId = await upsert(
        'QUARTER',
        q,
        `${year}-Q${q}`,
        `Quý ${roman[q - 1]}/${year}`,
        utcDate(year, q * 3 - 2, 1),
        lastDayOfMonth(year, q * 3),
        halfId,
        q !== 4,
      );
      for (let m = q * 3 - 2; m <= q * 3; m++) {
        await upsert(
          'MONTH',
          m,
          `${year}-M${String(m).padStart(2, '0')}`,
          `Tháng ${m}/${year}`,
          utcDate(year, m, 1),
          lastDayOfMonth(year, m),
          quarterId,
        );
      }
    }
  }
  return count;
}

async function main(): Promise<void> {
  const env = loadEnv();
  if (env.NODE_ENV === 'production') {
    throw new Error('Từ chối seed dữ liệu DEMO khi NODE_ENV=production.');
  }
  if (process.env['SEED_DEMO'] !== 'true') {
    throw new Error('SEED_DEMO chưa bật. Đặt SEED_DEMO=true trong .env nếu muốn nạp dữ liệu demo.');
  }

  const db = createPrismaClient(env.DATABASE_URL);
  try {
    const summary = await db.$transaction(
      async (tx) => {
        await seedPermissionsAndRoles(tx);
        const unitIdByCode = await seedOrganization(tx);
        const employees = await seedEmployees(tx, unitIdByCode);
        const periods = await seedPeriods(tx, DEMO_YEAR);
        const demoPassword = process.env['DEMO_USER_PASSWORD'];
        const users = demoPassword ? await seedDemoUsers(tx, demoPassword) : 0;
        const kpi = await seedKpiDemo(tx, DEMO_YEAR);
        const workItems = await seedJobPositionWorkItems(tx);
        return { employees, periods, users, kpi, workItems };
      },
      { timeout: 60_000 },
    );
    console.log('✓ Seed DEMO hoàn tất:');
    console.log(
      `  - ${Object.keys(PERMISSIONS).length} quyền, ${ROLE_CODES.length} vai trò hệ thống`,
    );
    console.log(
      `  - ${UNITS.length} đơn vị, ${POSITIONS.length} chức vụ, ${JOB_POSITIONS.length} VTVL (tạm)`,
    );
    console.log(`  - ${summary.employees} cán bộ DEMO (tên giả) kèm phân công`);
    console.log(`  - +${summary.workItems} mục danh mục SP/CV phân theo VTVL (mặc định, tạm)`);
    console.log(`  - ${summary.periods} kỳ đánh giá năm ${DEMO_YEAR}`);
    console.log(
      `  - Bộ quy tắc RS-CANHAN v1 (CHỜ XÁC NHẬN), danh mục SP/CV (+${summary.kpi.catalogItems} mục mới), ${summary.kpi.criteriaSets} bộ tiêu chí (ĐÃ TRÌNH)`,
    );
    console.log(
      `  - +${summary.kpi.objectives} mục tiêu OKR DEMO, +${summary.kpi.evaluations} hồ sơ đánh giá DEMO (Quý II/${DEMO_YEAR})`,
    );
    if (summary.users > 0) {
      console.log(
        `  - ${summary.users} tài khoản DEMO (mật khẩu = DEMO_USER_PASSWORD trong .env):`,
      );
      for (const u of DEMO_USERS) console.log(`      ${u.username.padEnd(10)} ${u.description}`);
      console.log(
        `      … và ${STAFF_DEMO_USERS.length} tài khoản cho các cán bộ còn lại (danh sách trong README)`,
      );
    } else {
      console.log('  - Không tạo tài khoản DEMO (chưa đặt DEMO_USER_PASSWORD)');
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error('✗ Seed thất bại:', err instanceof Error ? err.message : err);
  process.exit(1);
});
