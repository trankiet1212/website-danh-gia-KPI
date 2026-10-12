import { ArrowLeftRight, Pencil, UserX } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router';
import { EMPLOYEE_STATUS_LABELS, GENDER_LABELS, type AssignmentDto } from '@kpi/shared';
import { PageHeader } from '@/components/common/page-header';
import { ErrorState, LoadingState } from '@/components/common/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TBody, THead, Table, Td, Th, Tr } from '@/components/ui/table';
import { ApiClientError } from '@/lib/api-client';
import { formatDate, formatDateTime } from '@/lib/format';
import { useEmployee } from './api';
import { EmployeeDialogs, type EmployeeDialogKind } from './EmployeeDialogs';

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words">{value || '—'}</dd>
    </>
  );
}

function AssignmentSummary({ a }: { a: AssignmentDto }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
      <Info label="Đơn vị" value={a.unit.name} />
      <Info label="Chức vụ" value={a.position.name} />
      <Info label="Vị trí việc làm" value={a.jobPosition?.name} />
      <Info
        label="Quản lý trực tiếp"
        value={a.manager ? `${a.manager.fullName} (${a.manager.employeeCode})` : null}
      />
      <Info label="Từ ngày" value={formatDate(a.startDate)} />
      <Info label="Số quyết định" value={a.decisionRef} />
      <Info label="Nhiệm vụ phụ trách" value={a.duties} />
    </dl>
  );
}

export function EmployeeDetailPage() {
  const { id = '' } = useParams();
  const { data: e, isPending, error, refetch } = useEmployee(id);
  const [dialog, setDialog] = useState<EmployeeDialogKind>(null);

  if (isPending) return <LoadingState label="Đang tải hồ sơ..." />;
  if (error) {
    if (error instanceof ApiClientError && error.status === 404) {
      return (
        <ErrorState
          error={new Error('Không tìm thấy hồ sơ hoặc hồ sơ nằm ngoài phạm vi bạn được xem.')}
        />
      );
    }
    return <ErrorState error={error} onRetry={() => void refetch()} />;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={e.fullName}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{e.employeeCode}</span>
            <Badge variant={e.status === 'WORKING' ? 'success' : 'secondary'}>
              {EMPLOYEE_STATUS_LABELS[e.status]}
            </Badge>
            {e.isDemo && <Badge variant="outline">DỮ LIỆU DEMO</Badge>}
            {e.hasAccount && <Badge variant="secondary">Có tài khoản</Badge>}
          </span>
        }
        actions={
          <>
            {e.can.edit && (
              <Button variant="outline" onClick={() => setDialog('edit')}>
                <Pencil aria-hidden /> Sửa thông tin
              </Button>
            )}
            {e.can.transfer && (
              <Button variant="outline" onClick={() => setDialog('transfer')}>
                <ArrowLeftRight aria-hidden /> Điều chuyển
              </Button>
            )}
            {e.can.archive && (
              <Button variant="destructive" onClick={() => setDialog('end')}>
                <UserX aria-hidden /> Kết thúc công tác
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Thông tin cá nhân</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <Info label="Giới tính" value={e.gender ? GENDER_LABELS[e.gender] : null} />
              <Info label="Ngày sinh" value={formatDate(e.dateOfBirth)} />
              <Info label="Email" value={e.email} />
              <Info label="Điện thoại" value={e.phone} />
              <Info label="Chức vụ Đảng" value={e.partyPosition} />
              <Info label="Chức vụ chính quyền" value={e.govPosition} />
              <Info label="Chức vụ đoàn thể" value={e.unionPosition} />
              <Info label="Cập nhật lúc" value={formatDateTime(e.updatedAt)} />
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Phân công hiện tại</CardTitle>
          </CardHeader>
          <CardContent>
            {e.current ? (
              <AssignmentSummary a={e.current} />
            ) : (
              <p className="text-sm text-muted-foreground">Không có phân công đang hiệu lực.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lịch sử phân công, điều chuyển</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <Tr>
                <Th>Thời gian</Th>
                <Th>Đơn vị</Th>
                <Th>Chức vụ</Th>
                <Th className="hidden md:table-cell">Vị trí việc làm</Th>
                <Th className="hidden md:table-cell">Quyết định</Th>
              </Tr>
            </THead>
            <TBody>
              {e.assignments.map((a) => (
                <Tr key={a.id}>
                  <Td className="whitespace-nowrap">
                    {formatDate(a.startDate)} –{' '}
                    {a.endDate ? formatDate(a.endDate) : <Badge variant="success">Hiện tại</Badge>}
                  </Td>
                  <Td>{a.unit.name}</Td>
                  <Td>{a.position.name}</Td>
                  <Td className="hidden md:table-cell">{a.jobPosition?.name ?? '—'}</Td>
                  <Td className="hidden md:table-cell">{a.decisionRef ?? '—'}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <EmployeeDialogs employee={e} kind={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}
