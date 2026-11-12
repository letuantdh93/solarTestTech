import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, Check, ChevronLeft, ChevronRight, CloudOff, Eraser, Flag, Grid3x3, Loader2, Send, Sun, User, X, CheckCircle2 } from 'lucide-react';
import type { QuestionType } from '@solar/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useT } from '@/i18n';
import { api, ApiError } from '@/lib/api';
import { useGet } from '@/hooks/useApi';
import { Button } from '@/components/ui/primitives';
import { Dialog, useToast } from '@/components/ui/feedback';
import { Skeleton } from '@/components/ui/data';
import { RichContent } from '@/components/RichContent';
import { cn, fmtClock, fmtNum, parseDecimal } from '@/lib/format';
import { useAutosave } from './useAutosave';

interface Answer { selectedOptionIds: string[]; numericValue: number | null; flagged: boolean }
interface AQ { id: string; order: number; type: QuestionType; title: string; content: string; assumptions: string | null; unit: string | null; options: Array<{ id: string; label: string }>; answer: Answer }
interface AttemptView {
  id: string; status: string; startedAt: string; deadlineAt: string; serverNow: string;
  exam: { name: string; code: string; durationMinutes: number }; candidate: { fullName: string; username: string; department: string | null }; questions: AQ[];
}

const isAnswered = (a?: Answer) => !!a && (a.selectedOptionIds.length > 0 || a.numericValue != null);

/** Circular countdown with low-time states. Purely presentational. */
function TimerRing({ remaining, total }: { remaining: number; total: number }) {
  const { t } = useT();
  const reduce = useReducedMotion();
  const pct = Math.max(0, Math.min(1, remaining / Math.max(1, total)));
  const size = 56;
  const r = 24;
  const c = 2 * Math.PI * r;
  const low = remaining <= 300;
  const critical = remaining <= 60;
  const color = critical ? 'danger' : low ? 'warning' : 'primary';
  return (
    <div className="flex items-center gap-3" role="timer" aria-live={critical ? 'assertive' : 'off'} aria-label={`${t('take.timeLeft')}: ${fmtClock(remaining)}`}>
      <div className={cn('relative', critical && !reduce && 'animate-pulse-ring')} style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--surface-2))" strokeWidth={5} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`rgb(var(--${color}))`} strokeWidth={5} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: reduce ? 'none' : 'stroke-dashoffset 1s linear, stroke 0.4s' }} />
        </svg>
        <Sun className={cn('absolute inset-0 m-auto h-5 w-5', `text-${color}`)} />
      </div>
      <div className="leading-tight">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{low ? t('take.timeLow') : t('take.timeLeft')}</p>
        <p className={cn('num font-mono text-2xl font-bold', `text-${color}`)}>{fmtClock(remaining)}</p>
      </div>
    </div>
  );
}

export default function TakeExamPage() {
  const { attemptId } = useParams();
  const { t } = useT();
  const nav = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const reduce = useReducedMotion();
  const { data, isLoading, error } = useGet<AttemptView>(['attempt', attemptId], `/attempts/${attemptId}`);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [idx, setIdx] = useState(0);
  const [dir, setDir] = useState(1);
  const [offset, setOffset] = useState(0); // serverNow - clientNow (ms)
  const [now, setNow] = useState(Date.now());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [numericDraft, setNumericDraft] = useState<Record<string, string>>({});
  const finished = useRef(false);
  const navRef = useRef<HTMLDivElement>(null);

  // Already submitted → go to result
  useEffect(() => {
    if (data && data.status !== 'IN_PROGRESS') nav(`/ket-qua/luot/${attemptId}`, { replace: true });
  }, [data, attemptId, nav]);

  useEffect(() => {
    if (!data?.questions) return;
    setAnswers(Object.fromEntries(data.questions.map((q) => [q.id, q.answer])));
    setNumericDraft(Object.fromEntries(data.questions.filter((q) => q.type === 'NUMERIC').map((q) => [q.id, q.answer.numericValue != null ? fmtNum(q.answer.numericValue, undefined).replace(/\./g, '') : ''])));
    setOffset(new Date(data.serverNow).getTime() - Date.now());
  }, [data]);

  const goResult = useCallback(() => {
    finished.current = true;
    void qc.invalidateQueries({ queryKey: ['my-exams'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
    nav(`/ket-qua/luot/${attemptId}`, { replace: true });
  }, [attemptId, nav, qc]);

  const onTerminal = useCallback((code: string) => {
    toast.warning(code === 'TIME_UP' ? t('take.timeUp') : t('take.submitted'));
    goResult();
  }, [goResult, toast, t]);
  const autosave = useAutosave(attemptId!, onTerminal);

  const submit = useCallback(async (auto: boolean) => {
    if (finished.current) return;
    setSubmitting(true);
    try {
      await autosave.flushAll();
      await api(`/attempts/${attemptId}/submit`, { method: 'POST' });
      toast.success(auto ? t('take.timeUp') : t('take.submitted'));
      goResult();
    } catch (e) {
      if (e instanceof ApiError && e.status === 0 && auto) {
        // offline at time-up: server auto-submits; keep retrying
        setTimeout(() => void submit(true), 3000);
        return;
      }
      toast.error(e instanceof ApiError ? e.message : t('common.unknownError'));
      setSubmitting(false);
    }
  }, [attemptId, autosave, goResult, toast, t]);

  // Clock tick (1 s) – independent from animations
  useEffect(() => {
    const h = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(h);
  }, []);
  // Resync with server time every 60 s
  useEffect(() => {
    const h = setInterval(async () => {
      try {
        const r = await api<{ serverNow: string; status: string }>(`/attempts/${attemptId}/time`);
        setOffset(new Date(r.serverNow).getTime() - Date.now());
        if (r.status !== 'IN_PROGRESS') goResult();
      } catch { /* ignore */ }
    }, 60_000);
    return () => clearInterval(h);
  }, [attemptId, goResult]);

  const deadline = data ? new Date(data.deadlineAt).getTime() : 0;
  const total = data ? (new Date(data.deadlineAt).getTime() - new Date(data.startedAt).getTime()) / 1000 : 1;
  const remaining = data ? Math.max(0, Math.round((deadline - (now + offset)) / 1000)) : 0;

  useEffect(() => {
    if (data && data.status === 'IN_PROGRESS' && remaining <= 0 && !finished.current && !submitting) void submit(true);
  }, [remaining, data, submit, submitting]);

  // Leave-page warning
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (finished.current) return;
      e.preventDefault();
      e.returnValue = t('take.leaveWarning');
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [t]);

  const questions = data?.questions ?? [];
  const q = questions[idx];
  const answeredCount = useMemo(() => questions.filter((x) => isAnswered(answers[x.id])).length, [questions, answers]);
  const flaggedCount = useMemo(() => questions.filter((x) => answers[x.id]?.flagged).length, [questions, answers]);

  const go = useCallback((i: number) => {
    if (i < 0 || i >= questions.length) return;
    setDir(i > idx ? 1 : -1);
    setIdx(i);
    setNavOpen(false);
  }, [idx, questions.length]);

  // Keep current item visible in the navigator
  useEffect(() => {
    navRef.current?.querySelector<HTMLElement>(`[data-q="${idx}"]`)?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }, [idx, reduce]);

  // Keyboard navigation
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || confirmOpen) return;
      if (e.key === 'ArrowRight') go(idx + 1);
      if (e.key === 'ArrowLeft') go(idx - 1);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [go, idx, confirmOpen]);

  // Guard against interactions with the outgoing question during the transition.
  const currentId = useRef<string | undefined>(undefined);
  currentId.current = questions[idx]?.id;
  function update(qid: string, patch: Partial<Answer>, debounce = 0) {
    if (qid !== currentId.current) return;
    setAnswers((s) => ({ ...s, [qid]: { ...s[qid]!, ...patch } }));
    autosave.save(qid, patch, debounce);
  }
  function choose(question: AQ, optionId: string) {
    const cur = answers[question.id]?.selectedOptionIds ?? [];
    const next = question.type === 'MULTIPLE_CHOICE' ? (cur.includes(optionId) ? cur.filter((x) => x !== optionId) : [...cur, optionId]) : [optionId];
    update(question.id, { selectedOptionIds: next });
  }

  if (error) return <div className="flex min-h-screen items-center justify-center p-6"><p className="text-danger">{error.message}</p></div>;
  if (isLoading || !data || !q) return <div className="mx-auto max-w-5xl space-y-4 p-6"><Skeleton className="h-16" /><Skeleton className="h-96" /></div>;

  const ans = answers[q.id] ?? { selectedOptionIds: [], numericValue: null, flagged: false };
  const progress = (answeredCount / questions.length) * 100;
  const saveIndicator = {
    idle: null,
    saving: <span className="flex items-center gap-1.5 text-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" />{t('take.saving')}</span>,
    saved: <span className="flex items-center gap-1.5 text-success"><CheckCircle2 className="h-3.5 w-3.5" />{t('take.autoSaved')}</span>,
    error: <span className="flex items-center gap-1.5 text-warning"><AlertTriangle className="h-3.5 w-3.5" />{t('take.saveError')}</span>,
    offline: <span className="flex items-center gap-1.5 text-danger"><CloudOff className="h-3.5 w-3.5" />{t('take.offline')}</span>,
  }[autosave.state];

  const Navigator = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <p className="text-sm font-semibold">{t('take.navigator')}</p>
        <span className="num text-xs text-muted">{answeredCount}/{questions.length}</span>
      </div>
      <div ref={navRef} className="scrollbar-thin grid flex-1 grid-cols-5 content-start gap-2 overflow-y-auto p-4 sm:grid-cols-6 lg:grid-cols-5">
        {questions.map((x, i) => {
          const a = answers[x.id];
          const done = isAnswered(a);
          return (
            <motion.button
              key={x.id}
              data-q={i}
              whileTap={{ scale: 0.92 }}
              onClick={() => go(i)}
              aria-label={`${t('take.question')} ${i + 1}: ${done ? t('take.answered') : t('take.unanswered')}${a?.flagged ? ', ' + t('take.flagged') : ''}`}
              aria-current={i === idx ? 'step' : undefined}
              className={cn(
                'num relative flex h-10 items-center justify-center rounded-lg border text-sm font-semibold transition-all duration-200',
                done ? 'border-primary bg-primary text-white' : 'border-border bg-surface text-muted hover:border-primary/50',
                i === idx && 'ring-2 ring-solar ring-offset-2 ring-offset-surface',
              )}
            >
              {i + 1}
              {a?.flagged && <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-warning text-white"><Flag className="h-2.5 w-2.5" /></span>}
            </motion.button>
          );
        })}
      </div>
      <div className="space-y-1.5 border-t border-border p-4 text-xs text-muted">
        <p className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-primary" />{t('take.answered')} ({answeredCount})</p>
        <p className="flex items-center gap-2"><span className="h-3 w-3 rounded border border-border" />{t('take.unanswered')} ({questions.length - answeredCount})</p>
        <p className="flex items-center gap-2"><span className="flex h-3 w-3 items-center justify-center rounded-full bg-warning"><Flag className="h-2 w-2 text-white" /></span>{t('take.flagged')} ({flaggedCount})</p>
        <p className="flex items-center gap-2"><span className="h-3 w-3 rounded ring-2 ring-solar" />{t('take.current')}</p>
      </div>
    </div>
  );

  return (
    <div className={cn('min-h-screen pb-24 lg:pb-0', remaining <= 300 && 'bg-[radial-gradient(1200px_300px_at_50%_-100px,rgb(var(--warning)/0.10),transparent)]')}>
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1400px] items-center gap-4 px-4 py-2.5 sm:px-6">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold sm:text-base">{data.exam.name}</p>
            <p className="flex items-center gap-1.5 truncate text-xs text-muted"><User className="h-3 w-3" />{data.candidate.fullName}{data.candidate.department && ` · ${data.candidate.department}`}</p>
          </div>
          <div className="hidden text-xs md:block">{saveIndicator}</div>
          <TimerRing remaining={remaining} total={total} />
          <Button className="hidden sm:inline-flex" icon={<Send className="h-4 w-4" />} onClick={() => setConfirmOpen(true)} disabled={submitting}>{t('take.submit')}</Button>
        </div>
        <div className="h-1 w-full bg-surface-2" role="progressbar" aria-label={t('take.progress')} aria-valuenow={answeredCount} aria-valuemax={questions.length}>
          <motion.div className="h-full bg-gradient-to-r from-primary to-info" animate={{ width: `${progress}%` }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} />
        </div>
      </header>

      <div className="mx-auto grid max-w-[1400px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_300px]">
        <main>
          <AnimatePresence mode="wait" custom={dir} initial={false}>
            <motion.section
              key={q.id}
              custom={dir}
              initial={{ opacity: 0, x: reduce ? 0 : dir * 32 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: reduce ? 0 : dir * -32, pointerEvents: 'none' }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="card p-5 sm:p-7"
              aria-labelledby="q-title"
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <p id="q-title" className="text-sm font-semibold text-primary">
                  {t('take.question')} <span className="num text-lg">{idx + 1}</span><span className="text-muted"> / {questions.length}</span>
                </p>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" icon={<Eraser className="h-4 w-4" />} disabled={!isAnswered(ans)} onClick={() => { update(q.id, q.type === 'NUMERIC' ? { numericValue: null } : { selectedOptionIds: [] }); setNumericDraft((s) => ({ ...s, [q.id]: '' })); }}>
                    <span className="hidden sm:inline">{t('take.clearAnswer')}</span>
                  </Button>
                  <Button variant={ans.flagged ? 'outline' : 'ghost'} size="sm" className={cn(ans.flagged && 'border-warning text-warning')} aria-pressed={ans.flagged} icon={<motion.span animate={{ rotate: ans.flagged ? [0, -15, 10, 0] : 0 }}><Flag className="h-4 w-4" /></motion.span>} onClick={() => update(q.id, { flagged: !ans.flagged })}>
                    {ans.flagged ? t('take.unflag') : t('take.flag')}
                  </Button>
                </div>
              </div>
              <RichContent text={q.content} className="text-base" />
              {q.assumptions && (
                <div className="mt-4 rounded-lg border-l-4 border-info bg-info-soft/50 p-3 text-sm">
                  <p className="mb-1 font-semibold text-info">{t('questions.assumptions')}</p>
                  <RichContent text={q.assumptions} />
                </div>
              )}
              <p className="mt-6 text-xs font-medium uppercase tracking-wide text-muted">
                {q.type === 'MULTIPLE_CHOICE' ? t('take.selectMany') : q.type === 'TRUE_FALSE' ? t('take.selectTrueFalse') : q.type === 'NUMERIC' ? t('take.enterNumber') : t('take.selectOne')}
              </p>
              {q.type === 'NUMERIC' ? (
                <div className="mt-3 max-w-sm">
                  <div className="flex items-stretch overflow-hidden rounded-xl border-2 border-border transition-colors focus-within:border-primary focus-within:shadow-glow">
                    <input
                      inputMode="decimal"
                      aria-label={t('take.enterNumber')}
                      className="num w-full bg-transparent px-4 py-3 text-xl font-semibold outline-none"
                      value={numericDraft[q.id] ?? ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        setNumericDraft((s) => ({ ...s, [q.id]: v }));
                        const n = v.trim() === '' ? null : parseDecimal(v);
                        if (v.trim() === '' || n != null) update(q.id, { numericValue: n }, 700);
                      }}
                    />
                    {q.unit && <span className="flex items-center bg-surface-2 px-4 text-sm font-medium text-muted">{q.unit}</span>}
                  </div>
                  <p className="mt-1.5 text-xs text-muted">{numericDraft[q.id] && parseDecimal(numericDraft[q.id]!) == null ? <span className="text-danger">{t('ui.invalidValue')}</span> : t('take.numericHint')}</p>
                </div>
              ) : (
                <ul className="mt-3 space-y-2.5" role={q.type === 'MULTIPLE_CHOICE' ? 'group' : 'radiogroup'}>
                  {q.options.map((o, i) => {
                    const sel = ans.selectedOptionIds.includes(o.id);
                    return (
                      <li key={o.id}>
                        <motion.button
                          type="button"
                          role={q.type === 'MULTIPLE_CHOICE' ? 'checkbox' : 'radio'}
                          aria-checked={sel}
                          whileTap={{ scale: 0.99 }}
                          onClick={() => choose(q, o.id)}
                          className={cn(
                            'group flex w-full items-start gap-3 rounded-xl border-2 p-3.5 text-left transition-all duration-200 sm:p-4',
                            sel ? 'border-primary bg-primary-soft/50 shadow-sm' : 'border-border bg-surface hover:border-primary/40 hover:bg-surface-2/50',
                          )}
                        >
                          <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center border-2 text-sm font-bold transition-all duration-200', q.type === 'MULTIPLE_CHOICE' ? 'rounded-lg' : 'rounded-full', sel ? 'scale-105 border-primary bg-primary text-white' : 'border-border text-muted group-hover:border-primary/50')}>
                            <AnimatePresence mode="wait" initial={false}>
                              {sel ? (
                                <motion.span key="c" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}><Check className="h-4 w-4" /></motion.span>
                              ) : (
                                <motion.span key="l" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>{String.fromCharCode(65 + i)}</motion.span>
                              )}
                            </AnimatePresence>
                          </span>
                          <RichContent text={o.label} className="flex-1 pt-0.5 [&_p]:my-0" />
                        </motion.button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-5">
                <Button variant="secondary" icon={<ChevronLeft className="h-4 w-4" />} disabled={idx === 0} onClick={() => go(idx - 1)}>{t('common.previous')}</Button>
                <span className="text-xs md:hidden">{saveIndicator}</span>
                {idx < questions.length - 1 ? (
                  <Button onClick={() => go(idx + 1)}>{t('common.next')} <ChevronRight className="h-4 w-4" /></Button>
                ) : (
                  <Button variant="success" icon={<Send className="h-4 w-4" />} onClick={() => setConfirmOpen(true)}>{t('take.submit')}</Button>
                )}
              </div>
            </motion.section>
          </AnimatePresence>
        </main>
        <aside className="card sticky top-24 hidden h-[calc(100vh-8rem)] overflow-hidden lg:block">{Navigator}</aside>
      </div>

      {/* Mobile bottom bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t border-border bg-surface/95 p-3 backdrop-blur lg:hidden">
        <Button variant="secondary" className="flex-1" icon={<Grid3x3 className="h-4 w-4" />} onClick={() => setNavOpen(true)}>{t('take.showNavigator')} <span className="num">({answeredCount}/{questions.length})</span></Button>
        <Button className="flex-1" icon={<Send className="h-4 w-4" />} onClick={() => setConfirmOpen(true)}>{t('take.submit')}</Button>
      </div>
      <AnimatePresence>
        {navOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <motion.div className="absolute inset-0 bg-slate-950/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setNavOpen(false)} />
            <motion.div className="absolute inset-x-0 bottom-0 max-h-[75vh] rounded-t-2xl bg-surface" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 380, damping: 36 }}>
              <button className="absolute right-3 top-2.5 rounded p-1 text-muted" onClick={() => setNavOpen(false)} aria-label={t('common.close')}><X className="h-5 w-5" /></button>
              <div className="h-[70vh]">{Navigator}</div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <Dialog
        open={confirmOpen}
        onClose={() => !submitting && setConfirmOpen(false)}
        size="sm"
        title={t('take.confirmSubmitTitle')}
        footer={<><Button variant="secondary" disabled={submitting} onClick={() => setConfirmOpen(false)}>{t('common.cancel')}</Button><Button loading={submitting} icon={<Send className="h-4 w-4" />} onClick={() => void submit(false)} data-autofocus>{submitting ? t('take.submitting') : t('take.submit')}</Button></>}
      >
        <p className="text-sm">{t('take.confirmSubmit', { answered: answeredCount, total: questions.length })}</p>
        {questions.length - answeredCount > 0 && <p className="mt-3 flex items-center gap-2 rounded-lg bg-warning-soft p-2.5 text-sm text-warning"><AlertTriangle className="h-4 w-4" />{t('take.unansweredWarn', { count: questions.length - answeredCount })}</p>}
        {flaggedCount > 0 && <p className="mt-2 flex items-center gap-2 rounded-lg bg-info-soft p-2.5 text-sm text-info"><Flag className="h-4 w-4" />{t('take.flaggedWarn', { count: flaggedCount })}</p>}
      </Dialog>
    </div>
  );
}
