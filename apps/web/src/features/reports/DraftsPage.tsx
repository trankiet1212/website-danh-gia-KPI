/**
 * Dự thảo văn bản theo mẫu: chọn mẫu và dữ liệu → xem trước → tải PDF.
 * Văn bản luôn ở trạng thái "DỰ THẢO"; mẫu là mẫu tạm cho tới khi có mẫu chính thức.
 */
import { FileDown } from 'lucide-react';
import { useState } from 'react';
import type { DraftDocument } from '@kpi/shared';
import { PageHeader } from '@/components/common/page-header';
import { ErrorState, FormError, LoadingState } from '@/components/common/states';
import { useToast } from '@/components/common/toast-context';
import { Button } from '@/components/ui/button';
import { Label, Select } from '@/components/ui/form-controls';
import { useEvaluations, usePeriods } from '@/features/kpi/api';
import { ProvisionalNotice } from '@/features/kpi/components';
import { flattenUnitTree, useUnits } from '@/features/org/api';
import { downloadFile, errorMessage } from '@/lib/api-client';
import { useDraftPreview, useDraftTemplates } from './api';
import { ReportTableView } from './components';

function Paper({ draft }: { draft: DraftDocument }) {
  return (
    <div className="relative mx-auto max-w-3xl overflow-hidden rounded-md border bg-white p-8 text-sm text-black shadow-sm">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center text-8xl font-bold text-black/10 select-none"
        style={{ transform: 'rotate(-35deg)' }}
      >
        DỰ THẢO
      </div>
      <div className="relative space-y-4">
        <div className="grid grid-cols-2 gap-4 text-center">
          <div>
            <p className="uppercase">{draft.agencyParent}</p>
            <p className="font-semibold uppercase">{draft.agencyName}</p>
            <p className="mt-1 text-amber-700">{draft.docNumber ?? '[Số văn bản]'}</p>
          </div>
          <div>
            <p className="font-semibold">ĐẢNG CỘNG SẢN VIỆT NAM</p>
            <p className="mt-3 text-amber-700 italic">
              {draft.placeDate ?? '[Địa danh, ngày ... tháng ... năm ...]'}
            </p>
          </div>
        </div>
        <h2 className="text-center text-base font-bold uppercase">{draft.title}</h2>
        {draft.subtitle && <p className="text-center italic">{draft.subtitle}</p>}
        {draft.blocks.map((b, i) => {
          if (b.type === 'heading')
            return (
              <h3 key={i} className="font-semibold">
                {b.text}
              </h3>
            );
          if (b.type === 'paragraph')
            return (
              <p key={i} className={b.text.startsWith('[') ? 'text-amber-700' : 'text-justify'}>
                {b.text}
              </p>
            );
          if (b.type === 'table') return <ReportTableView key={i} table={b.table} />;
          return (
            <div key={i} className="ml-auto w-64 pt-4 text-center">
              <p className="font-semibold">{b.title}</p>
              <p className="text-xs italic">(Ký, ghi rõ họ tên)</p>
              <p className={`mt-12 font-semibold ${b.name ? '' : 'text-amber-700'}`}>
                {b.name ?? '[Người ký]'}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DraftsPage() {
  const toast = useToast();
  const templates = useDraftTemplates();
  const periods = usePeriods(new Date().getFullYear());
  const units = useUnits();
  const [code, setCode] = useState<'BC-KQDG' | 'PHIEU-KQDG'>('BC-KQDG');
  const [periodId, setPeriodId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [evaluationId, setEvaluationId] = useState('');
  const evaluations = useEvaluations({ periodId: periodId || undefined, page: 1, pageSize: 100 });
  const preview = useDraftPreview();
  const [downloading, setDownloading] = useState(false);

  const body =
    code === 'BC-KQDG'
      ? { templateCode: code, periodId, unitId: unitId || undefined }
      : { templateCode: code, evaluationId };
  const ready = code === 'BC-KQDG' ? !!periodId : !!evaluationId;
  const tpl = templates.data?.find((t) => t.code === code);

  const download = async () => {
    setDownloading(true);
    try {
      toast.success(`Đã tải ${await downloadFile('/drafts/pdf', body)}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setDownloading(false);
    }
  };

  if (templates.isPending) return <LoadingState />;
  if (templates.isError) return <ErrorState error={templates.error} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Dự thảo văn bản"
        description="Sinh dự thảo báo cáo, phiếu kết quả từ dữ liệu đánh giá. Văn bản luôn ở trạng thái DỰ THẢO; người soạn bổ sung các trường còn thiếu trước khi trình ký."
      />
      <ProvisionalNotice>
        Mẫu văn bản đang dùng là <strong>mẫu tạm ({tpl?.version})</strong> — chưa có mẫu chính thức
        của cơ quan (docs/09 #16). Kết quả xếp loại chỉ lấy từ hồ sơ đã phê duyệt.
      </ProvisionalNotice>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="dr-tpl">Mẫu</Label>
          <Select
            id="dr-tpl"
            className="w-80"
            value={code}
            onChange={(e) => setCode(e.target.value as typeof code)}
          >
            {templates.data.map((t) => (
              <option key={t.code} value={t.code}>
                {t.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dr-period">Kỳ</Label>
          <Select
            id="dr-period"
            className="w-56"
            value={periodId}
            onChange={(e) => setPeriodId(e.target.value)}
          >
            <option value="">— Chọn kỳ —</option>
            {periods.data
              ?.filter((p) => p.isRated)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </Select>
        </div>
        {code === 'BC-KQDG' ? (
          <div className="space-y-1.5">
            <Label htmlFor="dr-unit">Đơn vị</Label>
            <Select
              id="dr-unit"
              className="w-64"
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
            >
              <option value="">Toàn cơ quan (trong phạm vi)</option>
              {flattenUnitTree(units.data ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {'— '.repeat(u.depth)}
                  {u.name}
                </option>
              ))}
            </Select>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="dr-eval">Hồ sơ</Label>
            <Select
              id="dr-eval"
              className="w-80"
              value={evaluationId}
              onChange={(e) => setEvaluationId(e.target.value)}
            >
              <option value="">— Chọn hồ sơ —</option>
              {evaluations.data?.data.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.employee?.fullName} — {e.period.name}
                </option>
              ))}
            </Select>
          </div>
        )}
        <Button disabled={!ready || preview.isPending} onClick={() => preview.mutate(body)}>
          {preview.isPending ? 'Đang dựng...' : 'Xem trước'}
        </Button>
        <Button variant="outline" disabled={!ready || downloading} onClick={() => void download()}>
          <FileDown className="size-4" /> {downloading ? 'Đang tạo PDF...' : 'Tải PDF dự thảo'}
        </Button>
      </div>
      <FormError error={preview.error} />
      {preview.data && (
        <div className="space-y-3">
          {(preview.data.missingFields.length > 0 || preview.data.warnings.length > 0) && (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-md border border-warning/50 bg-warning/10 p-3 text-sm">
                <p className="font-medium">Trường còn thiếu (người soạn bổ sung)</p>
                <ul className="list-disc pl-5">
                  {preview.data.missingFields.map((m) => (
                    <li key={m.key}>{m.label}</li>
                  ))}
                </ul>
              </div>
              {preview.data.warnings.length > 0 && (
                <div className="rounded-md border p-3 text-sm">
                  <p className="font-medium">Lưu ý về số liệu</p>
                  <ul className="list-disc pl-5">
                    {preview.data.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <Paper draft={preview.data} />
        </div>
      )}
    </div>
  );
}
