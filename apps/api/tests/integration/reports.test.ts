/**
 * GĐ6 — Dashboard, báo cáo, xuất Excel/PDF, dự thảo văn bản, ràng buộc trạng thái kỳ.
 * Trọng tâm: số liệu và FILE XUẤT RA chỉ chứa dữ liệu người dùng được phép truy cập.
 *
 * Dữ liệu (một năm riêng cho bộ test):
 *   Quý 1: staffA1 ĐÃ DUYỆT 80 (HTTNV), staffA2 ĐÃ DUYỆT 60 (HTNV), deputyA ĐÃ THẨM ĐỊNH 75, staffB1 ĐÃ DUYỆT 95 (HTXS)
 *   Quý 2: staffA1 ĐÃ DUYỆT 90 (HTXS), staffA2 BẢN NHÁP · Quý 3: staffA1 ĐÃ NỘP 85
 *   headA: Quý 1–3 ĐÃ DUYỆT 70/80/90 theo bộ quy tắc tổng hợp năm WEIGHTED (trọng số 1/1/1)
 */
import ExcelJS from 'exceljs';
import type { Response } from 'superagent';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ReportDocument } from '@kpi/shared';
import { QD39_HD05_CONFIG } from '../../prisma/seed/rule-config-qd39-hd05.js';
import type { Db } from '../../src/lib/prisma.js';
import {
  TEST_DATABASE_URL,
  createFixture,
  createTestDb,
  login,
  type Fixture,
  type Session,
} from '../helpers/fixture.js';
import { createQuarter, createReportSetup, createYearTree } from '../helpers/kpi-fixture.js';
import { buildDbTestApp } from '../helpers/test-app.js';

const binary = (res: Response, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

/** Đọc file Excel xuất ra: tên trong cột "Họ và tên" của bảng chính + toàn bộ văn bản. */
async function readXlsx(buf: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.getWorksheet('Báo cáo')!;
  const texts: string[] = [];
  let headerRow = 0;
  let nameCol = 0;
  ws.eachRow((row, r) => {
    row.eachCell((cell, c) => {
      const v = String(cell.value ?? '');
      texts.push(v);
      if (v === 'Họ và tên' && !headerRow) {
        headerRow = r;
        nameCol = c;
      }
    });
  });
  const names: string[] = [];
  for (let r = headerRow + 1; nameCol > 0 && r <= ws.rowCount; r++) {
    const v = ws.getRow(r).getCell(nameCol).value;
    if (!v) break;
    names.push(String(v));
  }
  return { wb, texts, names };
}

describe.skipIf(!TEST_DATABASE_URL)('GĐ6 — Dashboard, báo cáo, xuất dữ liệu', () => {
  let db: Db;
  let fx: Fixture;
  let app: ReturnType<typeof buildDbTestApp>;
  let s: Record<'officer' | 'ptbA' | 'headA' | 'deputyA' | 'staffA1' | 'headB' | 'admin', Session>;
  let tree: Awaited<ReturnType<typeof createYearTree>>;
  let q1: string;
  let names: Record<string, string>;
  let staffA1Q1: string;

  beforeAll(async () => {
    db = createTestDb();
    fx = await createFixture(db);
    app = buildDbTestApp(db);
    const keys = ['officer', 'ptbA', 'headA', 'deputyA', 'staffA1', 'headB', 'admin'] as const;
    const sessions = await Promise.all(keys.map((k) => login(app, fx.users[k])));
    s = Object.fromEntries(keys.map((k, i) => [k, sessions[i]!])) as typeof s;

    tree = await createYearTree(db, fx);
    const [p1, p2, p3] = tree.quarters;
    q1 = p1!.id;
    const setup = await createReportSetup(db, fx);
    const weighted = await createReportSetup(db, fx, {
      ...QD39_HD05_CONFIG,
      annualAggregation: {
        strategy: 'WEIGHTED_AVERAGE',
        weights: { [p1!.code]: 1, [p2!.code]: 1, [p3!.code]: 1 },
      },
    });
    const e = fx.employees;
    const A = fx.units.A;
    staffA1Q1 = (
      await setup.record({
        periodId: q1,
        employeeId: e.staffA1,
        unitId: A,
        status: 'APPROVED',
        self: 85,
        review: 82,
        approved: 80,
        rating: 'HTTNV',
      })
    ).id;
    await setup.record({
      periodId: q1,
      employeeId: e.staffA2,
      unitId: A,
      status: 'APPROVED',
      self: 70,
      review: 60,
      approved: 60,
      rating: 'HTNV',
    });
    await setup.record({
      periodId: q1,
      employeeId: e.deputyA,
      unitId: A,
      status: 'REVIEWED',
      self: 80,
      review: 75,
    });
    await setup.record({
      periodId: q1,
      employeeId: e.staffB1,
      unitId: fx.units.B,
      status: 'APPROVED',
      self: 95,
      review: 95,
      approved: 95,
      rating: 'HTXS',
    });
    await setup.record({
      periodId: p2!.id,
      employeeId: e.staffA1,
      unitId: A,
      status: 'APPROVED',
      self: 92,
      review: 90,
      approved: 90,
      rating: 'HTXS',
    });
    await setup.record({ periodId: p2!.id, employeeId: e.staffA2, unitId: A, status: 'DRAFT' });
    await setup.record({
      periodId: p3!.id,
      employeeId: e.staffA1,
      unitId: A,
      status: 'SUBMITTED',
      self: 85,
    });
    for (const [p, v] of [
      [p1!, 70],
      [p2!, 80],
      [p3!, 90],
    ] as const) {
      await weighted.record({
        periodId: p.id,
        employeeId: e.headA,
        unitId: A,
        status: 'APPROVED',
        approved: v,
        rating: 'HTTNV',
      });
    }
    const emps = await db.employee.findMany({ where: { id: { in: Object.values(e) } } });
    names = Object.fromEntries(
      Object.entries(e).map(([k, id]) => [k, emps.find((x) => x.id === id)!.fullName]),
    );
  });
  afterAll(async () => db?.$disconnect());

  describe('Dashboard', () => {
    it('toàn cơ quan: đếm theo DB, phân bố xếp loại CHỈ tính hồ sơ đã duyệt', async () => {
      const res = await s.officer.get(`/api/v1/dashboard/summary?periodId=${q1}`);
      expect(res.status).toBe(200);
      const d = res.body.data;
      expect(d.scopeLabel).toBe('Toàn cơ quan');
      // Quý 1: staffA1, staffA2, deputyA, headA (WEIGHTED), staffB1
      expect(d.counts.evaluations).toBe(5);
      expect(d.progress.approved).toBe(4);
      expect(d.progress.reviewed).toBe(1);
      const ratings = Object.fromEntries(
        d.ratings.map((r: { code: string; count: number }) => [r.code, r.count]),
      );
      expect(ratings).toEqual({ HTXS: 1, HTTNV: 2, HTNV: 1 });
      expect(d.averages.approved).toBeCloseTo((80 + 60 + 95 + 70) / 4, 2);
      expect(d.units.map((u: { unitId: string }) => u.unitId).sort()).toEqual(
        [fx.units.A, fx.units.B].sort(),
      );
    });

    it('lọc theo đơn vị + phát hiện cán bộ chưa có hồ sơ trong kỳ', async () => {
      const res = await s.officer.get(
        `/api/v1/dashboard/summary?periodId=${q1}&unitId=${fx.units.A}`,
      );
      const d = res.body.data;
      expect(d.counts.evaluations).toBe(4);
      expect(d.counts.employees).toBe(4);
      // Đơn vị A: headA, deputyA, staffA1, staffA2 đều có hồ sơ Quý 1
      expect(d.progress.notCreated).toBe(0);
      const q3 = tree.quarters[2]!.id; // Quý 3: chỉ staffA1 và headA có hồ sơ
      const r3 = await s.officer.get(
        `/api/v1/dashboard/summary?periodId=${q3}&unitId=${fx.units.A}`,
      );
      expect(r3.body.data.progress.notCreated).toBe(2);
      expect(r3.body.data.missing.map((m: { employeeId: string }) => m.employeeId).sort()).toEqual(
        [fx.employees.deputyA, fx.employees.staffA2].sort(),
      );
    });

    it('lọc theo cá nhân và trạng thái', async () => {
      const res = await s.officer.get(
        `/api/v1/dashboard/summary?employeeId=${fx.employees.staffA1}&status=APPROVED`,
      );
      expect(res.body.data.counts.evaluations).toBe(2);
    });

    it('phạm vi: lãnh đạo đơn vị B chỉ thấy đơn vị B; lọc đơn vị khác → 404', async () => {
      const res = await s.headB.get(`/api/v1/dashboard/summary?periodId=${q1}`);
      expect(res.body.data.counts.evaluations).toBe(1);
      expect(res.body.data.units).toHaveLength(1);
      expect((await s.headB.get(`/api/v1/dashboard/summary?unitId=${fx.units.A}`)).status).toBe(
        404,
      );
      expect(
        (await s.headB.get(`/api/v1/dashboard/summary?employeeId=${fx.employees.staffA1}`)).status,
      ).toBe(404);
    });

    it('cán bộ chỉ thấy số liệu của bản thân; quản trị kỹ thuật không có quyền', async () => {
      const res = await s.staffA1.get(`/api/v1/dashboard/summary?periodId=${q1}`);
      expect(res.body.data.counts.evaluations).toBe(1);
      expect(res.body.data.scopeLabel).toBe('bản thân');
      expect((await s.admin.get('/api/v1/dashboard/summary')).status).toBe(403);
    });

    it('hồ sơ chờ tôi xử lý: người thẩm định thấy hồ sơ đã nộp; người phê duyệt thấy hồ sơ đã thẩm định', async () => {
      const head = await s.headA.get('/api/v1/dashboard/summary');
      const review = head.body.data.pending.filter(
        (p: { action: string }) => p.action === 'review',
      );
      expect(review.map((p: { employee: string }) => p.employee)).toContain(names['staffA1']);
      const ptb = await s.ptbA.get('/api/v1/dashboard/summary');
      const approve = ptb.body.data.pending.filter(
        (p: { action: string }) => p.action === 'approve',
      );
      expect(approve.map((p: { employee: string }) => p.employee)).toContain(names['deputyA']);
    });
  });

  describe('Báo cáo', () => {
    it('báo cáo đơn vị: danh sách + tổng hợp; đơn vị ngoài phạm vi → 404', async () => {
      const res = await s.headA.get(`/api/v1/reports/unit?periodId=${q1}&unitId=${fx.units.A}`);
      expect(res.status).toBe(200);
      const doc = res.body.data as ReportDocument;
      expect(doc.main.rows.map((r) => r['name']).sort()).toEqual(
        [names['headA'], names['deputyA'], names['staffA1'], names['staffA2']].sort(),
      );
      const summary = Object.fromEntries(doc.summary.map((x) => [x.label, x.value]));
      expect(summary['Đã phê duyệt']).toBe(3);
      expect(summary['Điểm bình quân đã phê duyệt']).toBe(70); // (80 + 60 + 70)/3
      // Điểm hồ sơ chưa duyệt không hiển thị ở cột "đã phê duyệt"
      expect(doc.main.rows.find((r) => r['name'] === names['deputyA'])?.['approved']).toBeNull();
      expect(
        (await s.headA.get(`/api/v1/reports/unit?periodId=${q1}&unitId=${fx.units.B}`)).status,
      ).toBe(404);
    });

    it('báo cáo toàn cơ quan theo đơn vị; người xem trong phạm vi một đơn vị chỉ thấy đơn vị đó', async () => {
      const all = (await s.officer.get(`/api/v1/reports/agency?periodId=${q1}`)).body
        .data as ReportDocument;
      expect(all.main.rows).toHaveLength(2);
      expect(all.main.totals?.['approved']).toBe(4);
      const ptb = (await s.ptbA.get(`/api/v1/reports/agency?periodId=${q1}`)).body
        .data as ReportDocument;
      expect(ptb.main.rows).toHaveLength(1);
      expect(ptb.main.rows[0]?.['total']).toBe(4);
      expect(ptb.scopeLabel).not.toBe('Toàn cơ quan');
    });

    it('báo cáo cá nhân theo năm + tổng hợp năm theo quy tắc (MANUAL → không tự tính)', async () => {
      const res = await s.officer.get(
        `/api/v1/reports/individual?employeeId=${fx.employees.staffA1}&year=${tree.year}`,
      );
      const doc = res.body.data as ReportDocument;
      expect(doc.main.rows).toHaveLength(3);
      const agg = doc.summary.find((x) => x.label.startsWith('Tổng hợp năm'));
      expect(agg?.value).toBe('Không tự tính — cấp có thẩm quyền quyết định');
      // Cán bộ khác đơn vị không xem được
      const other = await s.headB.get(
        `/api/v1/reports/individual?employeeId=${fx.employees.staffA1}&year=${tree.year}`,
      );
      expect(other.status).toBe(404);
    });

    it('tổng hợp năm từ các quý theo cấu hình: WEIGHTED tính (70+80+90)/3 = 80; MANUAL để cấp có thẩm quyền quyết định', async () => {
      const res = await s.officer.get(
        `/api/v1/reports/aggregate?periodId=${tree.yearPeriod.id}&unitId=${fx.units.A}`,
      );
      expect(res.status).toBe(200);
      const doc = res.body.data as ReportDocument;
      const row = (n: string) => doc.main.rows.find((r) => r['name'] === n)!;
      expect(row(names['headA']!)['aggregated']).toBe(80);
      expect(row(names['staffA1']!)['aggregated']).toBe('Cấp có thẩm quyền quyết định');
      expect(row(names['staffA1']!)[`p_${tree.quarters[0]!.code}`]).toBe(80);
      expect(row(names['staffA1']!)[`p_${tree.quarters[2]!.code}`]).toBeNull(); // Quý 3 chưa duyệt
      expect(
        doc.main.columns.find((c) => c.key === `p_${tree.quarters[3]!.code}`)?.header,
      ).toContain('không xếp loại riêng');
    });

    it('quản trị kỹ thuật không xem/xuất được báo cáo nghiệp vụ (403)', async () => {
      expect((await s.admin.get(`/api/v1/reports/agency?periodId=${q1}`)).status).toBe(403);
      expect(
        (await s.admin.get(`/api/v1/reports/agency/export?periodId=${q1}&format=xlsx`)).status,
      ).toBe(403);
    });
  });

  describe('Xuất Excel/PDF — dữ liệu khớp phạm vi được phép', () => {
    it('Excel báo cáo đơn vị: có tiêu đề, thời gian xuất, phạm vi, bảng dữ liệu, phần tổng hợp; ghi nhật ký', async () => {
      const res = await s.headA
        .get(`/api/v1/reports/unit/export?periodId=${q1}&unitId=${fx.units.A}&format=xlsx`)
        .buffer(true)
        .parse(binary);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('spreadsheetml');
      expect(res.headers['content-disposition']).toMatch(/^attachment; filename=".+\.xlsx"/);
      const { wb, texts, names: exported } = await readXlsx(res.body as Buffer);
      expect(texts[0]).toContain('BÁO CÁO KẾT QUẢ ĐÁNH GIÁ');
      expect(texts.some((t) => t.startsWith('Thời gian xuất:'))).toBe(true);
      expect(texts.some((t) => t.startsWith('Phạm vi dữ liệu:'))).toBe(true);
      expect(texts).toContain('TỔNG HỢP');
      expect(wb.getWorksheet('Tổng hợp')).toBeDefined();
      // Khớp đúng dữ liệu xem trên giao diện
      const view = (await s.headA.get(`/api/v1/reports/unit?periodId=${q1}&unitId=${fx.units.A}`))
        .body.data as ReportDocument;
      expect(exported.sort()).toEqual(view.main.rows.map((r) => String(r['name'])).sort());
      const audit = await db.auditLog.findFirst({
        where: {
          action: 'report.export',
          entityId: 'unit',
          actorUserId: (await db.user.findUniqueOrThrow({ where: { username: fx.users.headA } }))
            .id,
        },
      });
      expect(audit).not.toBeNull();
    });

    it('Phó phòng (phạm vi cán bộ quản lý trực tiếp) xuất báo cáo đơn vị: chỉ có cấp dưới trực tiếp và bản thân', async () => {
      const res = await s.deputyA
        .get(`/api/v1/reports/unit/export?periodId=${q1}&unitId=${fx.units.A}&format=xlsx`)
        .buffer(true)
        .parse(binary);
      expect(res.status).toBe(200);
      const { names: exported } = await readXlsx(res.body as Buffer);
      expect(exported.sort()).toEqual([names['deputyA'], names['staffA1']].sort());
      expect(exported).not.toContain(names['staffA2']);
      expect(exported).not.toContain(names['staffB1']);
    });

    it('Excel toàn cơ quan của lãnh đạo đơn vị B không chứa cán bộ đơn vị A', async () => {
      const res = await s.headB
        .get(`/api/v1/reports/agency/export?periodId=${q1}&format=xlsx`)
        .buffer(true)
        .parse(binary);
      const { wb } = await readXlsx(res.body as Buffer);
      const all: string[] = [];
      wb.eachSheet((ws) =>
        ws.eachRow((row) => row.eachCell((c) => all.push(String(c.value ?? '')))),
      );
      expect(all).toContain(names['staffB1']);
      for (const k of ['headA', 'deputyA', 'staffA1', 'staffA2'])
        expect(all).not.toContain(names[k]);
    });

    it('PDF báo cáo toàn cơ quan là file PDF thật', async () => {
      const res = await s.officer
        .get(`/api/v1/reports/agency/export?periodId=${q1}&format=pdf`)
        .buffer(true)
        .parse(binary);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
      expect((res.body as Buffer).length).toBeGreaterThan(5000);
    });

    it('cán bộ chỉ xuất được báo cáo cá nhân của mình; định dạng lạ bị từ chối', async () => {
      const own = await s.staffA1
        .get(
          `/api/v1/reports/individual/export?employeeId=${fx.employees.staffA1}&year=${tree.year}&format=pdf`,
        )
        .buffer(true)
        .parse(binary);
      expect(own.status).toBe(200);
      const other = await s.staffA1.get(
        `/api/v1/reports/individual/export?employeeId=${fx.employees.staffA2}&year=${tree.year}&format=pdf`,
      );
      expect(other.status).toBe(404);
      expect(
        (
          await s.staffA1.get(
            `/api/v1/reports/individual/export?employeeId=${fx.employees.staffA1}&year=${tree.year}&format=csv`,
          )
        ).status,
      ).toBe(400);
    });
  });

  describe('Dự thảo văn bản theo mẫu', () => {
    it('báo cáo kết quả: luôn "DỰ THẢO", chỉ đưa hồ sơ đã duyệt, liệt kê trường còn thiếu', async () => {
      const res = await s.officer.post('/api/v1/drafts/preview', {
        templateCode: 'BC-KQDG',
        periodId: q1,
        unitId: fx.units.A,
      });
      expect(res.status).toBe(200);
      const d = res.body.data;
      expect(d.status).toBe('DỰ THẢO');
      expect(d.missingFields.map((m: { key: string }) => m.key)).toEqual(
        expect.arrayContaining(['docNumber', 'placeDate', 'signer']),
      );
      expect(d.warnings.join(' ')).toContain('chưa được phê duyệt');
      const list = d.blocks
        .filter((b: { type: string }) => b.type === 'table')[1]
        .table.rows.map((r: { name: string }) => r.name);
      expect(list.sort()).toEqual([names['headA'], names['staffA1'], names['staffA2']].sort());
    });

    it('phiếu kết quả cá nhân + PDF có chữ chìm DỰ THẢO; không có quyền dự thảo → 403', async () => {
      const prev = await s.officer.post('/api/v1/drafts/preview', {
        templateCode: 'PHIEU-KQDG',
        evaluationId: staffA1Q1,
      });
      expect(prev.status).toBe(200);
      expect(prev.body.data.subtitle).toContain(names['staffA1']);
      const pdf = await s.officer
        .post('/api/v1/drafts/pdf', { templateCode: 'PHIEU-KQDG', evaluationId: staffA1Q1 })
        .buffer(true)
        .parse(binary);
      expect(pdf.status).toBe(200);
      expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
      expect(pdf.headers['content-disposition']).toContain('DU-THAO');
      expect(
        (await s.staffA1.post('/api/v1/drafts/preview', { templateCode: 'BC-KQDG', periodId: q1 }))
          .status,
      ).toBe(403);
      expect(
        (await s.officer.post('/api/v1/drafts/preview', { templateCode: 'BC-KQDG' })).status,
      ).toBe(400);
    });
  });

  describe('Workflow theo trạng thái kỳ', () => {
    it('kỳ đang chuẩn bị: chưa được nộp tự đánh giá; kỳ đã đóng: không thẩm định, chỉ mở lại', async () => {
      const setup = await createReportSetup(db, fx);
      const planning = await createQuarter(db, fx, { tag: 'P', status: 'PLANNING' });
      const draft = await setup.record({
        periodId: planning.id,
        employeeId: fx.employees.staffA1,
        unitId: fx.units.A,
        status: 'DRAFT',
      });
      const sub = await s.staffA1.post(`/api/v1/evaluations/${draft.id}/submit`, { version: 1 });
      expect(sub.status).toBe(422);
      expect(sub.body.error.message).toContain('Nộp tự đánh giá');
      expect((await s.staffA1.get(`/api/v1/evaluations/${draft.id}`)).body.data.can.submit).toBe(
        false,
      );

      const closed = await createQuarter(db, fx, { tag: 'C', status: 'CLOSED' });
      const submitted = await setup.record({
        periodId: closed.id,
        employeeId: fx.employees.staffA1,
        unitId: fx.units.A,
        status: 'SUBMITTED',
      });
      const review = await s.headA.post(`/api/v1/evaluations/${submitted.id}/return`, {
        reason: 'Bổ sung',
        version: 1,
      });
      expect(review.status).toBe(422);
    });
  });
});
