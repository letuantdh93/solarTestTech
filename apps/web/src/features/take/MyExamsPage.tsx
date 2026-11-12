import { ClipboardCheck } from 'lucide-react';
import { useT } from '@/i18n';
import { PageHeader } from '@/components/ui/data';
import { AssignedExamsList } from './AssignedExamsList';

export default function MyExamsPage() {
  const { t } = useT();
  return (
    <div>
      <PageHeader title={t('take.myExamsTitle')} subtitle={t('take.myExamsSubtitle')} icon={<ClipboardCheck className="h-5 w-5" />} />
      <AssignedExamsList />
    </div>
  );
}
