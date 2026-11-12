import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CalendarClock, ClipboardList, Clock, Plus, Search, Target, Users } from 'lucide-react';
import { EXAM_STATUSES, type ExamStatus } from '@solar/shared';
import { useT } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { useGet } from '@/hooks/useApi';
import { Button, Card, Input, Select } from '@/components/ui/primitives';
import { EmptyState, PageHeader, Pagination, ProgressBar, Skeleton } from '@/components/ui/data';
import { ExamStatusBadge } from '@/components/domain';
import { scoreTone } from '@/components/charts';
import { fmtDate, fmtPct } from '@/lib/format';

export interface ExamRow {
  id: string; code: string; name: string; description: string | null; status: ExamStatus; durationMinutes: number; passingScore: number; maxAttempts: number;
  startAt: string | null; endAt: string | null; createdAt: string; targetAudience: string | null;
  createdBy: { fullName: string }; _count: { questions: number; assignments: number; attempts: number; results: number };
  avgScore: number | null; passRate: number | null;
}

export default function ExamsPage() {
  const { t } = useT();
  const { can } = useAuth();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [deb, setDeb] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => { const h = setTimeout(() => { setDeb(q); setPage(1); }, 300); return () => clearTimeout(h); }, [q]);
  const qs = new URLSearchParams({ page: String(page), pageSize: '12', ...(deb ? { q: deb } : {}), ...(status ? { status } : {}) });
  const { data, isLoading } = useGet<{ items: ExamRow[]; total: number; page: number; pages: number }>(['exams', qs.toString()], `/exams?${qs}`, { keepPrevious: true });

  return (
    <div>
      <PageHeader title={t('exams.title')} subtitle={t('exams.subtitle')} icon={<ClipboardList className="h-5 w-5" />}
        actions={can('exams.manage') && <Button icon={<Plus className="h-4 w-4" />} onClick={() => nav('/tao-de')}>{t('exams.newExam')}</Button>} />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" /><Input className="pl-9" placeholder={t('common.searchPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select className="sm:w-56" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label={t('common.status')}>
          <option value="">{t('common.status')}</option>
          {EXAM_STATUSES.map((s) => <option key={s} value={s}>{t(`examStatus.${s}`)}</option>)}
        </Select>
      </div>
      {isLoading ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-56 rounded-xl" />)}</div> : !data?.items.length ? <Card><EmptyState title={t('exams.noExams')} /></Card> : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.items.map((e, i) => (
              <motion.button key={e.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} onClick={() => nav(`/de-thi/${e.id}`)} className="card card-hover flex flex-col p-5 text-left">
                <div className="flex items-start justify-between gap-2"><span className="font-mono text-xs text-muted">{e.code}</span><ExamStatusBadge status={e.status} /></div>
                <p className="mt-2 line-clamp-2 font-semibold">{e.name}</p>
                {e.targetAudience && <p className="mt-1 text-xs text-muted">{e.targetAudience}</p>}
                <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-muted">
                  <span className="flex items-center gap-1"><ClipboardList className="h-3.5 w-3.5" />{t('ui.nQuestions', { count: e._count.questions })}</span>
                  <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{t('ui.nMinutes', { count: e.durationMinutes })}</span>
                  <span className="flex items-center gap-1"><Target className="h-3.5 w-3.5" />{t('ui.passAt', { value: e.passingScore })}</span>
                  <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{e._count.assignments} {t('exams.assignments').toLowerCase()}</span>
                  <span className="col-span-2 flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />{e.endAt ? t('ui.deadline', { date: fmtDate(e.endAt) }) : t('ui.noDeadline')}</span>
                </div>
                <div className="mt-auto pt-4">
                  <div className="mb-1 flex justify-between text-xs"><span className="text-muted">{e._count.results} {t('exams.attemptsCount')} · {t('dashboard.passRate')}</span><span className="num font-semibold">{fmtPct(e.passRate)}</span></div>
                  <ProgressBar value={e.passRate ?? 0} tone={e.passRate == null ? 'primary' : scoreTone(e.passRate)} height="h-1.5" />
                </div>
              </motion.button>
            ))}
          </div>
          <Card className="mt-4"><Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} /></Card>
        </>
      )}
    </div>
  );
}
