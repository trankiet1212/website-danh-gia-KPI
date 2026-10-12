/** Hiển thị một ReportDocument (cùng nội dung với file Excel/PDF xuất ra) và các nút xuất file. */
import { FileDown, FileSpreadsheet, Printer } from 'lucide-react';
import { useState } from 'react';
import type { ReportCell, ReportDocument, ReportKind, ReportTable } from '@kpi/shared';
import { useToast } from '@/components/common/toast-context';
import { Button } from '@/components/ui/button';
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/table';
import { downloadFile, errorMessage, qs } from '@/lib/api-client';
import { useCan } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import type { ReportParams } from './api';

function show(v: ReportCell, kind?: string): string {
  if (v === null || v === undefined) return '';
  if (typeof v !== 'number') return v;
  if (kind === 'percent')
    return `${(v * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`;
  return v.toLocaleString('vi-VN', { maximumFractionDigits: kind === 'integer' ? 0 : 2 });
}

export function ReportTableView({ table }: { table: ReportTable }) {
  const numeric = (k?: string) => k !== undefined && k !== 'text';
  return (
    <div className="space-y-2">
      {table.title && <h3 className="text-sm font-semibold">{table.title}</h3>}
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <THead>
            <Tr>
              {table.columns.map((c) => (
                <Th key={c.key} className={numeric(c.kind) ? 'text-right' : undefined}>
                  {c.header}
                </Th>
              ))}
            </Tr>
          </THead>
          <TBody>
            {table.rows.length === 0 && (
              <Tr>
                <Td colSpan={table.columns.length} className="text-center text-muted-foreground">
                  Không có dữ liệu trong phạm vi được phép xem.
                </Td>
              </Tr>
            )}
            {table.rows.map((r, i) => (
              <Tr key={i}>
                {table.columns.map((c) => (
                  <Td
                    key={c.key}
                    className={numeric(c.kind) ? 'text-right tabular-nums' : undefined}
                  >
                    {show(r[c.key] ?? null, c.kind)}
                  </Td>
                ))}
              </Tr>
            ))}
            {table.totals && (
              <Tr className="bg-muted/40 font-semibold">
                {table.columns.map((c) => (
                  <Td
                    key={c.key}
                    className={numeric(c.kind) ? 'text-right tabular-nums' : undefined}
                  >
                    {show(table.totals?.[c.key] ?? null, c.kind)}
                  </Td>
                ))}
              </Tr>
            )}
          </TBody>
        </Table>
      </div>
    </div>
  );
}

export function ReportView({ doc }: { doc: ReportDocument }) {
  return (
    <article className="space-y-4" aria-label={doc.title}>
      <header className="space-y-1 text-center">
        <h2 className="text-lg font-semibold uppercase">{doc.title}</h2>
        {doc.filters.map((f) => (
          <p key={f} className="text-sm italic">
            {f}
          </p>
        ))}
        <p className="text-xs text-muted-foreground">
          Lập lúc {formatDateTime(doc.generatedAt)} · Người xem: {doc.generatedBy} · Phạm vi dữ
          liệu: {doc.scopeLabel}
        </p>
      </header>
      <ReportTableView table={doc.main} />
      {doc.summary.length > 0 && (
        <section className="space-y-1">
          <h3 className="text-sm font-semibold">Tổng hợp</h3>
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {doc.summary.map((s) => (
              <div key={s.label} className="flex justify-between gap-3 border-b py-1">
                <dt className="text-muted-foreground">{s.label}</dt>
                <dd className="text-right font-medium tabular-nums">{show(s.value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {doc.summaryTables.map((t, i) => (
        <ReportTableView key={i} table={t} />
      ))}
      {doc.notes.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold">Ghi chú</h3>
          <ul className="list-disc pl-5 text-xs text-muted-foreground">
            {doc.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

/** Nút xuất Excel/PDF — gọi API xuất file thật (quyền report.export, dữ liệu theo phạm vi). */
export function ExportButtons({
  kind,
  params,
  disabled,
}: {
  kind: ReportKind;
  params: ReportParams;
  disabled?: boolean;
}) {
  const can = useCan();
  const toast = useToast();
  const [busy, setBusy] = useState<'xlsx' | 'pdf' | null>(null);
  const run = async (format: 'xlsx' | 'pdf') => {
    setBusy(format);
    try {
      const name = await downloadFile(`/reports/${kind}/export${qs({ ...params, format })}`);
      toast.success(`Đã tải ${name}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <Button variant="outline" onClick={() => window.print()} disabled={disabled}>
        <Printer className="size-4" /> In
      </Button>
      {can('report.export') && (
        <>
          <Button
            variant="outline"
            disabled={disabled || busy !== null}
            onClick={() => void run('xlsx')}
          >
            <FileSpreadsheet className="size-4" /> {busy === 'xlsx' ? 'Đang xuất...' : 'Xuất Excel'}
          </Button>
          <Button
            variant="outline"
            disabled={disabled || busy !== null}
            onClick={() => void run('pdf')}
          >
            <FileDown className="size-4" /> {busy === 'pdf' ? 'Đang xuất...' : 'Xuất PDF'}
          </Button>
        </>
      )}
    </div>
  );
}
