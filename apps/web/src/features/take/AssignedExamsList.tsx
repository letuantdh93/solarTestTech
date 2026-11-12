import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CalendarClock, CheckCircle2, ClipboardCheck, Clock, Lock, Play, RotateCw, Target, Trophy } from 'lucide-react';
import { useT } from '@/i18n';
import { api, ApiError } from '@/lib/api';
import { useGet } from '@/hooks/useApi';
import { Badge, Button } from '@/components/ui/primitives';
import { Dialog, useToast } from '@/components/ui/feedback';
import { EmptyState, Skeleton } from '@/components/ui/data';
import { PassBadge } from '@/components/domain';
import { cn, fmtDateTime, fmtPct } from '@/lib/format';

export interface MyExam {
  id: string; code: string; name: string; description: string | null; durationMinutes: number; passingScore: number; questionCount: number;
  maxAttempts: number; attemptsUsed: number; startAt: string | null; endAt: string | null; dueAt: string | null;
  availability: 'AVAILABLE' | 'IN_PROGRESS' | 'NOT_OPEN' | 'EXPIRED' | 'NO_ATTEMPTS' | 'CLOSED';
  inProgressAttemptId: string | null; bestScore: number | null;
  attempts: Array<{ id: string; attemptNo: number; submittedAt: string; score?: number; passed?: boolean }>;
}

export function AssignedExamsList({ compact }: { compact?: boolean }) {
  const { t } = useT();
  const nav = useNavigate();
  const toast = useToast();
  const { data, isLoading } = useGet<MyExam[]>(['my-exams'], '/my/exams');
  const [starting, setStarting] = useState<MyExam | null>(null);
  const [busy, setBusy] = useState(false);

  async function start(e: MyExam) {
    setBusy(true);
    try {
      const r = await api<{ attemptId: string }>(`/my/exams/${e.id}/start`, { method: 'POST' });
      nav(`/thi/lam-bai/${r.attemptId}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.unknownError'));
      setBusy(false);
    }
  }

  if (isLoading) return <div className="grid gap-4 p-4 md:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-40 rounded-xl" />)}</div>;
  const list = (data ?? []).filter((e) => !compact || ['AVAILABLE', 'IN_PROGRESS', 'NOT_OPEN'].includes(e.availability));
  if (!list.length) return <EmptyState icon={<ClipboardCheck className="h-7 w-7" />} title={t('dashboard.noAssigned')} />;

  const statusBadge = (e: MyExam) => {
    switch (e.availability) {
      case 'IN_PROGRESS': return <Badge tone="warning" icon={<Clock className="h-3 w-3" />}>{t('attemptStatus.IN_PROGRESS')}</Badge>;
      case 'NOT_OPEN': return <Badge tone="info" icon={<Lock className="h-3 w-3" />}>{t('take.notOpen')}</Badge>;
      case 'EXPIRED': return <Badge>{t('take.expired')}</Badge>;
      case 'CLOSED': return <Badge>{t('examStatus.CLOSED')}</Badge>;
      case 'NO_ATTEMPTS': return <Badge tone="success" icon={<CheckCircle2 className="h-3 w-3" />}>{t('take.noAttemptsLeft')}</Badge>;
      default: return <Badge tone="primary" icon={<Play className="h-3 w-3" />}>{t('ui.ready')}</Badge>;
    }
  };

  return (
    <>
      <div className={cn('grid gap-4', compact ? 'p-4 md:grid-cols-2' : 'md:grid-cols-2 xl:grid-cols-3')}>
        {list.map((e, i) => {
          const last = e.attempts[0];
          return (
            <motion.div key={e.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className={cn('card card-hover flex flex-col p-5', e.availability === 'IN_PROGRESS' && 'border-warning/50 ring-1 ring-warning/30')}>
              <div className="flex items-start justify-between gap-2"><span className="font-mono text-xs text-muted">{e.code}</span>{statusBadge(e)}</div>
              <p className="mt-2 font-semibold">{e.name}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted">
                <span className="flex items-center gap-1"><ClipboardCheck className="h-3.5 w-3.5" />{t('ui.nQuestions', { count: e.questionCount })}</span>
                <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{t('ui.nMinutes', { count: e.durationMinutes })}</span>
                <span className="flex items-center gap-1"><Target className="h-3.5 w-3.5" />{t('ui.passAt', { value: e.passingScore })}</span>
                <span className="flex items-center gap-1"><RotateCw className="h-3.5 w-3.5" />{t('take.attemptsUsed', { used: e.attemptsUsed, max: e.maxAttempts })}</span>
                {(e.dueAt || e.endAt) && <span className="col-span-2 flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />{t('ui.deadline', { date: fmtDateTime(e.dueAt ?? e.endAt) })}</span>}
              </div>
              {e.bestScore != null && <p className="mt-3 flex items-center gap-2 text-sm"><Trophy className="h-4 w-4 text-solar" />{t('ui.bestScore')}: <b className="num">{fmtPct(e.bestScore)}</b>{last?.passed != null && <PassBadge passed={last.passed} />}</p>}
              <div className="mt-auto flex gap-2 pt-4">
                {e.availability === 'IN_PROGRESS' && <Button className="flex-1" variant="primary" icon={<Play className="h-4 w-4" />} onClick={() => nav(`/thi/lam-bai/${e.inProgressAttemptId}`)}>{t('take.resume')}</Button>}
                {e.availability === 'AVAILABLE' && <Button className="flex-1" icon={<Play className="h-4 w-4" />} onClick={() => setStarting(e)}>{t('take.start')}</Button>}
                {last && <Button variant="outline" className={e.availability === 'AVAILABLE' || e.availability === 'IN_PROGRESS' ? '' : 'flex-1'} onClick={() => nav(`/ket-qua/luot/${last.id}`)}>{t('take.viewResult')}</Button>}
              </div>
            </motion.div>
          );
        })}
      </div>
      <Dialog
        open={!!starting}
        onClose={() => setStarting(null)}
        title={t('take.instructions')}
        description={starting?.name}
        footer={<><Button variant="secondary" onClick={() => setStarting(null)}>{t('common.cancel')}</Button><Button icon={<Play className="h-4 w-4" />} loading={busy} onClick={() => starting && void start(starting)} data-autofocus>{t('take.start')}</Button></>}
      >
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          {(t('take.instructionList', { returnObjects: true, count: starting?.questionCount, minutes: starting?.durationMinutes }) as string[]).map((line, i) => (
            <li key={i}>{line.replace('{{count}}', String(starting?.questionCount)).replace('{{minutes}}', String(starting?.durationMinutes))}</li>
          ))}
        </ol>
        <p className="mt-4 rounded-lg bg-warning-soft p-3 text-sm text-warning">{t('take.confirmStart')}</p>
      </Dialog>
    </>
  );
}
