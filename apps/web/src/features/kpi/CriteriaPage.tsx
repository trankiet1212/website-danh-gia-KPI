/** Danh sách bộ tiêu chí đánh giá theo nhóm đối tượng/VTVL và các phiên bản. */
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  KPI_PROFILE_LABELS,
  KPI_PROFILES,
  PERIOD_TYPE_LABELS,
  type CriteriaSetDto,
  type CriteriaVersionDto,
  type KpiProfile,
} from '@kpi/shared';
import { PageHeader } from '@/components/common/page-header';
import { EmptyState, ErrorState, FormError, LoadingState } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { FormField, Input, Select, Textarea } from '@/components/ui/form-controls';
import { Table, TBody, THead, Td, Th, Tr } from '@/components/ui/table';
import { api } from '@/lib/api-client';
import { useCan } from '@/lib/auth';
import { kpiKeys, useAction, useCriteriaSets } from './api';
import { StatusBadge } from './components';

function CreateSetDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [kpiProfile, setProfile] = useState<KpiProfile>('STAFF');
  const [description, setDescription] = useState('');
  const create = useAction(
    (body: object) => api.post<CriteriaSetDto>('/criteria-sets', body),
    [kpiKeys.criteriaSets],
  );
  return (
    <Dialog open={open} onClose={onClose} title="Thêm bộ tiêu chí">
      <div className="space-y-3">
        <FormError error={create.error} />
        <FormField id="cs-code" label="Mã" required>
          <Input id="cs-code" value={code} onChange={(e) => setCode(e.target.value)} />
        </FormField>
        <FormField id="cs-name" label="Tên bộ tiêu chí" required>
          <Input id="cs-name" value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
        <FormField id="cs-profile" label="Nhóm đối tượng" required>
          <Select
            id="cs-profile"
            value={kpiProfile}
            onChange={(e) => setProfile(e.target.value as KpiProfile)}
          >
            {KPI_PROFILES.map((p) => (
              <option key={p} value={p}>
                {KPI_PROFILE_LABELS[p]}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField id="cs-desc" label="Mô tả">
          <Textarea
            id="cs-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button
            disabled={create.isPending}
            onClick={() =>
              create.mutate({ code, name, kpiProfile, description }, { onSuccess: onClose })
            }
          >
            Lưu
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

export function CriteriaPage() {
  const sets = useCriteriaSets();
  const can = useCan();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const newVersion = useAction(
    (a: { setId: string; fromId: string | null }) =>
      api.post<CriteriaVersionDto>(`/criteria-sets/${a.setId}/versions`, {
        cloneFromVersionId: a.fromId,
      }),
    [kpiKeys.criteriaSets],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Bộ tiêu chí đánh giá"
        description="Tiêu chí chung (30 điểm) và các trục kết quả nhiệm vụ (70 điểm) theo nhóm đối tượng. Bản đã phê duyệt không sửa được — tạo phiên bản mới để điều chỉnh."
        actions={
          can('criteria.write') && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" /> Thêm bộ tiêu chí
            </Button>
          )
        }
      />
      <FormError error={newVersion.error} />
      {sets.isPending ? (
        <LoadingState />
      ) : sets.isError ? (
        <ErrorState error={sets.error} onRetry={() => void sets.refetch()} />
      ) : sets.data.length === 0 ? (
        <EmptyState title="Chưa có bộ tiêu chí" />
      ) : (
        sets.data.map((s) => (
          <Card key={s.id}>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle>
                  {s.code} — {s.name}
                </CardTitle>
                <CardDescription>
                  {KPI_PROFILE_LABELS[s.kpiProfile]}
                  {s.jobPosition && ` · VTVL: ${s.jobPosition.name}`}
                  {s.description && ` · ${s.description}`}
                </CardDescription>
              </div>
              {can('criteria.write') && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={newVersion.isPending}
                  onClick={() =>
                    newVersion.mutate(
                      { setId: s.id, fromId: s.versions[0]?.id ?? null },
                      { onSuccess: (v) => void navigate(`/bo-tieu-chi/${v.id}`) },
                    )
                  }
                >
                  <Plus className="size-4" /> Phiên bản mới
                </Button>
              )}
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {s.versions.length === 0 ? (
                <p className="text-sm text-muted-foreground">Chưa có phiên bản.</p>
              ) : (
                <Table>
                  <THead>
                    <Tr>
                      <Th>Phiên bản</Th>
                      <Th>Trạng thái</Th>
                      <Th>Loại kỳ</Th>
                      <Th>Điểm chung / kết quả</Th>
                      <Th>Bộ quy tắc</Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {s.versions.map((v) => (
                      <Tr key={v.id}>
                        <Td>
                          <Link
                            className="font-medium text-primary hover:underline"
                            to={`/bo-tieu-chi/${v.id}`}
                          >
                            v{v.versionNo}
                          </Link>
                        </Td>
                        <Td>
                          <StatusBadge kind="approval" status={v.status} />
                        </Td>
                        <Td>{v.periodTypes.map((t) => PERIOD_TYPE_LABELS[t]).join(', ')}</Td>
                        <Td>
                          {v.generalMax} / {v.resultMax}
                        </Td>
                        <Td>{v.ruleSetVersionLabel ?? '—'}</Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>
        ))
      )}
      {creating && <CreateSetDialog open={creating} onClose={() => setCreating(false)} />}
    </div>
  );
}
