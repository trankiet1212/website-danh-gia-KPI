/**
 * Seed DEMO cho GĐ5 — bộ quy tắc, danh mục SP/CV, bộ tiêu chí, OKR, hồ sơ đánh giá mẫu.
 *
 * Nguyên tắc:
 *  - Chỉ TẠO MỚI khi chưa có (theo mã); không bao giờ sửa bản đã xác nhận/phê duyệt hay hồ sơ đã có.
 *  - Bộ quy tắc ở trạng thái CHỜ XÁC NHẬN, danh mục và bộ tiêu chí ở trạng thái ĐÃ TRÌNH (chưa phê duyệt):
 *    người dùng DEMO có thẩm quyền tự xác nhận/phê duyệt trên giao diện để thử quy trình.
 *  - Tiêu chí chung lấy nguyên văn [HD05] Phụ lục 03 mục A (30 điểm). Trục kết quả 70 điểm là cấu hình TẠM (docs/09 #2).
 */
import { readFileSync } from 'node:fs';
import type { CompositeRow, ItemInput } from '@kpi/shared';
import type { Db } from '../../src/lib/prisma.js';
import { runCalculation } from '../../src/scoring/adapter.js';
import { checksumOf } from '../../src/scoring/checksum.js';
import { HD05_EXAMPLE_D, HD05_EXAMPLE_ROWS } from '../../src/scoring/demo-data.js';
import {
  QD39_HD05_CONFIG,
  QD39_HD05_LEGAL_BASIS,
  QD39_HD05_SOURCE_REFS,
} from './rule-config-qd39-hd05.js';

type Tx = Parameters<Parameters<Db['$transaction']>[0]>[0];

// ---------------------------------------------------------------- [HD05] Phụ lục 03 — A. Nhóm tiêu chí chung (30 điểm)
interface GeneralGroup {
  code: string;
  name: string;
  items: { code: string; name: string; points: number }[];
}

export const PL03_GENERAL: GeneralGroup[] = [
  {
    code: '1',
    name: 'Về phẩm chất chính trị, đạo đức, lối sống, thực hiện trách nhiệm nêu gương',
    items: [
      {
        code: '1.1',
        points: 2,
        name: 'Tuyệt đối trung thành với Đảng, Tổ quốc và Nhân dân; kiên định chủ nghĩa Mác - Lênin, tư tưởng Hồ Chí Minh, mục tiêu độc lập dân tộc và chủ nghĩa xã hội. Có lập trường, quan điểm, bản lĩnh chính trị vững vàng; kiên quyết bảo vệ nền tảng tư tưởng, Cương lĩnh chính trị, đường lối của Đảng, Hiến pháp, pháp luật của Nhà nước; đấu tranh phản bác các quan điểm sai trái, thù địch, các biểu hiện suy thoái, "tự diễn biến", "tự chuyển hoá".',
      },
      {
        code: '1.2',
        points: 2,
        name: 'Có tinh thần yêu nước sâu sắc, tận tụy phục vụ Nhân dân, sâu sát cơ sở, luôn hành động vì lợi ích của Nhân dân. Đặt lợi ích của Đảng, quốc gia - dân tộc, Nhân dân, tập thể lên trên lợi ích cá nhân, sẵn sàng hy sinh vì sự nghiệp cách mạng của Đảng, vì độc lập, tự do của Tổ quốc, vì hạnh phúc của Nhân dân.',
      },
      {
        code: '1.3',
        points: 2,
        name: 'Chấp hành nghiêm chủ trương, đường lối, nghị quyết, chỉ thị, quy định, nguyên tắc tổ chức, kỷ luật của Đảng, nhất là nguyên tắc tập trung dân chủ, tự phê bình và phê bình; chấp hành nghiêm pháp luật của Nhà nước và quy định của cơ quan, đơn vị. Tuyệt đối chấp hành sự phân công của tổ chức, yên tâm công tác và hoàn thành tốt mọi nhiệm vụ được giao.',
      },
      {
        code: '1.4',
        points: 2,
        name: 'Có tinh thần tự giác, trách nhiệm cao trong nghiên cứu, học tập chủ nghĩa Mác - Lênin, tư tưởng Hồ Chí Minh, các nghị quyết, chỉ thị của Đảng và các chương trình bồi dưỡng, cập nhật kiến thức mới nhằm nâng cao trình độ về mọi mặt, đáp ứng yêu cầu, nhiệm vụ.',
      },
      {
        code: '1.5',
        points: 2,
        name: 'Có phẩm chất đạo đức, lối sống trong sáng, trung thực, khiêm tốn, chân thành, giản dị; cần, kiệm, liêm, chính, chí công vô tư; chấp hành nghiêm quy định về chuẩn mực đạo đức cách mạng của cán bộ, đảng viên trong giai đoạn mới, trách nhiệm nêu gương; không vi phạm Quy định về những điều đảng viên không được làm. Không né tránh công việc, chạy theo thành tích; không vi phạm đạo đức, lối sống đến mức bị xử lý kỷ luật.',
      },
      {
        code: '1.6',
        points: 2,
        name: 'Không tham vọng quyền lực; không chạy chức, chạy quyền; không tham nhũng, lãng phí, cơ hội, vụ lợi, cục bộ, lợi ích nhóm; không để gia đình, người thân và người khác lợi dụng chức vụ, vị trí công tác để trục lợi. Không có biểu hiện suy thoái về tư tưởng chính trị, đạo đức, lối sống, những biểu hiện "tự diễn biến", "tự chuyển hoá" trong nội bộ. Kiên quyết đấu tranh chống quan liêu, cửa quyền, tham nhũng, xa hoa, lãng phí, tiêu cực, chủ nghĩa cá nhân, lối sống cơ hội, thực dụng, bè phái, lợi ích nhóm, nói không đi đôi với làm.',
      },
      {
        code: '1.7',
        points: 2,
        name: 'Có uy tín cao, tiêu biểu về phẩm chất đạo đức và phong cách công tác; là trung tâm đoàn kết, thương yêu đồng chí, đồng nghiệp.',
      },
      {
        code: '1.8',
        points: 2,
        name: 'Có tinh thần chủ động, đổi mới sáng tạo; phấn đấu vì mục tiêu phát triển của cơ quan, đơn vị, đóng góp vào mục tiêu chung của đất nước.',
      },
      {
        code: '1.9',
        points: 2,
        name: 'Thực hiện việc kê khai và công khai tài sản, thu nhập theo quy định. Báo cáo đầy đủ, trung thực, cung cấp thông tin chính xác, khách quan về những nội dung liên quan đến việc thực hiện chức trách, nhiệm vụ được giao và hoạt động của cơ quan, tổ chức, đơn vị với cấp trên khi được yêu cầu.',
      },
    ],
  },
  {
    code: '2',
    name: 'Tư duy đổi mới, chiến lược, khát vọng cống hiến, dám nghĩ, dám làm',
    items: [
      {
        code: '2.1',
        points: 1,
        name: 'Có tư duy đổi mới, tầm nhìn chiến lược, khả năng lãnh đạo, chỉ đạo thích ứng với sự phát triển của thời đại và xu thế toàn cầu hoá; phương pháp làm việc khoa học, nhạy bén chính trị; có năng lực cụ thể hoá trong lãnh đạo, chỉ đạo cơ quan, đơn vị thực hiện và hoàn thành tốt chức năng, nhiệm vụ được giao.',
      },
      {
        code: '2.2',
        points: 1,
        name: 'Luôn bám sát thực tiễn, có nhiều cách làm hay, sáng tạo, đạt hiệu quả cao trong lãnh đạo, chỉ đạo, tổ chức thực hiện nhiệm vụ; xây dựng cấp uỷ, tổ chức đảng trong sạch, vững mạnh, cơ quan, đơn vị vững mạnh toàn diện.',
      },
      {
        code: '2.3',
        points: 1,
        name: 'Nói đi đôi với làm, dám nghĩ, dám làm, dám chịu trách nhiệm, dám đột phá vì lợi ích chung. Có khả năng phân tích, dự báo tình hình, phát hiện những khó khăn, bất cập, thời cơ, thuận lợi trong thực tiễn; đề xuất hoặc quyết định những giải pháp phù hợp, kịp thời, hiệu quả.',
      },
      {
        code: '2.4',
        points: 1,
        name: 'Có khát vọng phấn đấu, cống hiến; có khả năng quy tụ và phát huy được sức mạnh của tập thể, cá nhân trong cơ quan, đơn vị và các cơ quan, đơn vị có liên quan.',
      },
    ],
  },
  {
    code: '3',
    name: 'Về tự phê bình và phê bình, tự soi, tự sửa, khắc phục hạn chế, khuyết điểm',
    items: [
      {
        code: '3.1',
        points: 2,
        name: 'Chủ động, nghiêm túc thực hiện tự phê bình và phê bình, có tinh thần cầu thị và tiếp thu phản biện, góp ý.',
      },
      {
        code: '3.2',
        points: 2,
        name: 'Có kế hoạch rõ ràng và quyết liệt trong khắc phục hạn chế, khuyết điểm đã được chỉ ra.',
      },
      {
        code: '3.3',
        points: 2,
        name: 'Kết quả khắc phục hoàn thành từ ≥ 80% nội dung, có tiến bộ rõ, được tổ chức đánh giá tốt; không để tái diễn tồn tại.',
      },
      {
        code: '3.4',
        points: 2,
        name: 'Tự soi, tự sửa trên tinh thần trách nhiệm chính trị cao, không né tránh, không đổ lỗi.',
      },
    ],
  },
];

const AXIS_CODE = 'T1';
const AXIS_NAME = 'Kết quả thực hiện nhiệm vụ được giao theo vị trí việc làm';
const AXIS_NOTE =
  'CẤU HÌNH TẠM (docs/09 #2): một trục 70 điểm, chấm theo KPI tổng hợp [HD05] Phụ lục 2. Cơ quan cần phân bổ trục và điểm tối đa theo từng VTVL.';

interface CriteriaSeed {
  code: string;
  name: string;
  profile: 'LEADER' | 'STAFF';
  description: string;
  withCatalog: boolean;
}

const CRITERIA_SETS: CriteriaSeed[] = [
  {
    code: 'CS-LD',
    name: 'Bộ tiêu chí đánh giá hằng quý cán bộ lãnh đạo, quản lý',
    profile: 'LEADER',
    description:
      'Tiêu chí chung theo [HD05] Phụ lục 03 mục A (30 điểm); kết quả nhiệm vụ 70 điểm (trục tạm). Điểm KPI = (A+B+C+D)/4.',
    withCatalog: true,
  },
  {
    code: 'CS-CV',
    name: 'Bộ tiêu chí đánh giá hằng quý công chức chuyên môn (tạm)',
    profile: 'STAFF',
    description:
      'TẠM ÁP DỤNG khung tiêu chí chung của [HD05] Phụ lục 03 cho công chức không giữ chức vụ (chưa có căn cứ — docs/09). Điểm KPI = (A+B+C)/3 (tạm).',
    withCatalog: true,
  },
];

// ---------------------------------------------------------------- OKR từ sơ đồ phân công
interface OrgPositionSeed {
  key: string;
  vacant: boolean;
  demoName: string | null;
  kpiOkr: string;
}

interface ParsedOkr {
  objective: string;
  description: string | null;
  krs: string[];
}

const clean = (s: string) =>
  s
    .trim()
    .replace(/[.;]+$/, '')
    .trim();

/** Tách chuỗi "O: ... KR1: ... KR2: ..." hoặc "KPI: ... OKR: a; b; c" thành mục tiêu + KR. */
export function parseOkrText(text: string): ParsedOkr | null {
  const o = /O:\s*(.+?)\s*KR1:/s.exec(text);
  if (o?.[1]) {
    const krs = text
      .slice(text.indexOf('KR1:'))
      .split(/KR\d+:\s*/)
      .map(clean)
      .filter(Boolean);
    return { objective: clean(o[1]), description: null, krs };
  }
  const idx = text.indexOf('OKR:');
  if (idx >= 0) {
    const kpi = clean(text.slice(0, idx).replace(/^KPI:\s*/, ''));
    const krs = text
      .slice(idx + 4)
      .split(';')
      .map(clean)
      .filter(Boolean);
    return {
      objective: 'Hoàn thành nhiệm vụ trọng tâm theo vị trí việc làm',
      description: kpi ? `KPI thường xuyên: ${kpi}` : null,
      krs,
    };
  }
  return null;
}

export function krMeasure(title: string): {
  measureType: 'PERCENT' | 'BOOLEAN' | 'MILESTONE';
  target: number;
  measureUnit: string;
} {
  const m = /(\d+(?:[.,]\d+)?)\s*%/.exec(title);
  if (m?.[1])
    return { measureType: 'PERCENT', target: Number(m[1].replace(',', '.')), measureUnit: '%' };
  if (/^không\b/i.test(title))
    return { measureType: 'BOOLEAN', target: 1, measureUnit: 'Đạt (1) / Không đạt (0)' };
  return { measureType: 'MILESTONE', target: 1, measureUnit: 'Mốc hoàn thành' };
}

// ---------------------------------------------------------------- Seed
async function seedRuleSet(tx: Tx) {
  const set = await tx.ruleSet.upsert({
    where: { code: 'RS-CANHAN' },
    update: {},
    create: {
      code: 'RS-CANHAN',
      name: 'Quy tắc tính điểm, xếp loại cá nhân theo 39-QĐ/TU và 05-HD/TU',
      description:
        'Bộ quy tắc DEMO trích từ văn bản — CHỜ XÁC NHẬN. Các khóa "tạm" xem provisionalKeys và docs/09.',
    },
  });
  const existing = await tx.ruleSetVersion.findFirst({
    where: { ruleSetId: set.id },
    orderBy: { versionNo: 'asc' },
  });
  if (existing) return existing.id;
  const v = await tx.ruleSetVersion.create({
    data: {
      ruleSetId: set.id,
      versionNo: 1,
      status: 'PENDING_CONFIRMATION',
      config: QD39_HD05_CONFIG as object,
      legalBasis: QD39_HD05_LEGAL_BASIS,
      sourceRefs: QD39_HD05_SOURCE_REFS as object[],
      checksum: checksumOf(QD39_HD05_CONFIG),
    },
  });
  return v.id;
}

async function seedWorkCatalog(tx: Tx) {
  const file = new URL('./data/work-catalog-btctu.json', import.meta.url);
  const data = JSON.parse(readFileSync(file, 'utf8')) as {
    _comment: string;
    standardPoints: number;
    items: {
      code: string;
      groupCode: string;
      name: string;
      product: string | null;
      complexityLevel: number;
      maxHoursText: string | null;
      points: number;
      note: string | null;
    }[];
  };
  const catalog = await tx.workCatalog.upsert({
    where: { code: 'DM-BTCTU' },
    update: {},
    create: {
      code: 'DM-BTCTU',
      name: 'Danh mục sản phẩm/công việc của Ban Tổ chức Tỉnh ủy',
      description: data._comment,
    },
  });
  const existing = await tx.workCatalogVersion.findFirst({
    where: { catalogId: catalog.id },
    orderBy: { versionNo: 'asc' },
  });
  if (existing) return { id: existing.id, created: 0 };
  const v = await tx.workCatalogVersion.create({
    data: {
      catalogId: catalog.id,
      versionNo: 1,
      status: 'SUBMITTED',
      standardPoints: data.standardPoints,
      legalBasis:
        '[HD05] Phụ lục 1 — hệ số quy đổi = điểm sản phẩm / điểm sản phẩm chuẩn. Trạng thái phê duyệt chưa xác nhận (docs/09).',
    },
  });
  let order = 0;
  for (const it of data.items) {
    await tx.workCatalogItem.create({
      data: {
        catalogVersionId: v.id,
        code: it.code,
        groupCode: it.groupCode,
        name: it.name,
        product: it.product,
        complexityLevel: it.complexityLevel,
        maxHoursText: it.maxHoursText,
        points: it.points,
        coefficient: Math.round((it.points / data.standardPoints) * 1e6) / 1e6,
        note: it.note,
        sortOrder: ++order,
      },
    });
  }
  return { id: v.id, created: data.items.length };
}

async function seedCriteria(tx: Tx, ruleSetVersionId: string, catalogVersionId: string) {
  const ids = new Map<string, string>();
  for (const cs of CRITERIA_SETS) {
    const set = await tx.criteriaSet.upsert({
      where: { code: cs.code },
      update: {},
      create: { code: cs.code, name: cs.name, kpiProfile: cs.profile, description: cs.description },
    });
    const existing = await tx.criteriaVersion.findFirst({
      where: { criteriaSetId: set.id },
      orderBy: { versionNo: 'asc' },
    });
    if (existing) {
      ids.set(cs.code, existing.id);
      continue;
    }
    // Trigger chỉ cho ghi mục khi phiên bản là DRAFT → tạo nháp, ghi mục, rồi chuyển "đã trình"
    const v = await tx.criteriaVersion.create({
      data: {
        criteriaSetId: set.id,
        versionNo: 1,
        status: 'DRAFT',
        // Tháng: dùng tạm cùng bộ tiêu chí quý theo yêu cầu người dùng (docs/09 #3)
        periodTypes: ['MONTH', 'QUARTER'],
        generalMax: 30,
        resultMax: 70,
        ruleSetVersionId,
        workCatalogVersionId: cs.withCatalog ? catalogVersionId : null,
        changeNote: 'Phiên bản DEMO khởi tạo từ [HD05] Phụ lục 03',
      },
    });
    let order = 0;
    for (const g of PL03_GENERAL) {
      const group = await tx.criteriaItem.create({
        data: {
          criteriaVersionId: v.id,
          kind: 'GENERAL_GROUP',
          code: g.code,
          name: g.name,
          maxPoints: g.items.reduce((s, i) => s + i.points, 0),
          sortOrder: ++order,
        },
      });
      for (const it of g.items) {
        await tx.criteriaItem.create({
          data: {
            criteriaVersionId: v.id,
            parentId: group.id,
            kind: 'GENERAL_ITEM',
            code: it.code,
            name: it.name,
            maxPoints: it.points,
            scoringMethod: 'PASS_FAIL',
            dataSource: '[HD05] Phụ lục 03 mục A',
            sortOrder: ++order,
          },
        });
      }
    }
    await tx.criteriaItem.create({
      data: {
        criteriaVersionId: v.id,
        kind: 'AXIS',
        code: AXIS_CODE,
        name: AXIS_NAME,
        description: AXIS_NOTE,
        maxPoints: 70,
        scoringMethod: 'KPI_COMPOSITE',
        measureUnit: '%',
        evidenceRequired: true,
        dataSource: 'Bảng theo dõi nhiệm vụ, danh mục SP/CV ([HD05] Phụ lục 1, 2)',
        sortOrder: 100,
      },
    });
    await tx.criteriaVersion.update({ where: { id: v.id }, data: { status: 'SUBMITTED' } });
    ids.set(cs.code, v.id);
  }
  return ids;
}

async function seedObjectives(tx: Tx, year: number) {
  const period = await tx.evaluationPeriod.findUnique({ where: { code: `${year}` } });
  if (!period) return 0;
  const file = new URL('./data/org-structure.json', import.meta.url);
  const { positions } = JSON.parse(readFileSync(file, 'utf8')) as { positions: OrgPositionSeed[] };
  let created = 0;
  for (const p of positions) {
    if (p.vacant || !p.demoName) continue;
    const parsed = parseOkrText(p.kpiOkr);
    if (!parsed || parsed.krs.length === 0) continue;
    const emp = await tx.employee.findUnique({ where: { employeeCode: `DEMO-${p.key}` } });
    if (!emp) continue;
    const code = `DEMO-${p.key}-O1`;
    if (await tx.objective.findUnique({ where: { periodId_code: { periodId: period.id, code } } }))
      continue;
    const obj = await tx.objective.create({
      data: {
        periodId: period.id,
        ownerKind: 'EMPLOYEE',
        ownerEmployeeId: emp.id,
        code,
        title: parsed.objective,
        description: [parsed.description, 'DỮ LIỆU DEMO — trích từ sơ đồ phân công (cột KPI/OKR).']
          .filter(Boolean)
          .join('\n'),
        status: 'ACTIVE',
        isDemo: true,
      },
    });
    let n = 0;
    for (const title of parsed.krs) {
      n++;
      const m = krMeasure(title);
      await tx.keyResult.create({
        data: {
          objectiveId: obj.id,
          code: `KR${n}`,
          title,
          kind: 'KR',
          measureType: m.measureType,
          direction: 'INCREASE',
          measureUnit: m.measureUnit,
          baseline: 0,
          target: m.target,
          dueDate: new Date(Date.UTC(year, 11, 31)),
          sortOrder: n,
        },
      });
    }
    created++;
  }
  return created;
}

const assignmentOf = (tx: Tx, employeeId: string) =>
  tx.employeeAssignment.findFirst({
    where: { employeeId, isPrimary: true, endDate: null },
    include: {
      unit: { select: { id: true, name: true } },
      position: { select: { id: true, name: true, kpiProfile: true } },
      jobPosition: { select: { id: true, name: true } },
    },
  });

/** Hồ sơ đánh giá mẫu (bỏ qua nếu đối tượng đã có hồ sơ trong kỳ). */
async function seedEvaluation(
  tx: Tx,
  args: {
    periodCode: string;
    employeeKey: string;
    criteriaVersionId: string;
    inputs: (codeToId: Map<string, string>) => Record<string, ItemInput>;
    submit: boolean;
  },
) {
  const period = await tx.evaluationPeriod.findUnique({ where: { code: args.periodCode } });
  const emp = await tx.employee.findUnique({ where: { employeeCode: `DEMO-${args.employeeKey}` } });
  if (!period || !emp) return false;
  if (
    await tx.evaluationRecord.findFirst({
      where: { periodId: period.id, subjectEmployeeId: emp.id },
    })
  )
    return false;
  const asg = await assignmentOf(tx, emp.id);
  const cv = await tx.criteriaVersion.findUniqueOrThrow({
    where: { id: args.criteriaVersionId },
    include: { items: true, ruleSetVersion: true },
  });
  if (!asg || !cv.ruleSetVersion) return false;

  const codeToId = new Map(cv.items.map((i) => [i.code, i.id]));
  const inputs = args.inputs(codeToId);
  const rec = await tx.evaluationRecord.create({
    data: {
      periodId: period.id,
      subjectKind: 'EMPLOYEE',
      subjectEmployeeId: emp.id,
      unitId: asg.unit.id,
      assignmentSnapshot: {
        unit: asg.unit,
        position: { id: asg.position.id, name: asg.position.name },
        jobPosition: asg.jobPosition,
        managerEmployeeId: asg.managerEmployeeId,
      },
      kpiProfile: asg.position.kpiProfile,
      criteriaVersionId: cv.id,
      ruleSetVersionId: cv.ruleSetVersion.id,
      isDemo: true,
    },
  });
  await tx.evaluationHistory.create({
    data: { evaluationId: rec.id, action: 'create', toStatus: 'DRAFT', comment: 'Tạo hồ sơ DEMO' },
  });
  for (const [criteriaItemId, input] of Object.entries(inputs)) {
    await tx.evaluationItem.create({
      data: { evaluationId: rec.id, criteriaItemId, selfInput: input as object },
    });
  }
  if (!args.submit) return true;

  const snap = runCalculation({
    profile: asg.position.kpiProfile,
    generalMax: cv.generalMax.toNumber(),
    resultMax: cv.resultMax.toNumber(),
    items: cv.items,
    inputs,
    flags: [],
    ruleConfig: cv.ruleSetVersion.config,
    ruleChecksum: cv.ruleSetVersion.checksum,
    ruleConfirmed: cv.ruleSetVersion.status === 'CONFIRMED',
    criteriaVersionId: cv.id,
  });
  await tx.evaluationCalculation.create({
    data: {
      evaluationId: rec.id,
      kind: 'SELF',
      revisionNo: 1,
      engineVersion: snap.engineVersion,
      ruleSetVersionId: cv.ruleSetVersion.id,
      ruleSetChecksum: snap.ruleSetChecksum,
      criteriaVersionId: cv.id,
      inputs: JSON.parse(JSON.stringify(snap.inputs)) as object,
      result: JSON.parse(JSON.stringify(snap.result)) as object,
      checksum: snap.checksum,
    },
  });
  await tx.evaluationRecord.update({
    where: { id: rec.id },
    data: {
      status: 'SUBMITTED',
      selfTotal: snap.result.totalRounded,
      selfRating: snap.result.rating.eligible,
      submittedAt: new Date(),
      version: { increment: 1 },
    },
  });
  await tx.evaluationHistory.create({
    data: {
      evaluationId: rec.id,
      action: 'submit',
      fromStatus: 'DRAFT',
      toStatus: 'SUBMITTED',
      comment: 'Nộp tự đánh giá (DEMO)',
    },
  });
  return true;
}

const allGeneralPass = (codeToId: Map<string, string>) => {
  const out: Record<string, ItemInput> = {};
  for (const g of PL03_GENERAL)
    for (const it of g.items) out[codeToId.get(it.code)!] = { passed: true };
  return out;
};

/** Một vài sản phẩm trong danh mục cho hồ sơ chuyên viên DEMO (hệ số = điểm/90). */
function staffRows(): CompositeRow[] {
  const row = (
    label: string,
    code: string,
    coefficient: number,
    planned: number,
    done: number,
    extra: Partial<CompositeRow> = {},
  ): CompositeRow => ({
    label,
    catalogItemCode: code,
    coefficient,
    plannedQty: planned,
    completedQty: done,
    reworkQty: 0,
    reworkCount: 0,
    lateQty: 0,
    lateCount: 0,
    exemptCount: 0,
    exemptNote: null,
    exceeded: false,
    ...extra,
  });
  return [
    row('Soạn thảo công văn, báo cáo, thông báo (C.006)', 'C.006', 1, 6, 6),
    row(
      'Tổng hợp hồ sơ, thẩm định tiêu chuẩn (C.007)',
      'C.007',
      Math.round((110 / 90) * 1e6) / 1e6,
      2,
      2,
      { lateQty: 1, lateCount: 1 },
    ),
    row(
      'Cập nhật thông tin cán bộ, đảng viên (C.005)',
      'C.005',
      Math.round((70 / 90) * 1e6) / 1e6,
      4,
      3,
    ),
  ];
}

export async function seedKpiDemo(tx: Tx, year: number) {
  // Kỳ DEMO Quý II đang ở giai đoạn tự đánh giá để dùng thử quy trình (chỉ chuyển nếu còn "đang chuẩn bị")
  await tx.evaluationPeriod.updateMany({
    where: { code: `${year}-Q2`, isDemo: true, status: 'PLANNING' },
    data: { status: 'SELF_ASSESSMENT', version: { increment: 1 } },
  });
  const ruleSetVersionId = await seedRuleSet(tx);
  const catalog = await seedWorkCatalog(tx);
  const criteria = await seedCriteria(tx, ruleSetVersionId, catalog.id);
  const objectives = await seedObjectives(tx, year);
  let evaluations = 0;
  // Ví dụ [HD05] Phụ lục 2: Phó Trưởng ban phụ trách TCCB, Quý II — đã nộp tự đánh giá
  if (
    await seedEvaluation(tx, {
      periodCode: `${year}-Q2`,
      employeeKey: 'P03',
      criteriaVersionId: criteria.get('CS-LD')!,
      inputs: (ids) => ({
        ...allGeneralPass(ids),
        [ids.get(AXIS_CODE)!]: { rows: HD05_EXAMPLE_ROWS, dScores: HD05_EXAMPLE_D },
      }),
      submit: true,
    })
  )
    evaluations++;
  // Chuyên viên Phòng TCCB, Quý II — bản nháp đang tự đánh giá
  if (
    await seedEvaluation(tx, {
      periodCode: `${year}-Q2`,
      employeeKey: 'P20',
      criteriaVersionId: criteria.get('CS-CV')!,
      inputs: (ids) => ({ ...allGeneralPass(ids), [ids.get(AXIS_CODE)!]: { rows: staffRows() } }),
      submit: false,
    })
  )
    evaluations++;
  return { catalogItems: catalog.created, criteriaSets: criteria.size, objectives, evaluations };
}
