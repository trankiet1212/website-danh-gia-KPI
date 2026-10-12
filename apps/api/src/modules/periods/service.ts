/**
 * Kỳ đánh giá: tạo cây kỳ của một năm (Năm → 6 tháng → Quý → Tháng), cập nhật hạn, chuyển trạng thái.
 * Quý IV mặc định không xếp loại riêng ([QĐ39] Điều 14, [HD05] III.6) — có thể sửa cờ isRated theo quyết định cơ quan.
 */
import type { PeriodDto, PeriodStatus, PeriodType, UpdatePeriodInput } from '@kpi/shared';
import { PERIOD_STATUSES } from '@kpi/shared';
import { writeAudit, type AuditActor } from '../../lib/audit.js';
import { parseDateOnly, toDateOnly } from '../../lib/dates.js';
import { AppError } from '../../lib/errors.js';
import type { Db } from '../../lib/prisma.js';
import { createPeriodsRepository, type PeriodRow } from './repository.js';

export function toPeriodDto(p: PeriodRow): PeriodDto {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    type: p.type,
    year: p.year,
    seq: p.seq,
    startDate: toDateOnly(p.startDate),
    endDate: toDateOnly(p.endDate),
    parentId: p.parentId,
    status: p.status,
    isRated: p.isRated,
    selfDeadline: toDateOnly(p.selfDeadline),
    reviewDeadline: toDateOnly(p.reviewDeadline),
    submitDeadline: toDateOnly(p.submitDeadline),
    isDemo: p.isDemo,
    evaluationCount: p._count.evaluations,
    version: p.version,
  };
}

const utc = (y: number, m: number, day: number) => new Date(Date.UTC(y, m - 1, day));
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0));

/** Chỉ cho chuyển sang trạng thái liền kề (tiến hoặc lùi một bước). */
export function isAdjacentStatus(from: PeriodStatus, to: PeriodStatus): boolean {
  const i = PERIOD_STATUSES.indexOf(from);
  const j = PERIOD_STATUSES.indexOf(to);
  return Math.abs(i - j) === 1;
}

export function createPeriodsService(db: Db) {
  const repo = createPeriodsRepository(db);

  async function get(id: string) {
    const p = await repo.findById(id);
    if (!p) throw new AppError('NOT_FOUND', 'Không tìm thấy kỳ đánh giá');
    return p;
  }

  return {
    async list(filter: { year?: number; type?: PeriodType }) {
      return (await repo.list(filter)).map(toPeriodDto);
    },

    /** Tạo các kỳ còn thiếu của một năm (không ghi đè kỳ đã có). */
    async generateYear(year: number, actor: AuditActor) {
      const created: string[] = [];
      await repo.transaction(async (tx) => {
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
          const existing = await tx.evaluationPeriod.findUnique({ where: { code } });
          if (existing) return existing.id;
          const row = await tx.evaluationPeriod.create({
            data: {
              code,
              name,
              type,
              year,
              seq,
              startDate: start,
              endDate: end,
              parentId,
              isRated,
            },
          });
          created.push(code);
          return row.id;
        };
        const yearId = await upsert(
          'YEAR',
          1,
          `${year}`,
          `Năm ${year}`,
          utc(year, 1, 1),
          utc(year, 12, 31),
          null,
        );
        const roman = ['I', 'II', 'III', 'IV'];
        for (let h = 1; h <= 2; h++) {
          const halfId = await upsert(
            'HALF_YEAR',
            h,
            `${year}-H${h}`,
            `${h === 1 ? '6 tháng đầu' : '6 tháng cuối'} năm ${year}`,
            utc(year, h === 1 ? 1 : 7, 1),
            lastDay(year, h === 1 ? 6 : 12),
            yearId,
          );
          for (let q = h * 2 - 1; q <= h * 2; q++) {
            const qId = await upsert(
              'QUARTER',
              q,
              `${year}-Q${q}`,
              `Quý ${roman[q - 1]}/${year}`,
              utc(year, q * 3 - 2, 1),
              lastDay(year, q * 3),
              halfId,
              q !== 4,
            );
            for (let m = q * 3 - 2; m <= q * 3; m++) {
              await upsert(
                'MONTH',
                m,
                `${year}-M${String(m).padStart(2, '0')}`,
                `Tháng ${m}/${year}`,
                utc(year, m, 1),
                lastDay(year, m),
                qId,
              );
            }
          }
        }
        await writeAudit(tx, actor, {
          action: 'period.generate_year',
          entityType: 'period',
          entityId: String(year),
          changes: { created },
        });
      }, `period_year:${year}`);
      return { year, created };
    },

    async update(id: string, input: UpdatePeriodInput, actor: AuditActor) {
      const before = await get(id);
      const data = {
        name: input.name,
        isRated: input.isRated,
        selfDeadline: input.selfDeadline ? parseDateOnly(input.selfDeadline) : null,
        reviewDeadline: input.reviewDeadline ? parseDateOnly(input.reviewDeadline) : null,
        submitDeadline: input.submitDeadline ? parseDateOnly(input.submitDeadline) : null,
      };
      const ok = await repo.updateVersioned(id, input.version, data, (tx) =>
        writeAudit(tx, actor, {
          action: 'period.update',
          entityType: 'period',
          entityId: id,
          changes: { before: toPeriodDto(before), after: input },
        }),
      );
      if (ok === 0) {
        throw new AppError(
          'CONFLICT_VERSION',
          'Kỳ đánh giá đã được người khác cập nhật. Vui lòng tải lại.',
        );
      }
      return toPeriodDto(await get(id));
    },

    async transition(id: string, to: PeriodStatus, version: number, actor: AuditActor) {
      const p = await get(id);
      if (!isAdjacentStatus(p.status, to)) {
        throw new AppError(
          'INVALID_TRANSITION',
          `Không thể chuyển kỳ từ "${p.status}" sang "${to}" (chỉ chuyển một bước)`,
        );
      }
      const ok = await repo.updateVersioned(id, version, { status: to }, (tx) =>
        writeAudit(tx, actor, {
          action: 'period.transition',
          entityType: 'period',
          entityId: id,
          changes: { from: p.status, to },
        }),
      );
      if (ok === 0) {
        throw new AppError(
          'CONFLICT_VERSION',
          'Kỳ đánh giá đã được người khác cập nhật. Vui lòng tải lại.',
        );
      }
      return toPeriodDto(await get(id));
    },
  };
}
