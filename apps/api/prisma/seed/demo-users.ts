/**
 * Tài khoản DEMO — 8 tài khoản tiêu biểu (mỗi vai trò/phạm vi một tài khoản để thử phân quyền,
 * truy cập chéo phòng ban) + tài khoản cho mọi cán bộ DEMO còn lại (đủ 38 cán bộ trong sơ đồ).
 * Mật khẩu lấy từ biến môi trường DEMO_USER_PASSWORD (không viết cứng trong mã nguồn).
 * Tài khoản đã tồn tại sẽ KHÔNG bị đổi mật khẩu khi chạy lại seed.
 */
import { checkPasswordStrength, type ScopeType } from '@kpi/shared';
import type { Db } from '../../src/lib/prisma.js';
import { hashPassword } from '../../src/lib/password.js';

type Tx = Parameters<Parameters<Db['$transaction']>[0]>[0];

interface DemoGrant {
  role: string;
  scope: ScopeType;
  /** Mã đơn vị khi scope = UNITS */
  units?: string[];
}

interface DemoUser {
  username: string;
  /** Khóa vị trí trong org-structure.json (DEMO-Pxx); null = tài khoản không gắn cán bộ */
  employeeKey: string | null;
  displayName: string | null;
  grants: DemoGrant[];
  description: string;
}

export const DEMO_USERS: DemoUser[] = [
  {
    username: 'quantri',
    employeeKey: null,
    displayName: 'Quản trị hệ thống (DEMO)',
    grants: [{ role: 'SUPER_ADMIN', scope: 'NONE' }],
    description: 'Quản trị tài khoản, phân quyền, danh mục — không xem dữ liệu nghiệp vụ',
  },
  {
    username: 'truongban',
    employeeKey: 'P01',
    displayName: null,
    grants: [
      { role: 'AGENCY_LEADER', scope: 'ALL' },
      { role: 'EMPLOYEE', scope: 'SELF' },
    ],
    description: 'Trưởng ban — xem toàn cơ quan',
  },
  {
    username: 'ptb.tccb',
    employeeKey: 'P03',
    displayName: null,
    grants: [
      { role: 'AGENCY_LEADER', scope: 'UNITS', units: ['TCCB'] },
      { role: 'EMPLOYEE', scope: 'SELF' },
    ],
    description: 'Phó Trưởng ban phụ trách Phòng TCCB — chỉ xem Phòng TCCB',
  },
  {
    username: 'tp.tccb',
    employeeKey: 'P07',
    displayName: null,
    grants: [
      { role: 'UNIT_LEADER', scope: 'OWN_UNIT' },
      { role: 'EMPLOYEE', scope: 'SELF' },
    ],
    description: 'Trưởng phòng TCCB — xem cán bộ trong phòng',
  },
  {
    username: 'pp.tccb',
    employeeKey: 'P13',
    displayName: null,
    grants: [
      { role: 'UNIT_LEADER', scope: 'MANAGED' },
      { role: 'EMPLOYEE', scope: 'SELF' },
    ],
    description: 'Phó phòng TCCB — chỉ xem cán bộ do mình quản lý trực tiếp',
  },
  {
    username: 'cv.tccb',
    employeeKey: 'P20',
    displayName: null,
    grants: [{ role: 'EMPLOYEE', scope: 'SELF' }],
    description: 'Chuyên viên Phòng TCCB — chỉ xem hồ sơ bản thân',
  },
  {
    username: 'tp.tcddv',
    employeeKey: 'P09',
    displayName: null,
    grants: [
      { role: 'UNIT_LEADER', scope: 'OWN_UNIT' },
      { role: 'EMPLOYEE', scope: 'SELF' },
    ],
    description: 'Trưởng phòng TCĐ-ĐV — xem cán bộ trong phòng (dùng thử truy cập chéo)',
  },
  {
    username: 'tonghop',
    employeeKey: 'P28',
    displayName: null,
    grants: [
      { role: 'EVAL_OFFICER', scope: 'ALL' },
      { role: 'EMPLOYEE', scope: 'SELF' },
    ],
    description: 'Chuyên viên tổng hợp đánh giá — quản lý hồ sơ cán bộ toàn cơ quan',
  },
];

const SELF: DemoGrant = { role: 'EMPLOYEE', scope: 'SELF' };
const OWN_UNIT: DemoGrant = { role: 'UNIT_LEADER', scope: 'OWN_UNIT' };
const MANAGED: DemoGrant = { role: 'UNIT_LEADER', scope: 'MANAGED' };

/**
 * Tài khoản cho các cán bộ DEMO còn lại. Phạm vi theo chức vụ (docs/05 §4.1):
 * PTB phụ trách → các phòng phụ trách; Trưởng phòng/Chánh VP → cả phòng;
 * Phó phòng/Phó CVP → cấp dưới trực tiếp; công chức → bản thân.
 */
export const STAFF_DEMO_USERS: DemoUser[] = [
  {
    username: 'ptb.thuongtruc',
    employeeKey: 'P02',
    displayName: null,
    grants: [{ role: 'AGENCY_LEADER', scope: 'ALL' }, SELF],
    description: 'Phó Trưởng ban thường trực — toàn cơ quan (giả định DEMO, docs/09 #32)',
  },
  {
    username: 'ptb.vp',
    employeeKey: 'P04',
    displayName: null,
    grants: [{ role: 'AGENCY_LEADER', scope: 'UNITS', units: ['VP'] }, SELF],
    description: 'Phó Trưởng ban phụ trách Văn phòng',
  },
  {
    username: 'ptb.tcddv',
    employeeKey: 'P05',
    displayName: null,
    grants: [{ role: 'AGENCY_LEADER', scope: 'UNITS', units: ['TCDDV'] }, SELF],
    description: 'Phó Trưởng ban phụ trách Phòng TCĐ-ĐV',
  },
  {
    username: 'ptb.bvctnb',
    employeeKey: 'P06',
    displayName: null,
    grants: [{ role: 'AGENCY_LEADER', scope: 'UNITS', units: ['BVCTNB'] }, SELF],
    description: 'Phó Trưởng ban phụ trách Phòng BVCTNB',
  },
  {
    username: 'cvp',
    employeeKey: 'P08',
    displayName: null,
    grants: [OWN_UNIT, SELF],
    description: 'Chánh Văn phòng — cán bộ trong Văn phòng',
  },
  {
    username: 'tp.bvctnb',
    employeeKey: 'P10',
    displayName: null,
    grants: [OWN_UNIT, SELF],
    description: 'Trưởng phòng BVCTNB — cán bộ trong phòng',
  },
  {
    username: 'pp.tccb2',
    employeeKey: 'P11',
    displayName: null,
    grants: [MANAGED, SELF],
    description: 'Phó phòng TCCB — cấp dưới trực tiếp',
  },
  {
    username: 'pp.tccb3',
    employeeKey: 'P12',
    displayName: null,
    grants: [MANAGED, SELF],
    description: 'Phó phòng TCCB — cấp dưới trực tiếp',
  },
  {
    username: 'pcvp1',
    employeeKey: 'P14',
    displayName: null,
    grants: [MANAGED, SELF],
    description: 'Phó Chánh Văn phòng — cấp dưới trực tiếp',
  },
  {
    username: 'pcvp2',
    employeeKey: 'P15',
    displayName: null,
    grants: [MANAGED, SELF],
    description: 'Phó Chánh Văn phòng — cấp dưới trực tiếp',
  },
  {
    username: 'pcvp3',
    employeeKey: 'P16',
    displayName: null,
    grants: [MANAGED, SELF],
    description: 'Phó Chánh Văn phòng — cấp dưới trực tiếp',
  },
  {
    username: 'pp.tcddv1',
    employeeKey: 'P17',
    displayName: null,
    grants: [MANAGED, SELF],
    description: 'Phó phòng TCĐ-ĐV — cấp dưới trực tiếp',
  },
  {
    username: 'pp.tcddv2',
    employeeKey: 'P18',
    displayName: null,
    grants: [MANAGED, SELF],
    description: 'Phó phòng TCĐ-ĐV — cấp dưới trực tiếp',
  },
  {
    username: 'pp.tcddv3',
    employeeKey: 'P19',
    displayName: null,
    grants: [MANAGED, SELF],
    description: 'Phó phòng TCĐ-ĐV — cấp dưới trực tiếp',
  },
  {
    username: 'cv.tccb2',
    employeeKey: 'P21',
    displayName: null,
    grants: [SELF],
    description: 'Chuyên viên Phòng TCCB',
  },
  {
    username: 'cv.tccb3',
    employeeKey: 'P22',
    displayName: null,
    grants: [SELF],
    description: 'Chuyên viên Phòng TCCB',
  },
  {
    username: 'cv.tccb4',
    employeeKey: 'P23',
    displayName: null,
    grants: [SELF],
    description: 'Chuyên viên Phòng TCCB',
  },
  {
    username: 'cv.tccb5',
    employeeKey: 'P24',
    displayName: null,
    grants: [SELF],
    description: 'Chuyên viên Phòng TCCB',
  },
  {
    username: 'cv.tccb6',
    employeeKey: 'P25',
    displayName: null,
    grants: [SELF],
    description: 'Chuyên viên Phòng TCCB',
  },
  {
    username: 'cv.vp1',
    employeeKey: 'P26',
    displayName: null,
    grants: [SELF],
    description: 'Chuyên viên Văn phòng (kế toán)',
  },
  {
    username: 'cv.vp2',
    employeeKey: 'P27',
    displayName: null,
    grants: [SELF],
    description: 'Chuyên viên Văn phòng (quản trị công sở)',
  },
  {
    username: 'cv.vp3',
    employeeKey: 'P29',
    displayName: null,
    grants: [SELF],
    description: 'Chuyên viên Văn phòng (chính sách)',
  },
  {
    username: 'cv.vp4',
    employeeKey: 'P30',
    displayName: null,
    grants: [SELF],
    description: 'Chuyên viên Văn phòng (chính sách)',
  },
  {
    username: 'nv.vp1',
    employeeKey: 'P31',
    displayName: null,
    grants: [SELF],
    description: 'Nhân viên Văn phòng (CNTT)',
  },
  {
    username: 'vt.vp1',
    employeeKey: 'P32',
    displayName: null,
    grants: [SELF],
    description: 'Văn thư, lưu trữ — Văn phòng',
  },
  {
    username: 'vt.vp2',
    employeeKey: 'P33',
    displayName: null,
    grants: [SELF],
    description: 'Văn thư, lưu trữ — Văn phòng',
  },
  {
    username: 'cv.tcddv1',
    employeeKey: 'P35',
    displayName: null,
    grants: [SELF],
    description: 'Chuyên viên Phòng TCĐ-ĐV',
  },
  {
    username: 'cv.tcddv2',
    employeeKey: 'P36',
    displayName: null,
    grants: [SELF],
    description: 'Chuyên viên Phòng TCĐ-ĐV',
  },
  {
    username: 'cv.tcddv3',
    employeeKey: 'P37',
    displayName: null,
    grants: [SELF],
    description: 'Chuyên viên Phòng TCĐ-ĐV',
  },
  {
    username: 'cv.tcddv4',
    employeeKey: 'P38',
    displayName: null,
    grants: [SELF],
    description: 'Chuyên viên Phòng TCĐ-ĐV',
  },
  {
    username: 'cv.tcddv5',
    employeeKey: 'P39',
    displayName: null,
    grants: [SELF],
    description: 'Chuyên viên Phòng TCĐ-ĐV',
  },
];

export const ALL_DEMO_USERS: DemoUser[] = [...DEMO_USERS, ...STAFF_DEMO_USERS];

export async function seedDemoUsers(tx: Tx, password: string): Promise<number> {
  const issues = checkPasswordStrength(password);
  if (issues.length > 0) {
    throw new Error(`DEMO_USER_PASSWORD chưa đạt chính sách mật khẩu: ${issues.join('; ')}`);
  }
  const passwordHash = await hashPassword(password);
  const roleIdByCode = new Map((await tx.role.findMany()).map((r) => [r.code, r.id]));
  const unitIdByCode = new Map((await tx.organizationalUnit.findMany()).map((u) => [u.code, u.id]));

  for (const demo of ALL_DEMO_USERS) {
    const employee = demo.employeeKey
      ? await tx.employee.findUnique({ where: { employeeCode: `DEMO-${demo.employeeKey}` } })
      : null;
    if (demo.employeeKey && !employee) throw new Error(`Thiếu cán bộ DEMO-${demo.employeeKey}`);

    const user = await tx.user.upsert({
      where: { username: demo.username },
      update: { displayName: demo.displayName, employeeId: employee?.id ?? null },
      create: {
        username: demo.username,
        displayName: demo.displayName,
        employeeId: employee?.id ?? null,
        passwordHash,
        // Tài khoản demo không bắt đổi mật khẩu để dễ trình diễn; tài khoản thật luôn bắt đổi.
        mustChangePassword: false,
      },
    });

    for (const grant of demo.grants) {
      const roleId = roleIdByCode.get(grant.role)!;
      const exists = await tx.userRole.findUnique({
        where: { userId_roleId_scopeType: { userId: user.id, roleId, scopeType: grant.scope } },
      });
      if (exists) continue;
      await tx.userRole.create({
        data: {
          userId: user.id,
          roleId,
          scopeType: grant.scope,
          units: {
            create: (grant.units ?? []).map((code) => ({ unitId: unitIdByCode.get(code)! })),
          },
        },
      });
    }
  }
  return ALL_DEMO_USERS.length;
}
