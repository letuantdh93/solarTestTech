import { useState } from 'react';
import { BarChart3, Download, FileSpreadsheet } from 'lucide-react';
import { useT } from '@/i18n';
import { download } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useGet } from '@/hooks/useApi';
import { Button, Select } from '@/components/ui/primitives';
import { PageHeader, Skeleton } from '@/components/ui/data';
import { AnalyticsView, type AnalyticsData } from './AnalyticsView';

export default function AnalyticsPage() {
  const { t } = useT();
  const { can } = useAuth();
  const [examId, setExamId] = useState('');
  const [groupId, setGroupId] = useState('');
  const exams = useGet<{ items: Array<{ id: string; code: string; name: string }> }>(['exams', 'all-for-filter'], '/exams?pageSize=200');
  const groups = useGet<Array<{ id: string; name: string }>>(['groups'], '/groups');
  const qs = new URLSearchParams({ ...(examId ? { examId } : {}), ...(groupId ? { groupId } : {}) }).toString();
  const { data, isLoading } = useGet<AnalyticsData>(['analytics', qs], `/analytics?${qs}`, { keepPrevious: true });
  return (
    <div>
      <PageHeader title={t('analytics.title')} subtitle={t('analytics.subtitle')} icon={<BarChart3 className="h-5 w-5" />}
        actions={can('results.export') && (
          <>
            <Button variant="outline" icon={<FileSpreadsheet className="h-4 w-4" />} onClick={() => void download(`/results/export.xlsx?${qs}`, 'ket-qua-thi.xlsx')}>{t('common.exportExcel')}</Button>
            <Button variant="outline" icon={<Download className="h-4 w-4" />} onClick={() => void download(`/analytics/report.pdf?${qs}`, 'bao-cao-nang-luc.pdf')}>{t('common.exportPdf')}</Button>
          </>
        )} />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:w-2/3">
        <Select value={examId} onChange={(e) => setExamId(e.target.value)} aria-label={t('results.filterExam')}>
          <option value="">{t('results.filterExam')}: {t('common.all').toLowerCase()}</option>
          {exams.data?.items.map((e) => <option key={e.id} value={e.id}>{e.code} – {e.name}</option>)}
        </Select>
        <Select value={groupId} onChange={(e) => setGroupId(e.target.value)} aria-label={t('results.filterGroup')}>
          <option value="">{t('results.filterGroup')}: {t('common.all').toLowerCase()}</option>
          {groups.data?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </Select>
      </div>
      {isLoading || !data ? <div className="space-y-4"><div className="grid grid-cols-2 gap-4 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)}</div><Skeleton className="h-80 rounded-xl" /></div> : <AnalyticsView a={data} showExams={!examId} />}
    </div>
  );
}
