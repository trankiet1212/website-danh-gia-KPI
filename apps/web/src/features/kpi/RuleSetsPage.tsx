/** Danh sách bộ quy tắc tính điểm, xếp loại và các phiên bản. */
import { Copy } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import type { RuleSetVersionDto } from '@kpi/shared';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState, ErrorState, FormError, LoadingState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/table';
import { api } from '@/lib/api-client';
import { useCan } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { kpiKeys, useAction, useRuleSets } from './api';
import { ProvisionalNotice, StatusBadge } from './components';

export function RuleSetsPage() {
  const sets = useRuleSets();
  const can = useCan();
  const navigate = useNavigate();
  const clone = useAction(
    (a: { setId: string; fromId: string }) =>
      api.post<RuleSetVersionDto>(`/rule-sets/${a.setId}/versions`, {
        cloneFromVersionId: a.fromId,
      }),
    [kpiKeys.ruleSets],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Quy tắc tính điểm, xếp loại"
        description="Công thức, mức trừ, ngưỡng và điều kiện xếp loại là cấu hình có phiên bản. Chỉ phiên bản ĐÃ XÁC NHẬN mới được dùng để chốt kết quả."
      />
      <ProvisionalNotice>
        Phiên bản DEMO trích từ 39-QĐ/TU và 05-HD/TU đang ở trạng thái <strong>chờ xác nhận</strong>
        . Các giá trị chưa có căn cứ được đánh dấu “tạm” và liệt kê trong docs/09-cau-hoi-mo.md.
      </ProvisionalNotice>
      <FormError error={clone.error} />
      {sets.isPending ? (
        <LoadingState />
      ) : sets.isError ? (
        <ErrorState error={sets.error} onRetry={() => void sets.refetch()} />
      ) : sets.data.length === 0 ? (
        <EmptyState title="Chưa có bộ quy tắc" />
      ) : (
        sets.data.map((s) => (
          <Card key={s.id}>
            <CardHeader>
              <CardTitle>
                {s.code} — {s.name}
              </CardTitle>
              {s.description && <CardDescription>{s.description}</CardDescription>}
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <THead>
                  <Tr>
                    <Th>Phiên bản</Th>
                    <Th>Trạng thái</Th>
                    <Th>Căn cứ</Th>
                    <Th>Xác nhận</Th>
                    <Th className="text-right">Thao tác</Th>
                  </Tr>
                </THead>
                <TBody>
                  {s.versions.map((v) => (
                    <Tr key={v.id}>
                      <Td>
                        <Link
                          className="font-medium text-primary underline-offset-2 hover:underline"
                          to={`/quy-tac/${v.id}`}
                        >
                          v{v.versionNo}
                        </Link>
                      </Td>
                      <Td>
                        <StatusBadge kind="config" status={v.status} />
                      </Td>
                      <Td className="max-w-md">
                        <p className="line-clamp-2 text-sm">{v.legalBasis}</p>
                      </Td>
                      <Td className="text-sm whitespace-nowrap">
                        {v.confirmedAt ? formatDateTime(v.confirmedAt) : '—'}
                      </Td>
                      <Td className="text-right">
                        {can('ruleset.write') && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={clone.isPending}
                            onClick={() =>
                              clone.mutate(
                                { setId: s.id, fromId: v.id },
                                { onSuccess: (nv) => void navigate(`/quy-tac/${nv.id}`) },
                              )
                            }
                          >
                            <Copy className="size-4" /> Tạo phiên bản mới từ v{v.versionNo}
                          </Button>
                        )}
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
