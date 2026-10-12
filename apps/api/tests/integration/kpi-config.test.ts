/**
 * GĐ5 — cấu hình có phiên bản: kỳ đánh giá, bộ quy tắc tính điểm, bộ tiêu chí, danh mục SP/CV.
 * Trọng tâm: kiểm tra tổng điểm/trọng số, không tự xác nhận/phê duyệt, bản đã xác nhận/phê duyệt là bất biến (API + trigger DB).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
import {
  createQuarter,
  createRuleSetVersion,
  sampleCriteriaItems,
  userId,
} from '../helpers/kpi-fixture.js';
import { buildDbTestApp } from '../helpers/test-app.js';

describe.skipIf(!TEST_DATABASE_URL)('GĐ5 — cấu hình KPI có phiên bản', () => {
  let db: Db;
  let fx: Fixture;
  let app: ReturnType<typeof buildDbTestApp>;
  let officer: Session;
  let ptbA: Session;
  let staffA1: Session;

  beforeAll(async () => {
    db = createTestDb();
    fx = await createFixture(db);
    app = buildDbTestApp(db);
    [officer, ptbA, staffA1] = await Promise.all([
      login(app, fx.users.officer),
      login(app, fx.users.ptbA),
      login(app, fx.users.staffA1),
    ]);
  });
  afterAll(async () => db?.$disconnect());

  describe('Kỳ đánh giá', () => {
    it('sinh cây kỳ của một năm (idempotent); Quý IV không xếp loại riêng', async () => {
      const first = await officer.post('/api/v1/periods/generate-year', { year: 2099 });
      expect(first.status).toBe(201);
      const again = await officer.post('/api/v1/periods/generate-year', { year: 2099 });
      expect(again.body.data.created).toEqual([]);
      const list = await officer.get('/api/v1/periods?year=2099&type=QUARTER');
      expect(list.body.data).toHaveLength(4);
      const q4 = list.body.data.find((p: { seq: number }) => p.seq === 4);
      expect(q4.isRated).toBe(false);
    });

    it('chỉ chuyển trạng thái liền kề; người không có quyền bị 403', async () => {
      const p = await createQuarter(db, fx, { tag: 'T', status: 'PLANNING' });
      expect(
        (await staffA1.post(`/api/v1/periods/${p.id}/transition`, { to: 'OPEN', version: 1 }))
          .status,
      ).toBe(403);
      const skip = await officer.post(`/api/v1/periods/${p.id}/transition`, {
        to: 'CLOSED',
        version: 1,
      });
      expect(skip.status).toBe(409);
      const ok = await officer.post(`/api/v1/periods/${p.id}/transition`, {
        to: 'OPEN',
        version: 1,
      });
      expect(ok.status).toBe(200);
      expect(ok.body.data.status).toBe('OPEN');
    });
  });

  describe('Bộ quy tắc tính điểm', () => {
    it('soạn → trình → xác nhận; người soạn không tự xác nhận; bản đã xác nhận bất biến', async () => {
      const template = await createRuleSetVersion(db, fx);
      const set = await officer.post('/api/v1/rule-sets', {
        code: `RSAPI-${fx.sfx}`,
        name: 'Quy tắc thử nghiệm',
      });
      expect(set.status).toBe(201);
      const v = await officer.post(`/api/v1/rule-sets/${set.body.data.id}/versions`, {
        cloneFromVersionId: template.id,
      });
      expect(v.status).toBe(201);
      expect(v.body.data.status).toBe('DRAFT');
      const id = v.body.data.id as string;

      // Cấu hình sai schema bị chặn (thang điểm không khớp)
      const bad = structuredClone(QD39_HD05_CONFIG);
      bad.scale.generalMax = 40;
      const rejected = await officer.put(`/api/v1/rule-set-versions/${id}`, {
        config: bad,
        legalBasis: 'Thử',
        version: 1,
      });
      expect(rejected.status).toBe(400);

      const cfg = structuredClone(QD39_HD05_CONFIG);
      cfg.composite.qualityDenominator = 'COMPLETED';
      const saved = await officer.put(`/api/v1/rule-set-versions/${id}`, {
        config: cfg,
        legalBasis: 'Căn cứ thử nghiệm',
        version: 1,
      });
      expect(saved.status).toBe(200);
      expect(saved.body.data.checksum).not.toBe(template.checksum);

      const submitted = await officer.post(`/api/v1/rule-set-versions/${id}/submit`, {
        note: 'Trình',
        version: 2,
      });
      expect(submitted.body.data.status).toBe('PENDING_CONFIRMATION');
      // Không có quyền xác nhận
      expect(
        (await officer.post(`/api/v1/rule-set-versions/${id}/confirm`, { note: 'x', version: 3 }))
          .status,
      ).toBe(403);
      // Người có thẩm quyền xác nhận
      const confirmed = await ptbA.post(`/api/v1/rule-set-versions/${id}/confirm`, {
        note: 'Đồng ý áp dụng',
        version: 3,
      });
      expect(confirmed.status).toBe(200);
      expect(confirmed.body.data.status).toBe('CONFIRMED');
      expect(confirmed.body.data.confirmedBy).toBe(await userId(db, fx.users.ptbA));

      // API: không sửa được bản đã xác nhận
      const edit = await officer.put(`/api/v1/rule-set-versions/${id}`, {
        config: cfg,
        legalBasis: 'Sửa',
        version: 4,
      });
      expect(edit.status).toBe(422);
      // DB: trigger chặn sửa nội dung bản đã xác nhận
      await expect(
        db.ruleSetVersion.update({ where: { id }, data: { legalBasis: 'sửa trái phép' } }),
      ).rejects.toThrow();
    });

    it('người soạn không được tự xác nhận', async () => {
      const v = await createRuleSetVersion(db, fx, await userId(db, fx.users.ptbA));
      const res = await ptbA.post(`/api/v1/rule-set-versions/${v.id}/confirm`, {
        note: 'Tự xác nhận',
        version: 1,
      });
      expect(res.status).toBe(422);
    });
  });

  describe('Bộ tiêu chí', () => {
    let setId: string;
    let versionId: string;
    let ruleVersionId: string;

    beforeAll(async () => {
      ruleVersionId = (await createRuleSetVersion(db, fx)).id;
      const set = await officer.post('/api/v1/criteria-sets', {
        code: `CS-${fx.sfx}`,
        name: 'Bộ tiêu chí kiểm thử',
        kpiProfile: 'STAFF',
        jobPositionId: fx.jobPositionId,
      });
      expect(set.status).toBe(201);
      setId = set.body.data.id;
      const v = await officer.post(`/api/v1/criteria-sets/${setId}/versions`, {});
      expect(v.status).toBe(201);
      versionId = v.body.data.id;
    });

    const save = (items: object[], version: number, extra: object = {}) =>
      officer.put(`/api/v1/criteria-versions/${versionId}/items`, {
        generalMax: 30,
        resultMax: 70,
        periodTypes: ['QUARTER'],
        ruleSetVersionId: ruleVersionId,
        items,
        version,
        ...extra,
      });

    it('phát hiện sai tổng điểm, thiếu trọng số và chặn trình khi còn lỗi', async () => {
      const items = sampleCriteriaItems();
      items[5] = { ...items[5]!, maxPoints: 60, scoringMethod: 'WEIGHTED_INDICATORS' };
      items.push(
        {
          key: 'k1',
          parentKey: 'ax',
          kind: 'AXIS_INDICATOR',
          code: 'T1.1',
          name: 'Chỉ tiêu 1',
          maxPoints: 0,
          scoringMethod: 'PASS_FAIL',
          sortOrder: 11,
          weight: 60,
        } as never,
        {
          key: 'k2',
          parentKey: 'ax',
          kind: 'AXIS_INDICATOR',
          code: 'T1.2',
          name: 'Chỉ tiêu 2',
          maxPoints: 0,
          scoringMethod: 'PASS_FAIL',
          sortOrder: 12,
          weight: 30,
        } as never,
      );
      const res = await save(items, 1);
      expect(res.status).toBe(200);
      const codes = (res.body.data.issues as { code: string }[]).map((i) => i.code);
      expect(codes).toContain('AXIS_TOTAL'); // 60 ≠ 70
      expect(codes).toContain('WEIGHT_TOTAL'); // 60 + 30 ≠ 100
      const submit = await officer.post(`/api/v1/criteria-versions/${versionId}/submit`, {
        note: 'Trình',
        version: 2,
      });
      expect(submit.status).toBe(422);
      expect(submit.body.error.details.map((d: { code: string }) => d.code)).toContain(
        'AXIS_TOTAL',
      );
    });

    it('mục cha không tồn tại bị từ chối', async () => {
      const res = await save(
        [
          {
            key: 'x',
            parentKey: 'khong-co',
            kind: 'GENERAL_ITEM',
            code: 'X',
            name: 'X',
            maxPoints: 1,
          },
        ],
        2,
      );
      expect(res.status).toBe(400);
    });

    it('lưu cây hợp lệ → trình → phê duyệt; bản đã duyệt không sửa được (API + trigger)', async () => {
      const res = await save(sampleCriteriaItems(), 2);
      expect(res.status).toBe(200);
      expect(
        (res.body.data.issues as { level: string }[]).filter((i) => i.level === 'error'),
      ).toEqual([]);
      expect(res.body.data.items).toHaveLength(6);

      expect(
        (
          await officer.post(`/api/v1/criteria-versions/${versionId}/submit`, {
            note: 'Trình',
            version: 3,
          })
        ).status,
      ).toBe(200);
      // Người soạn (officer) không có quyền phê duyệt; ptbA phê duyệt
      expect(
        (
          await officer.post(`/api/v1/criteria-versions/${versionId}/approve`, {
            note: 'x',
            version: 4,
          })
        ).status,
      ).toBe(403);
      const approved = await ptbA.post(`/api/v1/criteria-versions/${versionId}/approve`, {
        note: 'Phê duyệt',
        version: 4,
      });
      expect(approved.status).toBe(200);
      expect(approved.body.data.status).toBe('APPROVED');

      expect((await save(sampleCriteriaItems(), 5)).status).toBe(422);
      const item = await db.criteriaItem.findFirstOrThrow({
        where: { criteriaVersionId: versionId },
      });
      await expect(
        db.criteriaItem.update({ where: { id: item.id }, data: { maxPoints: 99 } }),
      ).rejects.toThrow();

      // Phiên bản mới sao chép toàn bộ cây để chỉnh sửa
      const v2 = await officer.post(`/api/v1/criteria-sets/${setId}/versions`, {});
      expect(v2.status).toBe(201);
      expect(v2.body.data.versionNo).toBe(2);
      expect(v2.body.data.status).toBe('DRAFT');
      expect(v2.body.data.items).toHaveLength(6);
    });

    it('người soạn không được tự phê duyệt', async () => {
      const set = await officer.post('/api/v1/criteria-sets', {
        code: `CS2-${fx.sfx}`,
        name: 'Bộ 2',
        kpiProfile: 'LEADER',
      });
      const v = await officer.post(`/api/v1/criteria-sets/${set.body.data.id}/versions`, {});
      const id = v.body.data.id as string;
      await officer.put(`/api/v1/criteria-versions/${id}/items`, {
        generalMax: 30,
        resultMax: 70,
        periodTypes: ['QUARTER'],
        ruleSetVersionId: ruleVersionId,
        items: sampleCriteriaItems(),
        version: 1,
      });
      await officer.post(`/api/v1/criteria-versions/${id}/submit`, { note: 'Trình', version: 2 });
      await db.criteriaVersion.update({
        where: { id },
        data: { createdById: await userId(db, fx.users.ptbA) },
      });
      const res = await ptbA.post(`/api/v1/criteria-versions/${id}/approve`, {
        note: 'Tự duyệt',
        version: 4,
      });
      expect(res.status).toBe(422);
    });
  });

  describe('Danh mục sản phẩm/công việc', () => {
    it('xem danh mục, phê duyệt (catalog.approve); bản đã duyệt bất biến', async () => {
      const catalog = await db.workCatalog.create({
        data: { code: `DM-${fx.sfx}`, name: 'Danh mục thử' },
      });
      const v = await db.workCatalogVersion.create({
        data: {
          catalogId: catalog.id,
          versionNo: 1,
          status: 'SUBMITTED',
          standardPoints: 90,
          items: {
            create: [
              {
                code: 'C.006',
                groupCode: 'C',
                name: 'Soạn thảo văn bản',
                complexityLevel: 2,
                points: 90,
                coefficient: 1,
              },
              {
                code: 'C.007',
                groupCode: 'C',
                name: 'Thẩm định hồ sơ',
                complexityLevel: 2,
                points: 110,
                coefficient: 1.222222,
              },
            ],
          },
        },
      });
      const items = await staffA1.get(`/api/v1/work-catalogs/versions/${v.id}/items?q=thẩm định`);
      expect(items.status).toBe(200);
      expect(items.body.data).toHaveLength(1);
      expect(items.body.data[0].coefficient).toBeCloseTo(1.222222, 6);

      expect(
        (
          await staffA1.post(`/api/v1/work-catalogs/versions/${v.id}/approve`, {
            note: 'x',
            version: 1,
          })
        ).status,
      ).toBe(403);
      const ok = await ptbA.post(`/api/v1/work-catalogs/versions/${v.id}/approve`, {
        note: 'Phê duyệt',
        version: 1,
      });
      expect(ok.status).toBe(200);
      expect(ok.body.data.status).toBe('APPROVED');
      const it0 = await db.workCatalogItem.findFirstOrThrow({ where: { catalogVersionId: v.id } });
      await expect(
        db.workCatalogItem.update({ where: { id: it0.id }, data: { points: 1 } }),
      ).rejects.toThrow();
    });
  });
});
