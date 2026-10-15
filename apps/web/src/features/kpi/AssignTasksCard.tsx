/**
 * Cấp trên giao danh sách nhiệm vụ cho cán bộ ngay trên hồ sơ đánh giá (docs/06 §5.6).
 * Chỉ phần kế hoạch (tên, danh mục, hệ số, số lượng kế hoạch); cán bộ tự nhập kết quả thực hiện.
 */
import { useState } from 'react';
import type { CompositeRow, EvaluationDetail, ItemInput } from '@kpi/shared';
import { FormError } from '@/components/common/states';
import { useToast } from '@/components/common/toast-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api-client';
import { kpiKeys, useAction } from './api';
import { RowsEditor } from './ScoreSheet';

export function AssignTasksCard({ ev }: { ev: EvaluationDetail }) {
  const toast = useToast();
  const axes = ev.criteriaVersion.items
    .filter((i) => i.scoringMethod === 'KPI_COMPOSITE')
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const saved = new Map(ev.items.map((i) => [i.criteriaItemId, i]));
  const [rows, setRows] = useState<Record<string, CompositeRow[]>>(() =>
    Object.fromEntries(
      axes.map((a) => [
        a.id,
        ((saved.get(a.id)?.selfInput as ItemInput | null)?.rows ?? [])
          .filter((r) => r.assigned)
          .map((r) => structuredClone(r)),
      ]),
    ),
  );
  const save = useAction(
    () =>
      api.put<EvaluationDetail>(`/evaluations/${ev.id}/tasks`, {
        items: axes.map((a) => ({
          criteriaItemId: a.id,
          rows: (rows[a.id] ?? []).map((r) => ({
            label: r.label,
            catalogItemCode: r.catalogItemCode ?? null,
            coefficient: r.coefficient,
            plannedQty: r.plannedQty,
          })),
        })),
        version: ev.version,
      }),
    [kpiKeys.evaluation(ev.id), ['evaluations']],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Giao nhiệm vụ cho cán bộ</CardTitle>
        <p className="text-sm text-muted-foreground">
          Lập danh sách nhiệm vụ, sản phẩm và số lượng kế hoạch trong kỳ. Khi tự đánh giá, cán bộ
          nhập kết quả thực hiện nhưng không sửa được tên, hệ số, số lượng kế hoạch của nhiệm vụ
          được giao. Chỉ giao được khi hồ sơ chưa nộp.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {axes.map((a) => (
          <div key={a.id} className="space-y-2">
            <p className="text-sm">
              <strong>{a.code}</strong> {a.name}
            </p>
            <RowsEditor
              mode="plan"
              rows={rows[a.id] ?? []}
              onChange={(next) => setRows((all) => ({ ...all, [a.id]: next }))}
              disabled={false}
              catalogVersionId={ev.criteriaVersion.workCatalogVersionId}
              employeeId={ev.employee?.id}
            />
          </div>
        ))}
        <FormError error={save.error} />
        <div className="flex justify-end">
          <Button
            disabled={save.isPending}
            onClick={() =>
              save.mutate(undefined, { onSuccess: () => toast.success('Đã lưu danh sách giao') })
            }
          >
            Lưu danh sách giao
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
