/**
 * Phân danh mục sản phẩm/công việc mặc định cho từng vị trí việc làm (docs/07, docs/09 #36 — tạm).
 * Căn cứ: tiêu đề nhóm trong file nguồn "Danh mục công việc của BTCTU":
 *   A — VTVL lãnh đạo, quản lý (áp dụng cả Lãnh đạo Ban: suy luận)
 *   B — VTVL chuyên môn dùng chung (văn thư; hành chính; tài chính nội bộ)
 *   C — VTVL chuyên môn, nghiệp vụ
 *   D — Nhóm công việc khác: mọi VTVL, trừ D.002 (vệ sinh), D.004 (đưa đón, lễ tân) → VTVL dùng chung (suy luận)
 * Chỉ phân cho VTVL CHƯA có mục nào — không ghi đè cấu hình cán bộ tổng hợp đã chỉnh.
 */
import type { Db } from '../../src/lib/prisma.js';

type Tx = Parameters<Parameters<Db['$transaction']>[0]>[0];
type JobGroup = 'LEADERSHIP' | 'PROFESSIONAL' | 'SHARED_SUPPORT';

const GROUP_TO_JOB: Record<string, JobGroup> = {
  A: 'LEADERSHIP',
  B: 'SHARED_SUPPORT',
  C: 'PROFESSIONAL',
};
const SHARED_ONLY_D = new Set(['D.002', 'D.004']);

/** Mục có áp dụng cho nhóm VTVL không (quy tắc mặc định). */
export function appliesByDefault(item: { code: string; groupCode: string }, group: JobGroup) {
  if (item.groupCode === 'D')
    return SHARED_ONLY_D.has(item.code) ? group === 'SHARED_SUPPORT' : true;
  return GROUP_TO_JOB[item.groupCode] === group;
}

export async function seedJobPositionWorkItems(tx: Tx | Db): Promise<number> {
  const items = await tx.workCatalogItem.findMany({
    select: { code: true, groupCode: true },
    distinct: ['code'],
  });
  const jobs = await tx.jobPosition.findMany({
    select: { id: true, group: true, _count: { select: { workItems: true } } },
  });
  let created = 0;
  for (const job of jobs) {
    if (job._count.workItems > 0) continue;
    const codes = items.filter((i) => appliesByDefault(i, job.group)).map((i) => i.code);
    const res = await tx.jobPositionWorkItem.createMany({
      data: codes.map((itemCode) => ({ jobPositionId: job.id, itemCode })),
      skipDuplicates: true,
    });
    created += res.count;
  }
  return created;
}
