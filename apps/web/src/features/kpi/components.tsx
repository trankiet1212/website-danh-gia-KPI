/** Thành phần dùng chung cho các màn hình KPI/OKR: nhãn trạng thái, cảnh báo, giải thích kết quả tính điểm. */
import { AlertTriangle, CircleAlert, Info } from 'lucide-react';
import {
  APPROVAL_STATUS_LABELS,
  CONFIG_STATUS_LABELS,
  EVALUATION_STATUS_LABELS,
  KPI_COMPONENT_LABELS,
  type ApprovalStatus,
  type ConfigStatus,
  type EvaluationStatus,
  type ItemScore,
  type ScoreIssue,
  type ScoreResult,
  type ValidationIssue,
} from '@kpi/shared';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/table';
import { cn } from '@/lib/utils';

type Variant = BadgeProps['variant'];

const STATUS_VARIANT: Record<string, Variant> = {
  DRAFT: 'outline',
  PENDING_CONFIRMATION: 'warning',
  SUBMITTED: 'warning',
  UNDER_REVIEW: 'warning',
  REVIEWED: 'secondary',
  RETURNED: 'destructive',
  REOPENED: 'warning',
  CONFIRMED: 'success',
  APPROVED: 'success',
  RETIRED: 'secondary',
  CANCELLED: 'secondary',
};

/**
 * Nhãn theo loại đối tượng: cùng mã trạng thái (ví dụ SUBMITTED) có nghĩa khác nhau —
 * hồ sơ đánh giá "Đã nộp, chờ thẩm định" nhưng bộ tiêu chí/danh mục "Đã trình".
 */
const LABELS: Record<'evaluation' | 'approval' | 'config', Record<string, string>> = {
  evaluation: EVALUATION_STATUS_LABELS,
  approval: APPROVAL_STATUS_LABELS,
  config: CONFIG_STATUS_LABELS,
};

export function StatusBadge({
  status,
  kind = 'evaluation',
}: {
  status: ConfigStatus | ApprovalStatus | EvaluationStatus;
  /** evaluation: hồ sơ đánh giá; approval: bộ tiêu chí, danh mục; config: bộ quy tắc. */
  kind?: 'evaluation' | 'approval' | 'config';
}) {
  return (
    <Badge variant={STATUS_VARIANT[status] ?? 'outline'}>{LABELS[kind][status] ?? status}</Badge>
  );
}

/** Hiển thị số theo kiểu Việt Nam (dấu phẩy thập phân). */
export function Num({
  value,
  digits = 2,
  suffix,
}: {
  value: number | null | undefined;
  digits?: number;
  suffix?: string;
}) {
  if (value === null || value === undefined)
    return <span className="text-muted-foreground">—</span>;
  return (
    <span className="tabular-nums">
      {value.toLocaleString('vi-VN', { maximumFractionDigits: digits })}
      {suffix}
    </span>
  );
}

export function Pct({ value, digits = 2 }: { value: number | null | undefined; digits?: number }) {
  return (
    <Num
      value={value === null || value === undefined ? value : value * 100}
      digits={digits}
      suffix="%"
    />
  );
}

/** Danh sách lỗi/cảnh báo (kiểm tra bộ tiêu chí hoặc kết quả tính điểm). */
export function IssueList({
  issues,
  empty,
}: {
  issues: (ValidationIssue | ScoreIssue)[];
  empty?: string;
}) {
  if (issues.length === 0) {
    return empty ? <p className="text-sm text-muted-foreground">{empty}</p> : null;
  }
  return (
    <ul className="space-y-1.5" aria-label="Lỗi và cảnh báo">
      {issues.map((i, idx) => (
        <li
          key={`${i.code}-${idx}`}
          className={cn(
            'flex gap-2 rounded-md border px-3 py-2 text-sm',
            i.level === 'error'
              ? 'border-destructive/40 bg-destructive/5'
              : 'border-warning/50 bg-warning/10',
          )}
        >
          {i.level === 'error' ? (
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-label="Lỗi" />
          ) : (
            <AlertTriangle
              className="mt-0.5 size-4 shrink-0 text-warning-foreground"
              aria-label="Cảnh báo"
            />
          )}
          <span>
            {i.itemCode && <strong className="mr-1">[{i.itemCode}]</strong>}
            {i.message}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Thông báo dữ liệu/cấu hình tạm, chưa được xác nhận. */
export function ProvisionalNotice({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="note"
      className="flex gap-2 rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-sm"
    >
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}

function ItemRows({ items, depth = 0 }: { items: ItemScore[]; depth?: number }) {
  return (
    <>
      {items.map((i) => (
        <ItemRow key={i.criteriaItemId} item={i} depth={depth} />
      ))}
    </>
  );
}

function ItemRow({ item, depth }: { item: ItemScore; depth: number }) {
  const isGroup = item.kind === 'GENERAL_GROUP';
  return (
    <>
      <Tr className={isGroup ? 'bg-muted/40 font-medium' : undefined}>
        <Td
          className="align-top whitespace-nowrap"
          style={{ paddingLeft: `${0.75 + depth * 1.25}rem` }}
        >
          {item.code}
        </Td>
        <Td className="align-top">
          <p className="line-clamp-2" title={item.name}>
            {item.name}
          </p>
          {item.steps.length > 0 && !isGroup && (
            <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              {item.steps.map((s, idx) => (
                <li key={idx}>{s}</li>
              ))}
            </ul>
          )}
          {item.components && (
            <ul className="mt-1 space-y-0.5 text-xs">
              {(
                Object.entries(item.components) as [
                  keyof typeof KPI_COMPONENT_LABELS,
                  { formula: string },
                ][]
              ).map(([k, v]) => (
                <li key={k}>
                  <strong>{KPI_COMPONENT_LABELS[k]}:</strong> {v.formula}
                </li>
              ))}
            </ul>
          )}
        </Td>
        <Td className="text-right align-top">
          <Num value={item.maxPoints} />
        </Td>
        <Td className="text-right align-top">
          {item.notApplicable ? (
            <Badge variant="secondary">Không áp dụng</Badge>
          ) : (
            <Pct value={item.ratio} />
          )}
        </Td>
        <Td className="text-right align-top font-medium">
          <Num value={item.points} digits={4} />
        </Td>
      </Tr>
      {item.rows && item.rows.length > 0 && (
        <Tr>
          <Td />
          <Td colSpan={4}>
            <CompositeRowsTable rows={item.rows} />
          </Td>
        </Tr>
      )}
      {item.children && <ItemRows items={item.children} depth={depth + 1} />}
    </>
  );
}

function CompositeRowsTable({ rows }: { rows: NonNullable<ItemScore['rows']> }) {
  return (
    <div className="overflow-x-auto rounded border">
      <table className="w-full text-xs">
        <caption className="sr-only">Bảng quy đổi sản phẩm/công việc</caption>
        <thead className="bg-muted/50">
          <tr>
            <th className="px-2 py-1 text-left">Nhiệm vụ</th>
            <th className="px-2 py-1 text-right">Hệ số</th>
            <th className="px-2 py-1 text-right">KH quy đổi</th>
            <th className="px-2 py-1 text-right">HT quy đổi</th>
            <th className="px-2 py-1 text-right">Chất lượng</th>
            <th className="px-2 py-1 text-right">Tiến độ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t">
              <td className="px-2 py-1">{r.label}</td>
              <td className="px-2 py-1 text-right">
                <Num value={r.coefficient} digits={4} />
              </td>
              <td className="px-2 py-1 text-right">
                <Num value={r.plannedConverted} digits={4} />
              </td>
              <td className="px-2 py-1 text-right">
                <Num value={r.completedConverted} digits={4} />
              </td>
              <td className="px-2 py-1 text-right">
                <Num value={r.qualityConverted} digits={4} />
              </td>
              <td className="px-2 py-1 text-right">
                <Num value={r.timelinessConverted} digits={4} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Kết quả tính điểm kèm giải thích từng bước (đối chiếu được với bảng của [HD05] Phụ lục 2). */
export function ScoreResultView({ result }: { result: ScoreResult }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Metric
          label="Tiêu chí chung"
          value={
            <>
              <Num value={result.general.score} digits={4} /> / {result.general.max}
            </>
          }
        />
        <Metric
          label="Kết quả nhiệm vụ"
          value={
            <>
              <Num value={result.result.score} digits={4} /> / {result.result.max}
            </>
          }
        />
        <Metric
          label="Tổng điểm (đã làm tròn)"
          value={<Num value={result.totalRounded} digits={4} />}
          strong
        />
        <Metric
          label="Mức xếp loại đề xuất"
          value={
            <span>
              {result.rating.eligibleLabel ?? 'Chưa xác định'}
              {result.rating.provisional && (
                <Badge variant="warning" className="ml-2">
                  Tạm
                </Badge>
              )}
            </span>
          }
        />
      </div>
      {!result.complete && (
        <ProvisionalNotice>
          Kết quả chưa đầy đủ — còn mục thiếu dữ liệu hoặc có lỗi; chưa đề xuất xếp loại.
        </ProvisionalNotice>
      )}
      <IssueList issues={result.issues} />

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <THead>
            <Tr>
              <Th className="w-20">Mã</Th>
              <Th>Tiêu chí và cách tính</Th>
              <Th className="w-24 text-right">Tối đa</Th>
              <Th className="w-28 text-right">Tỷ lệ đạt</Th>
              <Th className="w-28 text-right">Điểm</Th>
            </Tr>
          </THead>
          <TBody>
            <ItemRows items={result.general.items} />
            <ItemRows items={result.result.items} />
          </TBody>
        </Table>
      </div>

      <section className="space-y-1">
        <h3 className="text-sm font-semibold">Xếp loại — các bước xét</h3>
        <ol className="list-decimal space-y-0.5 pl-5 text-sm">
          {result.rating.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      </section>
      <section className="space-y-1">
        <h3 className="text-sm font-semibold">Diễn giải tổng hợp</h3>
        <ul className="list-disc space-y-0.5 pl-5 text-sm">
          {result.explanation.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          Phiên bản engine tính điểm: {result.engineVersion}
        </p>
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  strong,
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('mt-1', strong ? 'text-xl font-semibold' : 'font-medium')}>{value}</p>
    </div>
  );
}
