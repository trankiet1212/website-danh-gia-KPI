/**
 * GĐ5 — hồ sơ đánh giá: tự đánh giá → thẩm định → phê duyệt → khóa → mở lại.
 * Kiểm tra: tách biệt 3 lớp điểm, dữ liệu thiếu, phạm vi truy cập, ảnh chụp tính điểm bất biến,
 * KHÔNG sửa được kết quả đã duyệt nếu không qua quy trình mở lại hợp lệ (API 409 + trigger DB).
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
import {
  createQuarter,
  createRuleSetVersion,
  row,
  sampleCriteriaItems,
} from '../helpers/kpi-fixture.js';
import { buildDbTestApp } from '../helpers/test-app.js';

describe.skipIf(!TEST_DATABASE_URL)('GĐ5 — hồ sơ đánh giá', () => {
  let db: Db;
  let fx: Fixture;
  let app: ReturnType<typeof buildDbTestApp>;
  let s: Record<'officer' | 'ptbA' | 'headA' | 'deputyA' | 'staffA1' | 'headB', Session>;
  let periodId: string;
  let ruleVersionId: string;
  let criteriaVersionId: string;
  let ids: Record<string, string>;
  let evalId: string;
  let version: number;

  beforeAll(async () => {
    db = createTestDb();
    fx = await createFixture(db);
    app = buildDbTestApp(db);
    const names = ['officer', 'ptbA', 'headA', 'deputyA', 'staffA1', 'headB'] as const;
    const sessions = await Promise.all(names.map((n) => login(app, fx.users[n])));
    s = Object.fromEntries(names.map((n, i) => [n, sessions[i]!])) as typeof s;

    periodId = (await createQuarter(db, fx)).id;
    ruleVersionId = (await createRuleSetVersion(db, fx)).id;
    // Bộ tiêu chí qua API: soạn (officer) → trình → phê duyệt (ptbA)
    const set = await s.officer.post('/api/v1/criteria-sets', {
      code: `CSE-${fx.sfx}`,
      name: 'Bộ tiêu chí chuyên viên (kiểm thử)',
      kpiProfile: 'STAFF',
      jobPositionId: fx.jobPositionId,
    });
    const v = await s.officer.post(`/api/v1/criteria-sets/${set.body.data.id}/versions`, {});
    criteriaVersionId = v.body.data.id;
    const saved = await s.officer.put(`/api/v1/criteria-versions/${criteriaVersionId}/items`, {
      generalMax: 30,
      resultMax: 70,
      periodTypes: ['QUARTER'],
      ruleSetVersionId: ruleVersionId,
      items: sampleCriteriaItems(),
      version: 1,
    });
    expect(saved.status).toBe(200);
    await s.officer.post(`/api/v1/criteria-versions/${criteriaVersionId}/submit`, {
      note: 'Trình',
      version: 2,
    });
    const approved = await s.ptbA.post(`/api/v1/criteria-versions/${criteriaVersionId}/approve`, {
      note: 'Duyệt',
      version: 3,
    });
    expect(approved.status).toBe(200);
    ids = Object.fromEntries(
      (approved.body.data.items as { code: string; id: string }[]).map((i) => [i.code, i.id]),
    );
  });
  afterAll(async () => db?.$disconnect());

  const generalPass = () =>
    ['1.1', '2.1', '2.2'].map((c) => ({ criteriaItemId: ids[c]!, input: { passed: true } }));
  const refresh = async () => {
    const r = await s.staffA1.get(`/api/v1/evaluations/${evalId}`);
    version = r.body.data.version;
    return r.body.data;
  };

  it('tạo hồ sơ (period.manage); trùng đối tượng trong kỳ bị 409; kỳ không xếp loại bị từ chối', async () => {
    const res = await s.officer.post('/api/v1/evaluations', {
      periodId,
      employeeId: fx.employees.staffA1,
      criteriaVersionId,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('DRAFT');
    expect(res.body.data.kpiProfile).toBe('STAFF');
    evalId = res.body.data.id;
    version = res.body.data.version;

    const dup = await s.officer.post('/api/v1/evaluations', {
      periodId,
      employeeId: fx.employees.staffA1,
      criteriaVersionId,
    });
    expect(dup.status).toBe(409);
    const q4 = await createQuarter(db, fx, { seq: 4, isRated: false, tag: 'N' });
    const notRated = await s.officer.post('/api/v1/evaluations', {
      periodId: q4.id,
      employeeId: fx.employees.staffA1,
      criteriaVersionId,
    });
    expect(notRated.status).toBe(422);
    // Cán bộ thường không tạo được hồ sơ
    expect(
      (await s.staffA1.post('/api/v1/evaluations', { periodId, employeeId: fx.employees.staffA1 }))
        .status,
    ).toBe(403);
  });

  it('phạm vi: đơn vị khác không thấy hồ sơ (404); đối tượng và lãnh đạo đơn vị thấy', async () => {
    expect((await s.headB.get(`/api/v1/evaluations/${evalId}`)).status).toBe(404);
    const listB = await s.headB.get(`/api/v1/evaluations?periodId=${periodId}`);
    expect(listB.body.data).toHaveLength(0);
    const mine = await refresh();
    expect(mine.can.editSelf).toBe(true);
    expect(mine.can.editReview).toBe(false);
    const head = await s.headA.get(`/api/v1/evaluations/${evalId}`);
    expect(head.status).toBe(200);
    expect(head.body.data.can.editSelf).toBe(false);
  });

  it('chỉ chính đối tượng được tự đánh giá', async () => {
    const res = await s.headA.put(`/api/v1/evaluations/${evalId}/self`, {
      items: generalPass(),
      version,
    });
    expect(res.status).toBe(403);
  });

  it('thiếu dữ liệu → không nộp được (422, liệt kê mục thiếu)', async () => {
    const saved = await s.staffA1.put(`/api/v1/evaluations/${evalId}/self`, {
      items: generalPass(),
      version,
    });
    expect(saved.status).toBe(200);
    version = saved.body.data.version;
    const res = await s.staffA1.post(`/api/v1/evaluations/${evalId}/submit`, { version });
    expect(res.status).toBe(422);
    expect(res.body.error.details.missing.join(' ')).toContain('T1');
  });

  it('dữ liệu không thuộc bộ tiêu chí bị từ chối', async () => {
    const res = await s.staffA1.put(`/api/v1/evaluations/${evalId}/self`, {
      items: [{ criteriaItemId: fx.employees.headA, input: { passed: true } }],
      version,
    });
    expect(res.status).toBe(400);
  });

  it('tính thử không lưu kết quả; nộp lưu ảnh chụp SELF và điểm tự đánh giá', async () => {
    const saved = await s.staffA1.put(`/api/v1/evaluations/${evalId}/self`, {
      items: [...generalPass(), { criteriaItemId: ids['T1']!, input: { rows: [row()] } }],
      version,
    });
    version = saved.body.data.version;
    const trial = await s.staffA1.post(`/api/v1/evaluations/${evalId}/calculate`, {
      layer: 'self',
    });
    expect(trial.status).toBe(200);
    expect(trial.body.data.result.totalRounded).toBe(100);
    expect(trial.body.data.result.complete).toBe(true);
    expect(await db.evaluationCalculation.count({ where: { evaluationId: evalId } })).toBe(0);

    const sub = await s.staffA1.post(`/api/v1/evaluations/${evalId}/submit`, {
      comment: 'Nộp',
      version,
    });
    expect(sub.status).toBe(200);
    expect(sub.body.data.status).toBe('SUBMITTED');
    expect(sub.body.data.selfTotal).toBe(100);
    // Đủ điều kiện điểm HTXS nhưng không có nhiệm vụ vượt mức (≥30%) → đề xuất HTTNV (điều kiện kèm theo)
    expect(sub.body.data.selfRating).toBe('HTTNV');
    const calc = await db.evaluationCalculation.findFirstOrThrow({
      where: { evaluationId: evalId, kind: 'SELF' },
    });
    expect(calc.checksum).toHaveLength(64);
    expect(calc.ruleSetVersionId).toBe(ruleVersionId);
    expect(calc.criteriaVersionId).toBe(criteriaVersionId);
    expect(calc.engineVersion).toBe('1.0.0');
    version = sub.body.data.version;
  });

  it('sau khi nộp, đối tượng không sửa được tự đánh giá (409)', async () => {
    const res = await s.staffA1.put(`/api/v1/evaluations/${evalId}/self`, {
      items: generalPass(),
      version,
    });
    expect(res.status).toBe(409);
  });

  it('thẩm định: lưu dữ liệu riêng, cờ phải có trong bộ quy tắc; hoàn tất lưu ảnh chụp REVIEW', async () => {
    // Đối tượng không thẩm định chính mình (không có quyền review)
    expect(
      (await s.staffA1.put(`/api/v1/evaluations/${evalId}/review`, { items: [], version })).status,
    ).toBe(403);
    // Phó phòng quản lý trực tiếp staffA1 có quyền thẩm định (phạm vi MANAGED)
    const deputyView = await s.deputyA.get(`/api/v1/evaluations/${evalId}`);
    expect(deputyView.body.data.can.editReview).toBe(true);

    const badFlag = await s.headA.put(`/api/v1/evaluations/${evalId}/review`, {
      items: [],
      flags: ['KHONG_CO'],
      version,
    });
    expect(badFlag.status).toBe(400);
    const review = await s.headA.put(`/api/v1/evaluations/${evalId}/review`, {
      // 1 sản phẩm có sai sót phải làm lại 1 lần → B = (3 + 1 − 25%)/4 = 93,75%
      items: [
        {
          criteriaItemId: ids['T1']!,
          input: { rows: [row({ reworkQty: 1, reworkCount: 1 })] },
          note: 'Có 1 lần làm lại',
        },
      ],
      version,
    });
    expect(review.status).toBe(200);
    expect(review.body.data.status).toBe('UNDER_REVIEW');
    version = review.body.data.version;

    const done = await s.headA.post(`/api/v1/evaluations/${evalId}/complete-review`, {
      comment: 'Đồng ý',
      version,
    });
    expect(done.status).toBe(200);
    const d = done.body.data;
    expect(d.status).toBe('REVIEWED');
    // KPI = (100% + 93,75% + 100%)/3 = 97,9167% → 70 × 97,9167% = 68,5417 → tổng 98,5417 → làm tròn 98,5
    expect(d.reviewTotal).toBe(98.5);
    expect(d.reviewRating).toBe('HTTNV');
    expect(d.selfTotal).toBe(100); // điểm tự đánh giá giữ nguyên
    const explanation = (d.latest.REVIEW.result.explanation as string[]).join('\n');
    expect(explanation).toContain('lấy theo dữ liệu tự đánh giá'); // mục 1.1, 2.1, 2.2 kế thừa
    version = d.version;
  });

  it('phê duyệt bị chặn khi bộ quy tắc chưa xác nhận; chỉ người có quyền phê duyệt', async () => {
    const view = await s.ptbA.get(`/api/v1/evaluations/${evalId}`);
    expect(view.body.data.approvalBlockers.join(' ')).toContain('chưa được xác nhận');
    expect(view.body.data.can.approve).toBe(false);
    const blocked = await s.ptbA.post(`/api/v1/evaluations/${evalId}/approve`, {
      finalRating: 'HTTNV',
      version,
    });
    expect(blocked.status).toBe(422);
    expect(
      (
        await s.headA.post(`/api/v1/evaluations/${evalId}/approve`, {
          finalRating: 'HTTNV',
          version,
        })
      ).status,
    ).toBe(403);

    const rule = await s.ptbA.post(`/api/v1/rule-set-versions/${ruleVersionId}/confirm`, {
      note: 'Xác nhận áp dụng',
      version: 1,
    });
    expect(rule.status).toBe(200);
  });

  it('mức xếp loại khác đề xuất phải có lý do; mức không có trong quy tắc bị từ chối', async () => {
    expect(
      (await s.ptbA.post(`/api/v1/evaluations/${evalId}/approve`, { finalRating: 'XYZ', version }))
        .status,
    ).toBe(400);
    const noReason = await s.ptbA.post(`/api/v1/evaluations/${evalId}/approve`, {
      finalRating: 'HTXS',
      version,
    });
    expect(noReason.status).toBe(422);
  });

  it('phê duyệt: chốt điểm đã duyệt, khóa hồ sơ, lưu ảnh chụp APPROVAL; 3 lớp điểm tách biệt', async () => {
    const res = await s.ptbA.post(`/api/v1/evaluations/${evalId}/approve`, {
      finalRating: 'HTTNV',
      comment: 'Phê duyệt',
      version,
    });
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.status).toBe('APPROVED');
    expect(d.lockedAt).not.toBeNull();
    expect([d.selfTotal, d.reviewTotal, d.approvedTotal]).toEqual([100, 98.5, 98.5]);
    expect([d.selfRating, d.reviewRating, d.approvedRating]).toEqual(['HTTNV', 'HTTNV', 'HTTNV']);
    expect(d.approvals).toHaveLength(1);
    // Ảnh chụp phê duyệt: quy tắc đã xác nhận → kết quả không còn đánh dấu "tạm" do quy tắc
    expect(d.approvals[0].result.issues.map((i: { code: string }) => i.code)).not.toContain(
      'RULE_NOT_CONFIRMED',
    );
    version = d.version;
  });

  it('KHÔNG sửa được kết quả đã duyệt qua API (409)', async () => {
    const msgs = await Promise.all([
      s.staffA1.put(`/api/v1/evaluations/${evalId}/self`, { items: generalPass(), version }),
      s.headA.put(`/api/v1/evaluations/${evalId}/review`, { items: [], version }),
      s.headA.post(`/api/v1/evaluations/${evalId}/return`, { reason: 'Trả lại', version }),
      s.ptbA.post(`/api/v1/evaluations/${evalId}/approve`, {
        finalRating: 'HTNV',
        overrideReason: 'Đổi',
        version,
      }),
    ]);
    for (const r of msgs) expect(r.status).toBe(409);
    expect(msgs[0]!.body.error.message).toContain('mở lại');
  });

  it('KHÔNG sửa được kết quả đã duyệt trực tiếp trong DB (trigger)', async () => {
    await expect(
      db.evaluationRecord.update({ where: { id: evalId }, data: { approvedTotal: 50 } }),
    ).rejects.toThrow();
    await expect(
      db.evaluationRecord.update({ where: { id: evalId }, data: { status: 'DRAFT' } }),
    ).rejects.toThrow();
    // Mở lại mà không tăng revision cũng bị chặn
    await expect(
      db.evaluationRecord.update({ where: { id: evalId }, data: { status: 'REOPENED' } }),
    ).rejects.toThrow();
    const item = await db.evaluationItem.findFirstOrThrow({ where: { evaluationId: evalId } });
    await expect(
      db.evaluationItem.update({ where: { id: item.id }, data: { reviewNote: 'sửa' } }),
    ).rejects.toThrow();
    const calc = await db.evaluationCalculation.findFirstOrThrow({
      where: { evaluationId: evalId, kind: 'APPROVAL' },
    });
    await expect(
      db.evaluationCalculation.update({ where: { id: calc.id }, data: { checksum: 'x' } }),
    ).rejects.toThrow();
    await expect(db.evaluationCalculation.delete({ where: { id: calc.id } })).rejects.toThrow();
    await expect(
      db.evaluationHistory.deleteMany({ where: { evaluationId: evalId } }),
    ).rejects.toThrow();
    await expect(db.evaluationRecord.delete({ where: { id: evalId } })).rejects.toThrow();
  });

  it('mở lại: cần quyền evaluation.reopen + lý do; tăng revision, giữ ảnh chụp đã duyệt cũ', async () => {
    expect(
      (await s.headA.post(`/api/v1/evaluations/${evalId}/reopen`, { reason: 'Sai sót', version }))
        .status,
    ).toBe(403);
    expect(
      (await s.ptbA.post(`/api/v1/evaluations/${evalId}/reopen`, { reason: '', version })).status,
    ).toBe(400);
    const res = await s.ptbA.post(`/api/v1/evaluations/${evalId}/reopen`, {
      reason: 'Phát hiện sai số liệu nhiệm vụ',
      version,
    });
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.status).toBe('REOPENED');
    expect(d.revisionNo).toBe(2);
    expect(d.approvedTotal).toBeNull();
    expect(d.approvals).toHaveLength(1); // kết quả duyệt lần 1 vẫn còn nguyên
    expect(d.approvalBlockers.join(' ')).toContain('chưa hoàn tất thẩm định');
    version = d.version;
  });

  it('sau khi mở lại: thẩm định lại → phê duyệt lần 2 (revision 2)', async () => {
    const review = await s.headA.put(`/api/v1/evaluations/${evalId}/review`, {
      items: [{ criteriaItemId: ids['T1']!, input: { rows: [row()] }, note: 'Đã điều chỉnh' }],
      version,
    });
    expect(review.body.data.status).toBe('UNDER_REVIEW');
    const done = await s.headA.post(`/api/v1/evaluations/${evalId}/complete-review`, {
      version: review.body.data.version,
    });
    expect(done.body.data.reviewTotal).toBe(100);
    const ok = await s.ptbA.post(`/api/v1/evaluations/${evalId}/approve`, {
      finalRating: 'HTTNV',
      version: done.body.data.version,
    });
    expect(ok.status).toBe(200);
    expect(ok.body.data.approvedTotal).toBe(100);
    expect(ok.body.data.approvals.map((a: { revisionNo: number }) => a.revisionNo)).toEqual([1, 2]);
    const actions = (ok.body.data.history as { action: string }[]).map((h) => h.action);
    expect(actions).toEqual([
      'create',
      'submit',
      'saveReview',
      'completeReview',
      'approve',
      'reopen',
      'saveReview',
      'completeReview',
      'approve',
    ]);
    const audit = await db.auditLog.count({
      where: { entityId: evalId, action: { in: ['evaluation.approve', 'evaluation.reopen'] } },
    });
    expect(audit).toBe(3);
  });

  it('cán bộ không xem được hồ sơ của đồng nghiệp (404)', async () => {
    const created = await s.officer.post('/api/v1/evaluations', {
      periodId,
      employeeId: fx.employees.staffA2,
      criteriaVersionId,
    });
    expect(created.status).toBe(201);
    expect((await s.staffA1.get(`/api/v1/evaluations/${created.body.data.id}`)).status).toBe(404);
    // Hồ sơ còn nháp → chưa thể trả lại
    expect(
      (
        await s.headA.post(`/api/v1/evaluations/${created.body.data.id}/return`, {
          reason: 'x',
          version: 1,
        })
      ).status,
    ).toBe(409);
  });

  it('trả lại hồ sơ: bắt buộc lý do; đối tượng sửa và nộp lại', async () => {
    const p = await createQuarter(db, fx, { seq: 3, tag: 'R' });
    const created = await s.officer.post('/api/v1/evaluations', {
      periodId: p.id,
      employeeId: fx.employees.staffA1,
      criteriaVersionId,
    });
    const id = created.body.data.id as string;
    const items = [...generalPass(), { criteriaItemId: ids['T1']!, input: { rows: [row()] } }];
    let v = (await s.staffA1.put(`/api/v1/evaluations/${id}/self`, { items, version: 1 })).body.data
      .version;
    v = (await s.staffA1.post(`/api/v1/evaluations/${id}/submit`, { version: v })).body.data
      .version;

    expect(
      (await s.headA.post(`/api/v1/evaluations/${id}/return`, { reason: '', version: v })).status,
    ).toBe(400);
    const ret = await s.headA.post(`/api/v1/evaluations/${id}/return`, {
      reason: 'Bổ sung minh chứng',
      version: v,
    });
    expect(ret.body.data.status).toBe('RETURNED');
    expect(ret.body.data.history.at(-1).comment).toBe('Bổ sung minh chứng');
    v = ret.body.data.version;

    const again = await s.staffA1.put(`/api/v1/evaluations/${id}/self`, { items, version: v });
    expect(again.body.data.status).toBe('DRAFT');
    const resub = await s.staffA1.post(`/api/v1/evaluations/${id}/submit`, {
      version: again.body.data.version,
    });
    expect(resub.body.data.status).toBe('SUBMITTED');
    // Phiên bản cũ (optimistic lock) → 409
    expect(
      (await s.headA.post(`/api/v1/evaluations/${id}/return`, { reason: 'x', version: v })).status,
    ).toBe(409);
  });

  it('tạo hàng loạt hồ sơ còn thiếu cho đơn vị (không tạo trùng)', async () => {
    const p = await createQuarter(db, fx, { seq: 1, tag: 'G' });
    const res = await s.officer.post('/api/v1/evaluations/generate', {
      periodId: p.id,
      unitId: fx.units.A,
    });
    expect(res.status).toBe(200);
    const recs = await db.evaluationRecord.findMany({
      where: {
        periodId: p.id,
        subjectEmployeeId: { in: [fx.employees.staffA1, fx.employees.staffA2] },
      },
    });
    expect(recs).toHaveLength(2);
    expect(recs.every((r) => r.criteriaVersionId === criteriaVersionId)).toBe(true);
    const again = await s.officer.post('/api/v1/evaluations/generate', {
      periodId: p.id,
      unitId: fx.units.A,
    });
    expect(again.body.data.created).toBe(0);
  });
});
