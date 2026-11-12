import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import {
  AlertTriangle, ArrowLeft, Award, BarChart3, BookOpenCheck, CheckCircle2, CircleSlash, Clock, Download, EyeOff, FileText, Gauge, Lightbulb, Radar as RadarIcon, Target, TrendingUp, XCircle,
} from 'lucide-react';
import type { CompetencyLevel, QuestionType } from '@solar/shared';
import { useT } from '@/i18n';
import { download } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useGet } from '@/hooks/useApi';
import { Badge, Button, Card, CardHeader } from '@/components/ui/primitives';
import { AnimatedNumber, EmptyState, ProgressBar, ScoreRing, Skeleton, Table, Tabs, Td, Th } from '@/components/ui/data';
import { CompetencyBadge, DifficultyBadge, competencyTone } from '@/components/domain';
import { CompetencyRadar, HBarChart, StatusDonut, VBarChart, scoreTone } from '@/components/charts';
import { RichContent } from '@/components/RichContent';
import { cn, fmtDateTime, fmtDuration, fmtNum, fmtPct } from '@/lib/format';

interface Bucket { key: string; code?: string; label: string; total: number; correct: number; incorrect: number; unanswered: number; percent: number; level: CompetencyLevel }
interface ReviewQ {
  id: string; order: number; code: string; type: QuestionType; title: string; content: string; assumptions: string | null; categoryCode: string; categoryName: string; difficulty: number; points: number;
  options: Array<{ id: string; label: string; isCorrect: boolean; rationale?: string | null }>;
  numeric: { answer: number; unit: string | null; tolerance: number; toleranceType: string; decimals: number | null } | null;
  answer: { selectedOptionIds: string[]; numericValue: number | null } | null; isCorrect: boolean | null;
  explanation?: string | null; calcMethod?: string | null; references?: Array<{ standard: string; edition: string | null }>;
}
export interface ResultDetail {
  attemptId: string; status: string; pending?: boolean; visibility: 'HIDDEN' | 'SCORE_ONLY' | 'DETAILED';
  exam: { id: string; name: string; code: string; durationMinutes: number; passingScore: number };
  candidate: { fullName: string; username: string; department: string | null; position: string | null };
  attemptNo: number; startedAt: string; submittedAt: string;
  summary?: { scorePercent: number; pointsEarned: number; pointsTotal: number; correctCount: number; incorrectCount: number; unansweredCount: number; durationSeconds: number; passed: boolean };
  byCategory?: Bucket[]; byDifficulty?: Bucket[];
  analysis?: { weaknesses: Array<{ key: string; code?: string; label: string; percent: number; level: CompetencyLevel }>; strengths: Array<{ key: string; code?: string; label: string; percent: number; level: CompetencyLevel }> };
  showExplanation?: boolean; questions?: ReviewQ[];
}

export default function ResultPage() {
  const { attemptId } = useParams();
  const { t } = useT();
  const { can } = useAuth();
  const reduce = useReducedMotion();
  const { data, isLoading } = useGet<ResultDetail>(['result', attemptId], `/results/attempts/${attemptId}`);
  const [filter, setFilter] = useState<'all' | 'incorrect' | 'unanswered' | 'correct'>('all');
  const questions = useMemo(() => {
    const qs = data?.questions ?? [];
    if (filter === 'incorrect') return qs.filter((q) => q.isCorrect === false);
    if (filter === 'unanswered') return qs.filter((q) => q.isCorrect === null);
    if (filter === 'correct') return qs.filter((q) => q.isCorrect === true);
    return qs;
  }, [data, filter]);

  if (isLoading || !data) return <div className="space-y-4"><Skeleton className="h-64 rounded-xl" /><Skeleton className="h-80 rounded-xl" /></div>;
  const back = can('results.view_all') ? '/ket-qua' : '/ket-qua-cua-toi';
  if (data.pending) return <EmptyState icon={<Clock className="h-7 w-7" />} title={t('ui.attemptPending')} />;

  const s = data.summary;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to={back} className="flex items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft className="h-4 w-4" />{t('common.back')}</Link>
        {s && <Button variant="outline" icon={<Download className="h-4 w-4" />} onClick={() => void download(`/results/attempts/${data.attemptId}/pdf`, 'ket-qua.pdf')}>{t('common.exportPdf')}</Button>}
      </div>

      {/* Hero */}
      <Card className="relative overflow-hidden">
        {s && <div className={cn('pointer-events-none absolute inset-0 opacity-60', s.passed ? 'bg-[radial-gradient(600px_300px_at_15%_0%,rgb(var(--success)/0.15),transparent)]' : 'bg-[radial-gradient(600px_300px_at_15%_0%,rgb(var(--danger)/0.12),transparent)]')} />}
        <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[auto_1fr]">
          <div className="flex flex-col items-center gap-4">
            {s ? (
              <ScoreRing value={s.scorePercent} size={190} stroke={14} tone={s.passed ? 'success' : scoreTone(s.scorePercent) === 'warning' ? 'warning' : 'danger'} label={`${t('results.score')} ${fmtPct(s.scorePercent)}`}>
                <AnimatedNumber value={s.scorePercent} digits={1} suffix="%" className="text-4xl font-bold" duration={1.4} />
                <span className="num text-xs text-muted">{fmtNum(s.pointsEarned)}/{fmtNum(s.pointsTotal)} {t('results.points')}</span>
              </ScoreRing>
            ) : (
              <div className="flex h-[190px] w-[190px] items-center justify-center rounded-full bg-surface-2"><EyeOff className="h-10 w-10 text-subtle" /></div>
            )}
            {s && (
              <motion.div initial={reduce ? false : { scale: 0.4, opacity: 0, rotate: -8 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ delay: 1.2, type: 'spring', stiffness: 260, damping: 14 }}
                className={cn('flex items-center gap-2 rounded-full px-5 py-2 text-lg font-bold tracking-wide text-white shadow-lg', s.passed ? 'bg-success shadow-success/30' : 'bg-danger shadow-danger/30')} role="status">
                {s.passed ? <Award className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
                {s.passed ? t('results.passed') : t('results.failed')}
              </motion.div>
            )}
          </div>
          <div className="min-w-0">
            <p className="font-mono text-xs text-muted">{data.exam.code} · {t('results.attemptNo')} {data.attemptNo}</p>
            <h1 className="mt-1 text-2xl font-bold">{data.exam.name}</h1>
            <p className="mt-1 text-sm text-muted">{data.candidate.fullName}{data.candidate.department && ` · ${data.candidate.department}`} · {t('results.submittedAt')} {fmtDateTime(data.submittedAt)}</p>
            {data.status === 'AUTO_SUBMITTED' && <Badge tone="warning" className="mt-2" icon={<Clock className="h-3 w-3" />}>{t('attemptStatus.AUTO_SUBMITTED')}</Badge>}
            {data.visibility === 'HIDDEN' && <p className="mt-6 flex items-center gap-2 rounded-lg bg-info-soft p-4 text-info"><EyeOff className="h-5 w-5" />{t('results.hidden')}</p>}
            {s && (
              <>
                <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <MiniStat icon={<CheckCircle2 className="h-4 w-4" />} tone="success" label={t('results.correct')} value={s.correctCount} />
                  <MiniStat icon={<XCircle className="h-4 w-4" />} tone="danger" label={t('results.incorrect')} value={s.incorrectCount} />
                  <MiniStat icon={<CircleSlash className="h-4 w-4" />} tone="neutral" label={t('results.unanswered')} value={s.unansweredCount} />
                  <MiniStat icon={<Target className="h-4 w-4" />} tone="info" label={t('results.passMark')} value={data.exam.passingScore} suffix="%" />
                </div>
                <div className="mt-6">
                  <div className="mb-1.5 flex justify-between text-sm"><span className="flex items-center gap-1.5 text-muted"><Clock className="h-4 w-4" />{t('results.duration')}</span><span className="num font-medium">{fmtDuration(s.durationSeconds)} / {data.exam.durationMinutes} {t('common.minutes')}</span></div>
                  <ProgressBar value={(s.durationSeconds / (data.exam.durationMinutes * 60)) * 100} tone="info" label={t('results.timeUsed')} />
                </div>
                {data.visibility === 'SCORE_ONLY' && <p className="mt-4 text-sm text-muted">{t('results.scoreOnly')}</p>}
              </>
            )}
          </div>
        </div>
      </Card>

      {s && data.byCategory && (
        <>
          <div className="grid gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader title={t('results.correctVsIncorrect')} icon={<Gauge className="h-5 w-5" />} />
              <div className="flex justify-center p-5">
                <StatusDonut data={[{ name: t('results.correct'), value: s.correctCount, tone: 'success' }, { name: t('results.incorrect'), value: s.incorrectCount, tone: 'danger' }, { name: t('results.unanswered'), value: s.unansweredCount, tone: 'subtle' }]} center={<span className="num text-2xl font-bold">{s.correctCount}/{s.correctCount + s.incorrectCount + s.unansweredCount}</span>} />
              </div>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader title={t('results.competencyAssessment')} icon={<RadarIcon className="h-5 w-5" />} />
              <div className="p-4"><CompetencyRadar data={data.byCategory.map((b) => ({ name: b.code ?? b.label, full: b.label, value: b.percent }))} label={t('results.score')} height={300} /></div>
            </Card>
          </div>
          <div className="grid gap-6 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader title={t('results.byCategory')} icon={<BarChart3 className="h-5 w-5" />} />
              <Table>
                <thead><tr><Th>{t('results.technicalArea')}</Th><Th className="text-right">{t('results.score')}</Th><Th className="hidden text-right sm:table-cell">{t('ui.correctShort')}</Th><Th>{t('results.assessment')}</Th></tr></thead>
                <tbody>
                  {data.byCategory.map((b, i) => (
                    <motion.tr key={b.key} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.04 }}>
                      <Td><span className="font-semibold text-primary">{b.code}</span> {b.label}<ProgressBar className="mt-1.5" value={b.percent} tone={competencyTone(b.level)} height="h-1.5" /></Td>
                      <Td className="num text-right font-semibold">{fmtPct(b.percent, 0)}</Td>
                      <Td className="num hidden text-right text-muted sm:table-cell">{b.correct}/{b.total}</Td>
                      <Td><CompetencyBadge level={b.level} /></Td>
                    </motion.tr>
                  ))}
                </tbody>
              </Table>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader title={t('results.byDifficulty')} icon={<TrendingUp className="h-5 w-5" />} />
              <div className="p-4"><VBarChart data={(data.byDifficulty ?? []).map((b) => ({ name: t(`difficulty.${b.key}`), value: b.percent, hint: `${t(`difficultyLong.${b.key}`)} · ${b.correct}/${b.total}` }))} valueLabel={t('results.score')} unit="%" max={100} colorBy={(v) => scoreTone(v)} height={280} /></div>
            </Card>
          </div>
          {data.analysis && (
            <Card>
              <CardHeader title={t('results.weaknesses')} icon={<Lightbulb className="h-5 w-5" />} />
              <div className="grid gap-6 p-5 md:grid-cols-2">
                <div>
                  <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-danger"><AlertTriangle className="h-4 w-4" />{t('results.recommendations')}</p>
                  {!data.analysis.weaknesses.length ? <p className="flex items-center gap-2 text-sm text-success"><CheckCircle2 className="h-4 w-4" />{t('results.noWeakness')}</p> : (
                    <ul className="space-y-3">
                      {data.analysis.weaknesses.map((w) => (
                        <li key={w.key} className={cn('rounded-lg border-l-4 p-3 text-sm', w.level === 'WEAK' ? 'border-danger bg-danger-soft/50' : 'border-warning bg-warning-soft/50')}>
                          <div className="flex items-center justify-between gap-2"><b>{w.code}. {w.label}</b><span className="num font-semibold">{fmtPct(w.percent, 0)}</span></div>
                          <p className="mt-1 text-muted">{t(`results.recommendation.${w.level}`)}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-success"><Award className="h-4 w-4" />{t('results.strengths')}</p>
                  {data.analysis.strengths.length ? <HBarChart data={data.analysis.strengths.map((x) => ({ name: `${x.code}. ${x.label.slice(0, 22)}`, value: x.percent, hint: x.label }))} valueLabel={t('results.score')} unit="%" max={100} colorBy={() => 'success'} /> : <p className="text-sm text-muted">{t('common.noData')}</p>}
                </div>
              </div>
            </Card>
          )}
          {data.questions && (
            <Card>
              <CardHeader title={t('results.answerReview')} icon={<BookOpenCheck className="h-5 w-5" />} subtitle={!data.showExplanation ? t('ui.explanationLater') : undefined} />
              <Tabs className="px-4" value={filter} onChange={setFilter} tabs={[
                { id: 'all', label: t('common.all'), count: data.questions.length },
                { id: 'incorrect', label: t('results.incorrect'), count: s.incorrectCount },
                { id: 'unanswered', label: t('results.unanswered'), count: s.unansweredCount },
                { id: 'correct', label: t('results.correct'), count: s.correctCount },
              ]} />
              <div className="space-y-4 p-4 sm:p-5">
                {questions.map((q) => <ReviewCard key={q.id} q={q} showExplanation={!!data.showExplanation} />)}
                {!questions.length && <EmptyState title={t('common.noData')} />}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function MiniStat({ icon, label, value, tone, suffix }: { icon: React.ReactNode; label: string; value: number; tone: 'success' | 'danger' | 'neutral' | 'info'; suffix?: string }) {
  const cls = { success: 'text-success bg-success-soft', danger: 'text-danger bg-danger-soft', neutral: 'text-muted bg-surface-2', info: 'text-info bg-info-soft' }[tone];
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <p className="flex items-center gap-1.5 text-xs text-muted"><span className={cn('rounded-md p-1', cls)}>{icon}</span>{label}</p>
      <p className="mt-1.5 text-2xl font-bold"><AnimatedNumber value={value} suffix={suffix} /></p>
    </div>
  );
}

function ReviewCard({ q, showExplanation }: { q: ReviewQ; showExplanation: boolean }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const status = q.isCorrect === true ? { tone: 'success' as const, icon: <CheckCircle2 className="h-4 w-4" />, label: t('results.correct') } : q.isCorrect === false ? { tone: 'danger' as const, icon: <XCircle className="h-4 w-4" />, label: t('results.incorrect') } : { tone: 'neutral' as const, icon: <CircleSlash className="h-4 w-4" />, label: t('results.noAnswer') };
  return (
    <div className={cn('rounded-xl border border-l-4', q.isCorrect === true ? 'border-l-success' : q.isCorrect === false ? 'border-l-danger' : 'border-l-subtle', 'border-border')}>
      <button className="flex w-full items-center gap-3 p-4 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="num w-8 text-sm font-bold text-muted">{q.order}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{q.title}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted"><b className="text-primary">{q.categoryCode}</b>{q.categoryName}<DifficultyBadge level={q.difficulty} compact /></div>
        </div>
        <Badge tone={status.tone} icon={status.icon}>{status.label}</Badge>
      </button>
      {open && (
        <div className="space-y-4 border-t border-border p-4">
          <RichContent text={q.content} />
          {q.assumptions && <div className="rounded-lg bg-info-soft/50 p-3 text-sm"><RichContent text={q.assumptions} /></div>}
          {q.type === 'NUMERIC' ? (
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <p className={cn('rounded-lg border p-3', q.isCorrect ? 'border-success/40 bg-success-soft/40' : 'border-danger/40 bg-danger-soft/40')}>{t('results.yourAnswer')}: <b className="num">{q.answer?.numericValue != null ? `${fmtNum(q.answer.numericValue)} ${q.numeric?.unit ?? ''}` : t('results.noAnswer')}</b></p>
              <p className="rounded-lg border border-success/40 bg-success-soft/40 p-3">{t('results.correctAnswer')}: <b className="num">{fmtNum(q.numeric?.answer, q.numeric?.decimals ?? undefined)} {q.numeric?.unit}</b></p>
            </div>
          ) : (
            <ul className="space-y-2">
              {q.options.map((o, i) => {
                const chosen = q.answer?.selectedOptionIds.includes(o.id);
                return (
                  <li key={o.id} className={cn('flex items-start gap-3 rounded-lg border p-3 text-sm', o.isCorrect ? 'border-success/50 bg-success-soft/40' : chosen ? 'border-danger/50 bg-danger-soft/40' : 'border-border')}>
                    <span className="font-bold text-muted">{String.fromCharCode(65 + i)}.</span>
                    <div className="flex-1"><RichContent text={o.label} className="[&_p]:my-0" />{showExplanation && o.rationale && <p className="mt-1 text-xs text-muted">↳ {o.rationale}</p>}</div>
                    {chosen && <Badge tone={o.isCorrect ? 'success' : 'danger'}>{t('results.yourAnswer')}</Badge>}
                    {o.isCorrect && <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-label={t('results.correctAnswer')} />}
                  </li>
                );
              })}
            </ul>
          )}
          {showExplanation && q.explanation && (
            <div className="rounded-lg bg-surface-2/60 p-4">
              <p className="mb-1 flex items-center gap-2 text-sm font-semibold"><FileText className="h-4 w-4 text-primary" />{t('results.explanation')}</p>
              <RichContent text={q.explanation} />
              {q.calcMethod && <><p className="mb-1 mt-3 text-sm font-semibold">{t('questions.calcMethod')}</p><RichContent text={q.calcMethod} /></>}
              {!!q.references?.length && <p className="mt-2 text-xs text-muted">{q.references.map((r) => `${r.standard}${r.edition ? `:${r.edition}` : ''}`).join(' · ')}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
