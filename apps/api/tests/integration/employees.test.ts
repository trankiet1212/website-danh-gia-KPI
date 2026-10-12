/**
 * Hồ sơ cán bộ: thêm, trùng dữ liệu, dữ liệu sai, cập nhật có kiểm soát phiên bản, điều chuyển và lịch sử,
 * kết thúc công tác, tìm kiếm/lọc/phân trang/sắp xếp phía server.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../../src/lib/prisma.js';
import {
  TEST_DATABASE_URL,
  createFixture,
  createTestDb,
  login,
  type Fixture,
  type Session,
} from '../helpers/fixture.js';
import { buildDbTestApp } from '../helpers/test-app.js';

describe.skipIf(!TEST_DATABASE_URL)('Hồ sơ cán bộ', () => {
  let db: Db;
  let fx: Fixture;
  let officer: Session;
  let app: ReturnType<typeof buildDbTestApp>;

  beforeAll(async () => {
    db = createTestDb();
    fx = await createFixture(db);
    app = buildDbTestApp(db);
    officer = await login(app, fx.users.officer);
  });
  afterAll(async () => db?.$disconnect());

  const newEmployee = (code: string, overrides: Record<string, unknown> = {}) => ({
    employeeCode: code,
    fullName: '  Nguyễn   Văn   Thử  ',
    email: '',
    phone: '0912 345 678',
    dateOfBirth: '1990-05-20',
    assignment: {
      unitId: fx.units.A,
      positionId: fx.positions.staff,
      jobPositionId: fx.jobPositionId,
      managerEmployeeId: fx.employees.headA,
      startDate: '2026-02-01',
      duties: 'Theo dõi địa bàn',
    },
    ...overrides,
  });

  describe('Thêm hồ sơ', () => {
    it('tạo hồ sơ kèm phân công đầu tiên; chuẩn hóa dữ liệu nhập', async () => {
      const res = await officer.post('/api/v1/employees', newEmployee(`new-${fx.sfx}`));
      expect(res.status).toBe(201);
      const e = res.body.data;
      expect(e.employeeCode).toBe(`NEW-${fx.sfx}`);
      expect(e.fullName).toBe('Nguyễn Văn Thử');
      expect(e.phone).toBe('0912345678');
      expect(e.email).toBeNull();
      expect(e.current.unit.id).toBe(fx.units.A);
      expect(e.current.manager.id).toBe(fx.employees.headA);
      expect(e.assignments).toHaveLength(1);
      const audit = await db.auditLog.findFirst({
        where: { action: 'employee.create', entityId: e.id },
      });
      expect(audit).not.toBeNull();
    });

    it('trùng mã cán bộ (không phân biệt hoa thường) → 409 DUPLICATE', async () => {
      const res = await officer.post(
        '/api/v1/employees',
        newEmployee(`NEW-${fx.sfx}`.toLowerCase()),
      );
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('DUPLICATE');
    });

    it('trùng email với cán bộ khác → 409', async () => {
      const existing = await db.employee.findUniqueOrThrow({ where: { id: fx.employees.headA } });
      const res = await officer.post(
        '/api/v1/employees',
        newEmployee(`MAIL-${fx.sfx}`, { email: existing.email!.toUpperCase() }),
      );
      expect(res.status).toBe(409);
    });

    it('dữ liệu sai → 400 kèm lỗi từng trường', async () => {
      const res = await officer.post('/api/v1/employees', {
        employeeCode: 'mã có dấu!',
        fullName: '   ',
        email: 'khong-phai-email',
        dateOfBirth: '2026-02-30',
        assignment: { unitId: 'x', positionId: fx.positions.staff, startDate: '01/02/2026' },
      });
      expect(res.status).toBe(400);
      const paths = res.body.error.details.map((d: { path: string }) => d.path);
      expect(paths).toEqual(
        expect.arrayContaining([
          'employeeCode',
          'fullName',
          'email',
          'dateOfBirth',
          'assignment.unitId',
          'assignment.startDate',
        ]),
      );
    });

    it('tham chiếu không hợp lệ: chức vụ không tồn tại → 422', async () => {
      const res = await officer.post(
        '/api/v1/employees',
        newEmployee(`REF-${fx.sfx}`, {
          assignment: {
            unitId: fx.units.A,
            positionId: '0190f0f0-0000-7000-8000-000000000000',
            startDate: '2026-01-01',
          },
        }),
      );
      expect(res.status).toBe(422);
    });
  });

  describe('Cập nhật có kiểm soát phiên bản', () => {
    it('phiên bản cũ → 409 CONFLICT_VERSION; phiên bản đúng → cập nhật và tăng phiên bản', async () => {
      const before = (await officer.get(`/api/v1/employees/${fx.employees.staffA2}`)).body.data;
      const ok = await officer.patch(`/api/v1/employees/${fx.employees.staffA2}`, {
        fullName: before.fullName,
        govPosition: 'Chuyên viên chính',
        version: before.version,
      });
      expect(ok.status).toBe(200);
      expect(ok.body.data.version).toBe(before.version + 1);
      const stale = await officer.patch(`/api/v1/employees/${fx.employees.staffA2}`, {
        fullName: before.fullName,
        version: before.version,
      });
      expect(stale.status).toBe(409);
      expect(stale.body.error.code).toBe('CONFLICT_VERSION');
    });
  });

  describe('Điều chuyển và lịch sử', () => {
    it('điều chuyển sang phòng B: đóng phân công cũ (ngày trước ngày bắt đầu mới), tạo phân công mới', async () => {
      const before = (await officer.get(`/api/v1/employees/${fx.employees.staffA1}`)).body.data;
      const res = await officer.post(`/api/v1/employees/${fx.employees.staffA1}/transfer`, {
        unitId: fx.units.B,
        positionId: fx.positions.staff,
        jobPositionId: fx.jobPositionId,
        managerEmployeeId: fx.employees.headB,
        startDate: '2026-07-01',
        decisionRef: '123/QĐ-BTCTU',
        version: before.version,
      });
      expect(res.status).toBe(200);
      const e = res.body.data;
      expect(e.current.unit.id).toBe(fx.units.B);
      expect(e.assignments).toHaveLength(2);
      const [latest, previous] = e.assignments;
      expect(latest).toMatchObject({
        startDate: '2026-07-01',
        endDate: null,
        decisionRef: '123/QĐ-BTCTU',
      });
      expect(previous).toMatchObject({ startDate: '2026-01-01', endDate: '2026-06-30' });
    });

    it('sau điều chuyển, phạm vi dữ liệu thay đổi theo phòng mới', async () => {
      const headA = await login(app, fx.users.headA);
      const headB = await login(app, fx.users.headB);
      expect((await headA.get(`/api/v1/employees/${fx.employees.staffA1}`)).status).toBe(404);
      expect((await headB.get(`/api/v1/employees/${fx.employees.staffA1}`)).status).toBe(200);
    });

    it('ngày bắt đầu không sau phân công hiện tại → 422', async () => {
      const cur = (await officer.get(`/api/v1/employees/${fx.employees.staffA1}`)).body.data;
      const res = await officer.post(`/api/v1/employees/${fx.employees.staffA1}/transfer`, {
        unitId: fx.units.A,
        positionId: fx.positions.staff,
        startDate: '2026-07-01',
        version: cur.version,
      });
      expect(res.status).toBe(422);
    });

    it('chọn chính mình làm cấp quản lý → 422', async () => {
      const cur = (await officer.get(`/api/v1/employees/${fx.employees.staffA2}`)).body.data;
      const res = await officer.post(`/api/v1/employees/${fx.employees.staffA2}/transfer`, {
        unitId: fx.units.A,
        positionId: fx.positions.deputy,
        managerEmployeeId: fx.employees.staffA2,
        startDate: '2026-08-01',
        version: cur.version,
      });
      expect(res.status).toBe(422);
    });

    it('phân công mới giống hệt phân công hiện tại → 422', async () => {
      const cur = (await officer.get(`/api/v1/employees/${fx.employees.headB}`)).body.data;
      const res = await officer.post(`/api/v1/employees/${fx.employees.headB}/transfer`, {
        unitId: fx.units.B,
        positionId: fx.positions.head,
        jobPositionId: fx.jobPositionId,
        startDate: '2026-09-01',
        version: cur.version,
      });
      expect(res.status).toBe(422);
    });

    it('Phó Trưởng ban phụ trách phòng A (UNITS) không được điều chuyển (chỉ xem)', async () => {
      const ptb = await login(app, fx.users.ptbA);
      const cur = (await ptb.get(`/api/v1/employees/${fx.employees.staffA2}`)).body.data;
      const res = await ptb.post(`/api/v1/employees/${fx.employees.staffA2}/transfer`, {
        unitId: fx.units.A,
        positionId: fx.positions.deputy,
        startDate: '2026-08-01',
        version: cur.version,
      });
      expect(res.status).toBe(403);
    });
  });

  describe('Kết thúc công tác', () => {
    it('nghỉ hưu: đóng phân công, ẩn khỏi danh sách mặc định, khóa tài khoản liên kết', async () => {
      const cur = (await officer.get(`/api/v1/employees/${fx.employees.deputyA}`)).body.data;
      const res = await officer.post(`/api/v1/employees/${fx.employees.deputyA}/end-employment`, {
        status: 'RETIRED',
        endDate: '2026-09-30',
        reason: 'Nghỉ hưu theo chế độ',
        version: cur.version,
      });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('RETIRED');
      expect(res.body.data.current).toBeNull();
      expect(res.body.data.can).toEqual({ edit: true, transfer: false, archive: false });

      const list = await officer.get(`/api/v1/employees?q=${fx.sfx}&pageSize=100`);
      expect(list.body.data.map((e: { id: string }) => e.id)).not.toContain(fx.employees.deputyA);
      const withInactive = await officer.get(
        `/api/v1/employees?q=${fx.sfx}&includeInactive=true&pageSize=100`,
      );
      expect(withInactive.body.data.map((e: { id: string }) => e.id)).toContain(
        fx.employees.deputyA,
      );

      const user = await db.user.findUniqueOrThrow({ where: { username: fx.users.deputyA } });
      expect(user.status).toBe('DISABLED');
    });

    it('hồ sơ không xóa cứng — vẫn tra cứu được lịch sử', async () => {
      const res = await officer.get(`/api/v1/employees/${fx.employees.deputyA}`);
      expect(res.status).toBe(200);
      expect(res.body.data.assignments[0].endDate).toBe('2026-09-30');
    });
  });

  describe('Tìm kiếm, lọc, phân trang, sắp xếp phía server', () => {
    it('phân trang trả meta đúng', async () => {
      const page1 = await officer.get(
        `/api/v1/employees?q=${fx.sfx}&pageSize=2&page=1&sort=employeeCode:asc`,
      );
      const page2 = await officer.get(
        `/api/v1/employees?q=${fx.sfx}&pageSize=2&page=2&sort=employeeCode:asc`,
      );
      expect(page1.body.meta).toMatchObject({ page: 1, pageSize: 2 });
      expect(page1.body.meta.total).toBeGreaterThanOrEqual(5);
      expect(page1.body.data).toHaveLength(2);
      const codes = [...page1.body.data, ...page2.body.data].map(
        (e: { employeeCode: string }) => e.employeeCode,
      );
      expect(codes).toEqual([...codes].sort());
      expect(new Set(codes).size).toBe(4);
    });

    it('sắp xếp giảm dần', async () => {
      const res = await officer.get(
        `/api/v1/employees?q=${fx.sfx}&sort=employeeCode:desc&pageSize=100`,
      );
      const codes = res.body.data.map((e: { employeeCode: string }) => e.employeeCode);
      expect(codes).toEqual([...codes].sort().reverse());
    });

    it('lọc theo đơn vị và chức vụ', async () => {
      const res = await officer.get(
        `/api/v1/employees?q=${fx.sfx}&unitId=${fx.units.B}&positionId=${fx.positions.head}`,
      );
      expect(res.body.data.map((e: { id: string }) => e.id)).toEqual([fx.employees.headB]);
    });

    it('tìm theo mã (không phân biệt hoa thường)', async () => {
      const res = await officer.get(`/api/v1/employees?q=e-heada-${fx.sfx.toLowerCase()}`);
      expect(res.body.data.map((e: { id: string }) => e.id)).toEqual([fx.employees.headA]);
    });

    it('tham số không hợp lệ → 400', async () => {
      expect((await officer.get('/api/v1/employees?sort=matKhau:asc')).status).toBe(400);
      expect((await officer.get('/api/v1/employees?pageSize=1000')).status).toBe(400);
      expect((await officer.get('/api/v1/employees?unitId=abc')).status).toBe(400);
    });
  });
});
