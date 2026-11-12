import { Download } from 'lucide-react';
import { useT } from '@/i18n';
import { download } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useGet } from '@/hooks/useApi';
import { Button } from '@/components/ui/primitives';
import { Skeleton } from '@/components/ui/data';
import { AnalyticsView, type AnalyticsData } from '../analytics/AnalyticsView';

export function ExamStats({ examId, passingScore }: { examId: string; passingScore: number }) {
  const { t } = useT();
  const { can } = useAuth();
  const { data, isLoading } = useGet<AnalyticsData>(['analytics', `examId=${examId}`], `/analytics?examId=${examId}`);
  if (isLoading || !data) return <Skeleton className="h-96 rounded-xl" />;
  return (
    <div className="space-y-4">
      {can('results.export') && data.count > 0 && (
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" icon={<Download className="h-4 w-4" />} onClick={() => void download(`/results/export.xlsx?examId=${examId}`, 'ket-qua.xlsx')}>{t('common.exportExcel')}</Button>
          <Button variant="outline" size="sm" icon={<Download className="h-4 w-4" />} onClick={() => void download(`/analytics/report.pdf?examId=${examId}`, 'bao-cao.pdf')}>{t('common.exportPdf')}</Button>
        </div>
      )}
      <AnalyticsView a={data} passingScore={passingScore} showExams={false} />
    </div>
  );
}
