import { useSearchParams } from 'react-router';
import { PageHeader } from '@/components/common/page-header';
import { useCan } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { JobPositionsTab, PositionsTab } from './CatalogTabs';
import { UnitsTab } from './UnitsTab';

const TABS = [
  { key: 'don-vi', label: 'Đơn vị' },
  { key: 'chuc-vu', label: 'Chức vụ' },
  { key: 'vi-tri-viec-lam', label: 'Vị trí việc làm' },
] as const;

export function OrgPage() {
  const can = useCan();
  const canManage = can('org.manage');
  const [params, setParams] = useSearchParams();
  const active = TABS.find((t) => t.key === params.get('tab'))?.key ?? 'don-vi';

  return (
    <div className="space-y-4">
      <PageHeader
        title="Cơ cấu tổ chức"
        description={
          canManage
            ? 'Quản lý đơn vị, chức vụ và vị trí việc làm.'
            : 'Tra cứu đơn vị, chức vụ và vị trí việc làm.'
        }
      />
      <div
        role="tablist"
        aria-label="Danh mục tổ chức"
        className="flex gap-1 overflow-x-auto border-b"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={active === t.key}
            className={cn(
              '-mb-px border-b-2 px-4 py-2 text-sm font-medium whitespace-nowrap',
              active === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setParams({ tab: t.key }, { replace: true })}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {active === 'don-vi' && <UnitsTab canManage={canManage} />}
        {active === 'chuc-vu' && <PositionsTab canManage={canManage} />}
        {active === 'vi-tri-viec-lam' && <JobPositionsTab canManage={canManage} />}
      </div>
    </div>
  );
}
