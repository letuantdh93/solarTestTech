import { useState } from 'react';
import { ScrollText } from 'lucide-react';
import { useT, vi } from '@/i18n';
import { useGet } from '@/hooks/useApi';
import { Card, Select } from '@/components/ui/primitives';
import { EmptyState, PageHeader, Pagination, SkeletonRows, Table, Td, Th } from '@/components/ui/data';
import { fmtDateTime } from '@/lib/format';

interface Log { id: string; action: string; entityType: string; entityId: string | null; details: unknown; ip: string | null; createdAt: string; actor: { fullName: string; username: string } | null }


export default function AuditPage() {
  const { t } = useT();
  const [page, setPage] = useState(1);
  const [entity, setEntity] = useState('');
  const qs = new URLSearchParams({ page: String(page), ...(entity ? { entityType: entity } : {}) });
  const { data, isLoading } = useGet<{ items: Log[]; total: number; page: number; pages: number }>(['audit', qs.toString()], `/audit-logs?${qs}`, { keepPrevious: true });
  return (
    <div>
      <PageHeader title={t('settings.auditTitle')} subtitle={t('settings.auditSubtitle')} icon={<ScrollText className="h-5 w-5" />} />
      <Card>
        <div className="border-b border-border p-4">
          <Select className="sm:w-64" value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1); }} aria-label={t('settings.entity')}>
            <option value="">{t('common.all')}</option>
            {Object.entries(vi.audit.entity).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </div>
        {isLoading ? <SkeletonRows /> : !data?.items.length ? <EmptyState title={t('common.noData')} /> : (
          <>
            <Table>
              <thead><tr><Th>{t('settings.time')}</Th><Th>{t('settings.actor')}</Th><Th>{t('settings.action')}</Th><Th>{t('settings.entity')}</Th><Th className="hidden md:table-cell">{t('settings.ip')}</Th></tr></thead>
              <tbody>
                {data.items.map((l) => (
                  <tr key={l.id} className="hover:bg-surface-2/60">
                    <Td className="num whitespace-nowrap text-xs text-muted">{fmtDateTime(l.createdAt)}</Td>
                    <Td>{l.actor?.fullName ?? '—'}</Td>
                    <Td className="font-medium">{t(`audit.action.${l.action.replace(/\./g, '_')}`, { defaultValue: l.action })}</Td>
                    <Td className="text-muted">{t(`audit.entity.${l.entityType}`, { defaultValue: l.entityType })}{l.entityId && <span className="ml-1 font-mono text-[11px] text-subtle">#{l.entityId.slice(-6)}</span>}</Td>
                    <Td className="hidden font-mono text-xs text-subtle md:table-cell">{l.ip}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
