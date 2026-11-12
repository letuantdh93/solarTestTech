import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Bot, CheckCircle2, ClipboardCheck, FileText, History, Lightbulb, ListPlus, Loader2, Search, ShieldCheck, Sparkles, Wand2, XCircle } from 'lucide-react';
import { QUESTION_TYPES, type QualityIssue, type CalcVerification } from '@solar/shared';
import { useT } from '@/i18n';
import { api, ApiError } from '@/lib/api';
import { useGet } from '@/hooks/useApi';
import { Badge, Button, Card, CardHeader, Field, Input, Select, Switch, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/feedback';
import { EmptyState, PageHeader, Pagination, Table, Tabs, Td, Th } from '@/components/ui/data';
import { DifficultyBadge } from '@/components/domain';
import { RichContent } from '@/components/RichContent';
import { cn, fmtDateTime, fmtNum } from '@/lib/format';
import type { CategoryNode } from '../categories/CategoriesPage';

interface GenResult { id?: string; code?: string; title: string; saved: boolean; errors?: string[]; verification?: CalcVerification; issues?: QualityIssue[] }
interface Status { enabled: boolean; configured: boolean; provider: string; model: string }

export default function AiAssistantPage() {
  const { t } = useT();
  const status = useGet<Status>(['ai-status'], '/ai/status');
  const [tab, setTab] = useState<'generate' | 'document' | 'review' | 'jobs'>('generate');
  const unavailable = status.data && (!status.data.enabled || !status.data.configured);
  return (
    <div>
      <PageHeader title={t('ai.title')} subtitle={t('ai.subtitle')} icon={<Bot className="h-5 w-5" />}
        actions={status.data && <Badge tone={unavailable ? 'warning' : 'success'} icon={unavailable ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}>{status.data.provider} · {status.data.model}</Badge>} />
      {unavailable && (
        <div className="mb-5 flex gap-3 rounded-xl border border-warning/30 bg-warning-soft p-4 text-sm text-warning">
          <AlertTriangle className="h-5 w-5 shrink-0" />{!status.data!.enabled ? t('ai.disabled') : t('ai.notConfigured')}
        </div>
      )}
      <div className="mb-5 flex gap-3 rounded-xl border border-info/30 bg-info-soft/60 p-4 text-sm text-info"><ShieldCheck className="h-5 w-5 shrink-0" />{t('ai.disclaimer')}</div>
      <Tabs className="mb-5" value={tab} onChange={setTab} tabs={[
        { id: 'generate', label: t('ai.tabGenerate'), icon: <Wand2 className="h-4 w-4" /> },
        { id: 'document', label: t('ai.tabDocument'), icon: <FileText className="h-4 w-4" /> },
        { id: 'review', label: t('ai.tabReview'), icon: <ClipboardCheck className="h-4 w-4" /> },
        { id: 'jobs', label: t('ai.tabJobs'), icon: <History className="h-4 w-4" /> },
      ]} />
      {tab === 'generate' && <GenerateTab disabled={!!unavailable} />}
      {tab === 'document' && <DocumentTab disabled={!!unavailable} />}
      {tab === 'review' && <ReviewTab disabled={!!unavailable} />}
      {tab === 'jobs' && <JobsTab />}
    </div>
  );
}

function useCats() {
  return useGet<CategoryNode[]>(['categories'], '/categories');
}

function Running() {
  const { t } = useT();
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary-soft/40 p-4 text-sm text-primary">
      <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}><Sparkles className="h-5 w-5" /></motion.span>
      {t('ai.running')}
    </motion.div>
  );
}

function ResultsList({ results }: { results: GenResult[] }) {
  const { t } = useT();
  return (
    <Card>
      <CardHeader title={t('ai.draftsCreated', { count: results.filter((r) => r.saved).length })} icon={<ListPlus className="h-5 w-5" />} />
      <ul className="divide-y divide-border">
        {results.map((r, i) => {
          const errs = r.issues?.filter((x) => x.severity === 'error') ?? [];
          return (
            <motion.li key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} className="space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                {r.code && <span className="font-mono text-xs text-muted">{r.code}</span>}
                <p className="flex-1 font-medium">{r.title}</p>
                {r.saved && r.id && <Link to={`/cau-hoi/${r.id}/sua`} className="text-sm font-medium text-primary hover:underline">{t('ai.openDraft')} →</Link>}
              </div>
              {!r.saved && r.errors?.map((e, k) => <p key={k} className="flex gap-2 text-sm text-danger"><XCircle className="mt-0.5 h-4 w-4 shrink-0" />{e}</p>)}
              {r.verification && (
                <p className={cn('flex items-center gap-2 text-sm', r.verification.ok === true ? 'text-success' : r.verification.ok === false ? 'text-danger' : 'text-muted')}>
                  {r.verification.ok === true ? <CheckCircle2 className="h-4 w-4" /> : r.verification.ok === false ? <XCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                  {t('ai.verification')}: {r.verification.ok === true ? t('ai.verificationOk') : r.verification.ok === false ? t('ai.verificationFail') : t('ai.verificationNone')}
                  {r.verification.computed != null && <span className="num text-xs text-muted">({fmtNum(r.verification.computed, 4)} / {fmtNum(r.verification.expected, 4)})</span>}
                </p>
              )}
              {errs.map((x, k) => <p key={k} className="flex gap-2 text-xs text-danger"><XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{x.message}</p>)}
            </motion.li>
          );
        })}
      </ul>
    </Card>
  );
}

function GenerateTab({ disabled }: { disabled: boolean }) {
  const { t } = useT();
  const toast = useToast();
  const cats = useCats();
  const [f, setF] = useState({ categoryId: '', subcategoryId: '', difficulty: 3, type: 'SINGLE_CHOICE', count: 2, topic: '', requireCalculation: true, requireScenario: false });
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<GenResult[] | null>(null);
  useEffect(() => { if (cats.data?.length && !f.categoryId) setF((s) => ({ ...s, categoryId: cats.data![0]!.id })); }, [cats.data, f.categoryId]);
  const cat = cats.data?.find((c) => c.id === f.categoryId);
  async function run() {
    setBusy(true);
    setResults(null);
    try {
      const r = await api<{ results: GenResult[] }>('/ai/generate', { body: { ...f, subcategoryId: f.subcategoryId || null, topic: f.topic || undefined } });
      setResults(r.results);
      toast.success(t('ai.draftsCreated', { count: r.results.filter((x) => x.saved).length }));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t('common.unknownError'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <Card className="h-fit space-y-4 p-5">
        <Field label={t('questions.category')}><Select value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value, subcategoryId: '' })}>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.code}. {c.name}</option>)}</Select></Field>
        <Field label={t('questions.subcategory')}><Select value={f.subcategoryId} onChange={(e) => setF({ ...f, subcategoryId: e.target.value })}><option value="">—</option>{cat?.children?.map((s) => <option key={s.id} value={s.id}>{s.code} {s.name}</option>)}</Select></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('questions.difficulty')}><Select value={f.difficulty} onChange={(e) => setF({ ...f, difficulty: Number(e.target.value) })}>{[1, 2, 3, 4].map((d) => <option key={d} value={d}>{t(`difficulty.${d}`)}</option>)}</Select></Field>
          <Field label={t('ai.count')}><Input type="number" min={1} max={5} value={f.count} onChange={(e) => setF({ ...f, count: Math.min(5, Math.max(1, Number(e.target.value) || 1)) })} /></Field>
        </div>
        <Field label={t('questions.type')}><Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{QUESTION_TYPES.map((x) => <option key={x} value={x}>{t(`questionType.${x}`)}</option>)}</Select></Field>
        <Field label={t('ai.topic')}><Input value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} placeholder={t('ui.topicPlaceholder')} /></Field>
        <Switch checked={f.requireCalculation} onChange={(v) => setF({ ...f, requireCalculation: v })} label={t('questions.isCalculation')} />
        <Switch checked={f.requireScenario} onChange={(v) => setF({ ...f, requireScenario: v })} label={t('questions.isScenario')} />
        <Button className="w-full" icon={busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} disabled={disabled || busy || !f.categoryId} onClick={() => void run()}>{t('ai.run')}</Button>
      </Card>
      <div className="space-y-4">
        <AnimatePresence>{busy && <Running />}</AnimatePresence>
        {results ? <ResultsList results={results} /> : !busy && <Card><EmptyState icon={<Bot className="h-7 w-7" />} title={t('ai.tabGenerate')} description={t('ai.disclaimer')} /></Card>}
      </div>
    </div>
  );
}

function DocumentTab({ disabled }: { disabled: boolean }) {
  const { t } = useT();
  const toast = useToast();
  const cats = useCats();
  const [f, setF] = useState({ categoryId: '', count: 2, difficulty: 2, text: '' });
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<GenResult[] | null>(null);
  useEffect(() => { if (cats.data?.length && !f.categoryId) setF((s) => ({ ...s, categoryId: cats.data![0]!.id })); }, [cats.data, f.categoryId]);
  async function run() {
    setBusy(true);
    try {
      const r = await api<{ results: GenResult[] }>('/ai/document', { body: f });
      setResults(r.results);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t('common.unknownError'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <Card className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t('questions.category')}><Select value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.code}. {c.name}</option>)}</Select></Field>
          <Field label={t('questions.difficulty')}><Select value={f.difficulty} onChange={(e) => setF({ ...f, difficulty: Number(e.target.value) })}>{[1, 2, 3, 4].map((d) => <option key={d} value={d}>{t(`difficulty.${d}`)}</option>)}</Select></Field>
          <Field label={t('ai.count')}><Input type="number" min={1} max={5} value={f.count} onChange={(e) => setF({ ...f, count: Math.min(5, Math.max(1, Number(e.target.value) || 1)) })} /></Field>
        </div>
        <Field label={t('ai.documentText')} hint={`${t('ai.documentHint')} (${f.text.length}/30000)`}><Textarea style={{ minHeight: 240 }} maxLength={30000} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} /></Field>
        <div className="flex justify-end"><Button icon={busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} disabled={disabled || busy || f.text.length < 50} onClick={() => void run()}>{t('ai.run')}</Button></div>
      </Card>
      <AnimatePresence>{busy && <Running />}</AnimatePresence>
      {results && <ResultsList results={results} />}
    </div>
  );
}

interface ReviewRes {
  review: { technicalAccuracy: string; ambiguity: string; answerKeyAssessment: string; issues: Array<{ severity: string; message: string }>; suggestions: string[]; suggestedDifficulty: number; difficultyRationale: string; distractorQuality: string; standardsConcerns: string[]; independentCalculation: { performed: boolean; result: number | null; note: string } };
  systemVerification: CalcVerification;
  aiCalculation: { value: number | null; error?: string };
}

function ReviewTab({ disabled }: { disabled: boolean }) {
  const { t } = useT();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [deb, setDeb] = useState('');
  const [picked, setPicked] = useState<{ id: string; code: string; title: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewRes | null>(null);
  const [extra, setExtra] = useState<{ kind: string; data: unknown } | null>(null);
  useEffect(() => { const h = setTimeout(() => setDeb(q), 300); return () => clearTimeout(h); }, [q]);
  const list = useGet<{ items: Array<{ id: string; code: string; title: string; difficulty: number }> }>(['ai-pick', deb], `/questions?pageSize=8${deb ? `&q=${encodeURIComponent(deb)}` : ''}`);
  async function act(kind: 'review' | 'distractors' | 'explanation' | 'variants') {
    if (!picked) return;
    setBusy(kind);
    try {
      const r = await api<unknown>(`/ai/questions/${picked.id}/${kind}`, { body: kind === 'variants' ? { count: 1 } : {} });
      if (kind === 'review') setReview(r as ReviewRes);
      else setExtra({ kind, data: r });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t('common.unknownError'));
    } finally {
      setBusy(null);
    }
  }
  const acc = { CORRECT: 'success', MINOR_ISSUES: 'warning', MAJOR_ISSUES: 'danger' } as const;
  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <Card className="h-fit">
        <div className="border-b border-border p-3"><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" /><Input className="pl-9" placeholder={t('ai.pickQuestion')} value={q} onChange={(e) => setQ(e.target.value)} /></div></div>
        <ul className="divide-y divide-border">
          {list.data?.items.map((x) => (
            <li key={x.id}><button onClick={() => { setPicked(x); setReview(null); setExtra(null); }} className={cn('w-full px-4 py-2.5 text-left text-sm transition-colors hover:bg-surface-2', picked?.id === x.id && 'bg-primary-soft/50')}>
              <span className="font-mono text-xs text-muted">{x.code}</span><span className="ml-2"><DifficultyBadge level={x.difficulty} compact /></span>
              <p className="truncate">{x.title}</p>
            </button></li>
          ))}
        </ul>
      </Card>
      <div className="space-y-4">
        {!picked ? <Card><EmptyState icon={<ClipboardCheck className="h-7 w-7" />} title={t('ai.pickQuestion')} /></Card> : (
          <>
            <Card className="p-4">
              <p className="font-mono text-xs text-muted">{picked.code}</p>
              <p className="font-semibold">{picked.title}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(['review', 'distractors', 'explanation', 'variants'] as const).map((k) => (
                  <Button key={k} size="sm" variant={k === 'review' ? 'primary' : 'outline'} disabled={disabled || !!busy} loading={busy === k} onClick={() => void act(k)}>{t(`ai.actions.${k}`)}</Button>
                ))}
              </div>
            </Card>
            <AnimatePresence>{busy && <Running />}</AnimatePresence>
            {review && (
              <Card>
                <CardHeader title={t('ai.reviewResult')} icon={<ShieldCheck className="h-5 w-5" />} action={<Badge tone={acc[review.review.technicalAccuracy as keyof typeof acc] ?? 'neutral'}>{review.review.technicalAccuracy}</Badge>} />
                <div className="space-y-4 p-5 text-sm">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg bg-surface-2/60 p-3"><p className="text-xs text-muted">{t('ai.ambiguity')}</p><p className="font-semibold">{review.review.ambiguity}</p></div>
                    <div className="rounded-lg bg-surface-2/60 p-3"><p className="text-xs text-muted">{t('ai.suggestedDifficulty')}</p><DifficultyBadge level={review.review.suggestedDifficulty} /></div>
                    <div className={cn('rounded-lg p-3', review.systemVerification.ok ? 'bg-success-soft' : review.systemVerification.ok === false ? 'bg-danger-soft' : 'bg-surface-2/60')}>
                      <p className="text-xs text-muted">{t('ai.verification')}</p>
                      <p className="num font-semibold">HT: {fmtNum(review.systemVerification.computed, 4)} · AI: {fmtNum(review.aiCalculation.value, 4)}</p>
                    </div>
                  </div>
                  <p><b>{t('ui.answerKey')}</b> {review.review.answerKeyAssessment}</p>
                  <p className="text-muted">{review.review.difficultyRationale}</p>
                  {review.review.issues.length > 0 && <div><p className="mb-1 font-semibold">{t('ai.issues')}</p>{review.review.issues.map((i, k) => <p key={k} className={cn('flex gap-2', i.severity === 'error' ? 'text-danger' : i.severity === 'warning' ? 'text-warning' : 'text-info')}><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{i.message}</p>)}</div>}
                  {review.review.standardsConcerns.length > 0 && <div className="rounded-lg border border-warning/30 bg-warning-soft/50 p-3">{review.review.standardsConcerns.map((s, k) => <p key={k}>• {s}</p>)}</div>}
                  {review.review.suggestions.length > 0 && <div><p className="mb-1 flex items-center gap-1 font-semibold"><Lightbulb className="h-4 w-4 text-solar" />{t('ai.suggestions')}</p><ul className="list-disc pl-5">{review.review.suggestions.map((s, k) => <li key={k}>{s}</li>)}</ul></div>}
                </div>
              </Card>
            )}
            {extra && (
              <Card className="p-5 text-sm">
                <p className="mb-2 font-semibold">{t(`ai.actions.${extra.kind}`)}</p>
                {extra.kind === 'distractors' && (extra.data as { distractors: Array<{ label: string; misconception: string }> }).distractors.map((d, k) => <p key={k} className="mb-1">• <b>{d.label}</b> – <span className="text-muted">{d.misconception}</span></p>)}
                {extra.kind === 'explanation' && <RichContent text={(extra.data as { explanation: string }).explanation} />}
                {extra.kind === 'variants' && <ResultsList results={(extra.data as { results: GenResult[] }).results} />}
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function JobsTab() {
  const { t } = useT();
  const [page, setPage] = useState(1);
  const { data } = useGet<{ items: Array<{ id: string; kind: string; status: string; model: string | null; error: string | null; inputTokens: number | null; outputTokens: number | null; createdAt: string; createdQuestionIds: string[]; user: { fullName: string } }>; total: number; page: number; pages: number }>(['ai-jobs', page], `/ai/jobs?page=${page}`, { keepPrevious: true });
  if (!data?.items.length) return <Card><EmptyState title={t('common.noData')} /></Card>;
  const tone = { SUCCEEDED: 'success', FAILED: 'danger', RUNNING: 'info', PENDING: 'neutral' } as const;
  return (
    <Card>
      <Table>
        <thead><tr><Th>{t('settings.time')}</Th><Th>{t('settings.action')}</Th><Th>{t('common.status')}</Th><Th className="hidden md:table-cell">{t('ai.model')}</Th><Th className="hidden md:table-cell text-right">{t('ai.tokens')}</Th><Th className="hidden lg:table-cell">{t('settings.actor')}</Th></tr></thead>
        <tbody>
          {data.items.map((j) => (
            <tr key={j.id}>
              <Td className="text-xs text-muted">{fmtDateTime(j.createdAt)}</Td>
              <Td>{t(`ai.jobKind.${j.kind}`)}{j.createdQuestionIds.length > 0 && <span className="ml-1 text-xs text-muted">({t('ui.nQuestions', { count: j.createdQuestionIds.length })})</span>}{j.error && <p className="text-xs text-danger">{j.error}</p>}</Td>
              <Td><Badge tone={tone[j.status as keyof typeof tone] ?? 'neutral'}>{t(`ai.jobStatus.${j.status}`)}</Badge></Td>
              <Td className="hidden font-mono text-xs md:table-cell">{j.model}</Td>
              <Td className="num hidden text-right text-xs md:table-cell">{j.inputTokens ?? '—'} / {j.outputTokens ?? '—'}</Td>
              <Td className="hidden text-sm lg:table-cell">{j.user.fullName}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
    </Card>
  );
}
