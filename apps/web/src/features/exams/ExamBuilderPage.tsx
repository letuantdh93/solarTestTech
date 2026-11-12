import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle, ArrowLeft, ArrowRight, Calculator, Check, CheckCircle2, ClipboardList, Grid3x3, Hand, Layers, Plus, RefreshCw, Rocket, Save, Search, Shuffle, Trash2, Wand2, Workflow,
} from 'lucide-react';
import { QUESTION_TYPES, type GenerationConfig, type QuestionType } from '@solar/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useT } from '@/i18n';
import { api, ApiError } from '@/lib/api';
import { useGet } from '@/hooks/useApi';
import { Badge, Button, Card, CardHeader, Checkbox, Field, Input, Select } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/feedback';
import { EmptyState, PageHeader, Pagination, ProgressBar, Table, Td, Th } from '@/components/ui/data';
import { DifficultyBadge } from '@/components/domain';
import { cn } from '@/lib/format';
import type { CategoryNode } from '../categories/CategoriesPage';
import { ExamConfigForm, configToPayload, defaultConfig, type ExamConfig } from './ExamConfigForm';

export interface Blueprint { id: string; name: string; description: string | null; isDefault: boolean; durationMinutes: number; passingScore: number; config: GenerationConfig }
export interface PickedQuestion { id: string; code: string; title: string; type: QuestionType; difficulty: number; isCalculation: boolean; isScenario: boolean; conceptKey: string | null; category: { id: string; code: string; name: string } }
interface GenResult {
  questionIds: string[]; feasible: boolean; difficultyTargets: Record<number, number>; difficultyActual: Record<number, number>;
  allocation: Array<{ categoryId: string; requested: number; available: number; selected: number; byDifficulty: Record<number, number> }>;
  calculationCount: number; scenarioCount: number; shortfalls: Array<{ kind: string; message: string }>; questions: PickedQuestion[];
}

type Matrix = Omit<GenerationConfig, 'seed'>;
const emptyMatrix = (): Matrix => ({ totalQuestions: 30, categoryDistribution: [], difficultyDistribution: { 1: 10, 2: 20, 3: 40, 4: 30 }, questionTypes: [...QUESTION_TYPES], minCalculation: 0, minScenario: 0, maxPerConcept: 1, targetCompetency: '' });

const STEPS = ['exams.stepConfig', 'exams.stepMatrix', 'exams.stepReview'] as const;

export default function ExamBuilderPage() {
  const { t } = useT();
  const nav = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const cats = useGet<CategoryNode[]>(['categories'], '/categories');
  const blueprints = useGet<Blueprint[]>(['blueprints'], '/blueprints');
  const [step, setStep] = useState(0);
  const [cfg, setCfg] = useState<ExamConfig>(defaultConfig);
  const [matrix, setMatrix] = useState<Matrix>(emptyMatrix);
  const [blueprintId, setBlueprintId] = useState('');
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const [result, setResult] = useState<GenResult | null>(null);
  const [selected, setSelected] = useState<PickedQuestion[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const avail = useGet<Record<string, Record<number, number>>>(['availability', matrix.questionTypes.join()], `/exam-builder/availability?types=${matrix.questionTypes.join(',')}`);

  function applyBlueprint(b: Blueprint) {
    setBlueprintId(b.id);
    setMatrix({ ...emptyMatrix(), ...b.config });
    setCfg((c) => ({ ...c, durationMinutes: b.durationMinutes, passingScore: b.passingScore }));
  }
  useEffect(() => {
    const def = blueprints.data?.find((b) => b.isDefault);
    if (def && !blueprintId) applyBlueprint(def);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blueprints.data]);

  const catSum = matrix.categoryDistribution.reduce((a, c) => a + c.count, 0);
  const pctSum = [1, 2, 3, 4].reduce((a, d) => a + Number(matrix.difficultyDistribution[d as 1] ?? 0), 0);
  const countOf = (id: string) => matrix.categoryDistribution.find((c) => c.categoryId === id)?.count ?? 0;
  const setCount = (id: string, n: number) =>
    setMatrix((m) => {
      const others = m.categoryDistribution.filter((c) => c.categoryId !== id);
      const dist = n > 0 ? [...others, { categoryId: id, count: n }] : others;
      return { ...m, categoryDistribution: dist, totalQuestions: dist.reduce((a, c) => a + c.count, 0) };
    });

  async function generate() {
    setBusy('generate');
    try {
      const r = await api<GenResult>('/exam-builder/generate', { body: { ...matrix, seed: Math.floor(Math.random() * 1e9) } });
      setResult(r);
      setSelected(r.questions);
      if (r.feasible) toast.success(t('ui.matrixSatisfied', { count: r.questionIds.length }));
      else toast.warning(t('exams.shortfall'));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t('common.unknownError'));
    } finally {
      setBusy(null);
    }
  }

  async function swap(q: PickedQuestion) {
    const r = await api<{ items: PickedQuestion[] }>(`/exam-builder/questions?categoryId=${q.category.id}&difficulty=${q.difficulty}&pageSize=100`);
    const used = new Set(selected.map((s) => s.id));
    const usedConcepts = new Set(selected.filter((s) => s.id !== q.id).map((s) => s.conceptKey).filter(Boolean));
    const options = r.items.filter((x) => !used.has(x.id) && (!x.conceptKey || !usedConcepts.has(x.conceptKey)));
    if (!options.length) return toast.warning(t('ui.noReplacement'));
    const alt = options[Math.floor(Math.random() * options.length)]!;
    setSelected((s) => s.map((x) => (x.id === q.id ? alt : x)));
  }

  async function save(publish: boolean) {
    setBusy(publish ? 'publish' : 'save');
    setErrors({});
    try {
      const exam = await api<{ id: string }>('/exams', {
        body: { ...configToPayload(cfg), blueprintId: blueprintId || null, questionIds: selected.map((q) => q.id), generationConfig: mode === 'auto' ? matrix : null },
      });
      if (publish) await api(`/exams/${exam.id}/status`, { body: { status: 'PUBLISHED' } });
      toast.success(publish ? t('exams.published') : t('exams.saved'));
      void qc.invalidateQueries({ queryKey: ['exams'] });
      nav(`/de-thi/${exam.id}`);
    } catch (e) {
      if (e instanceof ApiError) {
        setErrors(e.fieldErrors);
        toast.error(e.message);
        if (Object.keys(e.fieldErrors).length) setStep(0);
      }
    } finally {
      setBusy(null);
    }
  }

  async function saveBlueprint() {
    const name = prompt(t('ui.blueprintNamePrompt'), cfg.name ? `${t('exams.blueprint')} – ${cfg.name}` : t('ui.blueprintNameDefault'));
    if (!name) return;
    try {
      await api('/blueprints', { body: { name, config: matrix, durationMinutes: cfg.durationMinutes, passingScore: cfg.passingScore } });
      toast.success(t('exams.blueprintSaved'));
      void qc.invalidateQueries({ queryKey: ['blueprints'] });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t('common.unknownError'));
    }
  }

  const canNext = step === 0 ? cfg.name.trim().length > 0 : step === 1 ? selected.length > 0 : true;

  return (
    <div>
      <PageHeader title={t('exams.builderTitle')} subtitle={t('exams.builderSubtitle')} icon={<Wand2 className="h-5 w-5" />} />

      {/* Stepper */}
      <ol className="mb-6 flex items-center gap-2 sm:gap-4">
        {STEPS.map((s, i) => (
          <li key={s} className="flex flex-1 items-center gap-2 sm:gap-3">
            <button onClick={() => (i < step || canNext ? setStep(i) : undefined)} className="flex items-center gap-2 text-left" aria-current={step === i ? 'step' : undefined}>
              <motion.span animate={{ scale: step === i ? 1.08 : 1 }} className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors', i < step ? 'bg-success text-white' : step === i ? 'bg-primary text-white shadow-glow' : 'bg-surface-2 text-muted')}>
                {i < step ? <Check className="h-4 w-4" /> : i + 1}
              </motion.span>
              <span className={cn('hidden text-sm font-medium sm:block', step === i ? 'text-fg' : 'text-muted')}>{t(s)}</span>
            </button>
            {i < STEPS.length - 1 && <div className="h-0.5 flex-1 overflow-hidden rounded bg-border"><motion.div className="h-full bg-success" animate={{ width: i < step ? '100%' : '0%' }} transition={{ duration: 0.4 }} /></div>}
          </li>
        ))}
      </ol>

      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.22 }}>
          {step === 0 && (
            <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
              <Card className="p-6"><ExamConfigForm value={cfg} onChange={setCfg} errors={errors} /></Card>
              <Card>
                <CardHeader title={t('exams.blueprint')} icon={<Layers className="h-5 w-5" />} />
                <div className="space-y-2 p-4">
                  {blueprints.data?.map((b) => (
                    <button key={b.id} onClick={() => applyBlueprint(b)} className={cn('w-full rounded-lg border p-3 text-left transition-all hover:border-primary/50', blueprintId === b.id ? 'border-primary bg-primary-soft/50 shadow-glow' : 'border-border')}>
                      <p className="flex items-center gap-2 text-sm font-semibold">{blueprintId === b.id && <CheckCircle2 className="h-4 w-4 text-primary" />}{b.name}</p>
                      {b.description && <p className="mt-1 text-xs text-muted">{b.description}</p>}
                      <p className="mt-1 text-xs text-muted">{t('ui.blueprintSummary', { questions: b.config.totalQuestions, minutes: b.durationMinutes, pass: b.passingScore })}</p>
                    </button>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-2">
                <Button variant={mode === 'auto' ? 'primary' : 'secondary'} icon={<Wand2 className="h-4 w-4" />} onClick={() => setMode('auto')}>{t('exams.modeAuto')}</Button>
                <Button variant={mode === 'manual' ? 'primary' : 'secondary'} icon={<Hand className="h-4 w-4" />} onClick={() => setMode('manual')}>{t('exams.modeManual')}</Button>
                <span className="ml-auto text-sm text-muted">{t('exams.selectedQuestions')}: <b className="num text-fg">{selected.length}</b></span>
              </div>
              {mode === 'auto' ? (
                <>
                  <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
                    <Card>
                      <CardHeader title={t('exams.categoryDistribution')} subtitle={`${t('exams.totalQuestions')}: ${catSum}`} icon={<Grid3x3 className="h-5 w-5" />} />
                      <Table>
                        <thead><tr><Th>{t('questions.category')}</Th>{[1, 2, 3, 4].map((d) => <Th key={d} className="hidden text-center 2xl:table-cell">{t(`difficulty.${d}`)}</Th>)}<Th className="text-center">{t('exams.available')}</Th><Th className="w-28 text-center">{t('ui.questionCount')}</Th></tr></thead>
                        <tbody>
                          {cats.data?.map((c) => {
                            const a = avail.data?.[c.id] ?? { 1: 0, 2: 0, 3: 0, 4: 0 };
                            const total = [1, 2, 3, 4].reduce((s, d) => s + (a[d] ?? 0), 0);
                            const n = countOf(c.id);
                            return (
                              <tr key={c.id} className={cn('transition-colors', n > 0 && 'bg-primary-soft/20')}>
                                <Td className="min-w-[220px]">
                                  <span className="font-semibold text-primary">{c.code}.</span> {c.name}
                                  <p className="num text-[11px] text-subtle 2xl:hidden">{[1, 2, 3, 4].map((d) => `${t(`difficulty.${d}`)} ${a[d] ?? 0}`).join(' · ')}</p>
                                </Td>
                                {[1, 2, 3, 4].map((d) => <Td key={d} className="num hidden text-center text-muted 2xl:table-cell">{a[d] ?? 0}</Td>)}
                                <Td className={cn('num text-center font-medium', n > total ? 'text-danger' : 'text-muted')}>{total}</Td>
                                <Td><Input type="number" min={0} max={200} className="h-8 text-center" value={n} onChange={(e) => setCount(c.id, Math.max(0, Number(e.target.value) || 0))} aria-label={t('ui.countFor', { code: c.code })} /></Td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </Table>
                    </Card>
                    <div className="space-y-6">
                      <Card>
                        <CardHeader title={t('exams.difficultyDistribution')} subtitle={pctSum !== 100 ? t('exams.pctMismatch', { sum: pctSum }) : undefined} />
                        <div className="space-y-4 p-5">
                          {[1, 2, 3, 4].map((d) => {
                            const v = Number(matrix.difficultyDistribution[d as 1] ?? 0);
                            return (
                              <div key={d}>
                                <div className="mb-1.5 flex items-center justify-between text-sm"><DifficultyBadge level={d} /><span className="num text-muted">{t('ui.approxQuestions', { count: Math.round((catSum * v) / 100) })}</span></div>
                                <div className="flex items-center gap-3">
                                  <input type="range" min={0} max={100} step={5} value={v} onChange={(e) => setMatrix((m) => ({ ...m, difficultyDistribution: { ...m.difficultyDistribution, [d]: Number(e.target.value) } }))} className="flex-1 accent-[rgb(var(--primary))]" aria-label={t(`difficulty.${d}`)} />
                                  <Input type="number" min={0} max={100} className="h-8 w-16 text-center" value={v} onChange={(e) => setMatrix((m) => ({ ...m, difficultyDistribution: { ...m.difficultyDistribution, [d]: Number(e.target.value) || 0 } }))} />
                                </div>
                              </div>
                            );
                          })}
                          <ProgressBar value={pctSum} tone={pctSum === 100 ? 'success' : 'warning'} label={t('ui.pctTotal')} />
                        </div>
                      </Card>
                      <Card className="space-y-4 p-5">
                        <Field label={t('exams.questionTypes')}>
                          <div className="grid grid-cols-2 gap-2">
                            {QUESTION_TYPES.map((x) => (
                              <Checkbox key={x} checked={matrix.questionTypes.includes(x)} onChange={(v) => setMatrix((m) => ({ ...m, questionTypes: v ? [...m.questionTypes, x] : m.questionTypes.filter((y) => y !== x) }))} label={t(`questionType.${x}`)} />
                            ))}
                          </div>
                        </Field>
                        <div className="grid grid-cols-3 gap-3">
                          <Field label={<span className="flex items-center gap-1"><Calculator className="h-3.5 w-3.5" />{t('ui.minCalc')}</span>}><Input type="number" min={0} value={matrix.minCalculation} onChange={(e) => setMatrix((m) => ({ ...m, minCalculation: Number(e.target.value) || 0 }))} /></Field>
                          <Field label={<span className="flex items-center gap-1"><Workflow className="h-3.5 w-3.5" />{t('ui.minScen')}</span>}><Input type="number" min={0} value={matrix.minScenario} onChange={(e) => setMatrix((m) => ({ ...m, minScenario: Number(e.target.value) || 0 }))} /></Field>
                          <Field label={t('ui.maxConcept')}><Input type="number" min={1} max={10} value={matrix.maxPerConcept} onChange={(e) => setMatrix((m) => ({ ...m, maxPerConcept: Math.max(1, Number(e.target.value) || 1) }))} /></Field>
                        </div>
                        <Field label={t('exams.targetCompetency')}><Input value={matrix.targetCompetency ?? ''} onChange={(e) => setMatrix((m) => ({ ...m, targetCompetency: e.target.value }))} placeholder={t('ui.targetPlaceholder')} /></Field>
                        <div className="flex flex-wrap gap-2">
                          <Button className="flex-1" icon={result ? <RefreshCw className="h-4 w-4" /> : <Shuffle className="h-4 w-4" />} loading={busy === 'generate'} disabled={catSum === 0 || pctSum !== 100 || !matrix.questionTypes.length} onClick={() => void generate()}>
                            {result ? t('exams.regenerate') : t('exams.generate')}
                          </Button>
                          <Button variant="outline" icon={<Save className="h-4 w-4" />} onClick={() => void saveBlueprint()}>{t('exams.saveAsBlueprint')}</Button>
                        </div>
                      </Card>
                    </div>
                  </div>
                  {result && <GenerationReport r={result} cats={cats.data ?? []} />}
                </>
              ) : (
                <ManualPicker selected={selected} onAdd={(q) => setSelected((s) => [...s, q])} />
              )}
              {selected.length > 0 && <SelectedList items={selected} onRemove={(id) => setSelected((s) => s.filter((x) => x.id !== id))} onSwap={(q) => void swap(q)} />}
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
              <SelectedList items={selected} onRemove={(id) => setSelected((s) => s.filter((x) => x.id !== id))} />
              <Card className="h-fit space-y-3 p-5 text-sm">
                <p className="text-lg font-semibold">{cfg.name || '—'}</p>
                <Row k={t('exams.totalQuestions')} v={selected.length} />
                <Row k={t('exams.duration')} v={`${cfg.durationMinutes} ${t('common.minutes')}`} />
                <Row k={t('exams.passingScore')} v={`${cfg.passingScore}%`} />
                <Row k={t('exams.maxAttempts')} v={cfg.maxAttempts} />
                <Row k={t('exams.randomizeQuestions')} v={cfg.randomizeQuestions ? t('common.yes') : t('common.no')} />
                <Row k={t('exams.randomizeOptions')} v={cfg.randomizeOptions ? t('common.yes') : t('common.no')} />
                <Row k={t('exams.resultVisibility')} v={t(`resultVisibility.${cfg.resultVisibility}`)} />
                <Row k={t('exams.explanationVisibility')} v={t(`explanationVisibility.${cfg.explanationVisibility}`)} />
                {result && !result.feasible && <p className="flex gap-2 rounded-lg bg-warning-soft p-3 text-warning"><AlertTriangle className="h-4 w-4 shrink-0" />{t('exams.shortfall')}</p>}
                <div className="flex flex-col gap-2 pt-2">
                  <Button variant="outline" icon={<Save className="h-4 w-4" />} loading={busy === 'save'} onClick={() => void save(false)}>{t('exams.saveDraft')}</Button>
                  <Button icon={<Rocket className="h-4 w-4" />} loading={busy === 'publish'} onClick={() => void save(true)}>{t('exams.publish')}</Button>
                </div>
              </Card>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="mt-6 flex justify-between">
        <Button variant="secondary" icon={<ArrowLeft className="h-4 w-4" />} disabled={step === 0} onClick={() => setStep((s) => s - 1)}>{t('common.back')}</Button>
        {step < 2 && <Button disabled={!canNext} onClick={() => setStep((s) => s + 1)}>{t('common.next')} <ArrowRight className="h-4 w-4" /></Button>}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex justify-between gap-3 border-b border-border/60 pb-2"><span className="text-muted">{k}</span><span className="text-right font-medium">{v}</span></div>;
}

function GenerationReport({ r, cats }: { r: GenResult; cats: CategoryNode[] }) {
  const { t } = useT();
  const name = (id: string) => { const c = cats.find((x) => x.id === id); return c ? `${c.code}. ${c.name}` : id; };
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid gap-6 lg:grid-cols-2">
      <Card className={cn('border-l-4', r.feasible ? 'border-l-success' : 'border-l-warning')}>
        <CardHeader title={t('exams.distributionCheck')} icon={r.feasible ? <CheckCircle2 className="h-5 w-5 text-success" /> : <AlertTriangle className="h-5 w-5 text-warning" />} subtitle={r.feasible ? t('ui.matrixOk') : t('exams.shortfallHint')} />
        <div className="space-y-3 p-5">
          {r.shortfalls.map((s, i) => <p key={i} className="flex gap-2 text-sm text-warning"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{s.message}</p>)}
          <div className="grid grid-cols-4 gap-2 text-center text-sm">
            {[1, 2, 3, 4].map((d) => (
              <div key={d} className={cn('rounded-lg border p-2', r.difficultyActual[d] === r.difficultyTargets[d] ? 'border-success/40 bg-success-soft/40' : 'border-warning/40 bg-warning-soft/40')}>
                <p className="text-xs text-muted">{t(`difficulty.${d}`)}</p>
                <p className="num font-semibold">{r.difficultyActual[d]}/{r.difficultyTargets[d]}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge tone="info" icon={<Calculator className="h-3 w-3" />}>{t('ui.nCalc', { count: r.calculationCount })}</Badge>
            <Badge tone="solar" icon={<Workflow className="h-3 w-3" />}>{t('ui.nScen', { count: r.scenarioCount })}</Badge>
          </div>
        </div>
      </Card>
      <Card>
        <CardHeader title={t('exams.categoryDistribution')} subtitle={`${t('exams.requested')} / ${t('exams.actual')}`} />
        <div className="space-y-2 p-5">
          {r.allocation.map((a) => (
            <div key={a.categoryId}>
              <div className="flex justify-between text-sm"><span className="truncate">{name(a.categoryId)}</span><span className={cn('num font-medium', a.selected < a.requested ? 'text-danger' : 'text-success')}>{a.selected}/{a.requested}</span></div>
              <ProgressBar value={(a.selected / Math.max(1, a.requested)) * 100} tone={a.selected < a.requested ? 'danger' : 'success'} height="h-1.5" />
            </div>
          ))}
        </div>
      </Card>
    </motion.div>
  );
}

export function SelectedList({ items, onRemove, onSwap, readOnly }: { items: PickedQuestion[]; onRemove?: (id: string) => void; onSwap?: (q: PickedQuestion) => void; readOnly?: boolean }) {
  const { t } = useT();
  return (
    <Card>
      <CardHeader title={t('exams.selectedQuestions')} subtitle={`${items.length} ${t('common.questions')}`} icon={<ClipboardList className="h-5 w-5" />} />
      {!items.length ? <EmptyState title={t('common.noData')} /> : (
        <ul className="divide-y divide-border">
          <AnimatePresence initial={false}>
            {items.map((q, i) => (
              <motion.li key={q.id} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8, height: 0 }} className="flex items-center gap-3 px-4 py-2.5">
                <span className="num w-7 text-right text-xs text-subtle">{i + 1}</span>
                <span className="w-8 font-semibold text-primary">{q.category.code}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{q.title}</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted"><span className="font-mono">{q.code}</span><DifficultyBadge level={q.difficulty} compact />{q.isCalculation && <Calculator className="h-3 w-3 text-info" aria-label={t('questions.calcBadge')} />}{q.isScenario && <Workflow className="h-3 w-3 text-solar" aria-label={t('questions.scenarioBadge')} />}</div>
                </div>
                {!readOnly && onSwap && <Button variant="ghost" size="icon" title={t('exams.swap')} aria-label={t('exams.swap')} onClick={() => onSwap(q)}><RefreshCw className="h-4 w-4" /></Button>}
                {!readOnly && onRemove && <Button variant="ghost" size="icon" title={t('exams.removeQuestion')} aria-label={t('exams.removeQuestion')} onClick={() => onRemove(q.id)}><Trash2 className="h-4 w-4" /></Button>}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </Card>
  );
}

export function ManualPicker({ selected, onAdd }: { selected: PickedQuestion[]; onAdd: (q: PickedQuestion) => void }) {
  const { t } = useT();
  const cats = useGet<CategoryNode[]>(['categories'], '/categories');
  const [q, setQ] = useState('');
  const [deb, setDeb] = useState('');
  const [cat, setCat] = useState('');
  const [diff, setDiff] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => { const h = setTimeout(() => { setDeb(q); setPage(1); }, 300); return () => clearTimeout(h); }, [q]);
  const qs = useMemo(() => new URLSearchParams({ page: String(page), pageSize: '15', ...(deb ? { q: deb } : {}), ...(cat ? { categoryId: cat } : {}), ...(diff ? { difficulty: diff } : {}) }), [page, deb, cat, diff]);
  const { data } = useGet<{ items: PickedQuestion[]; total: number; page: number; pages: number }>(['builder-questions', qs.toString()], `/exam-builder/questions?${qs}`, { keepPrevious: true });
  const ids = new Set(selected.map((s) => s.id));
  return (
    <Card>
      <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-4">
        <div className="relative sm:col-span-2"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" /><Input className="pl-9" placeholder={t('common.searchPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select value={cat} onChange={(e) => { setCat(e.target.value); setPage(1); }} aria-label={t('questions.category')}><option value="">{t('questions.category')}</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.code}. {c.name}</option>)}</Select>
        <Select value={diff} onChange={(e) => { setDiff(e.target.value); setPage(1); }} aria-label={t('questions.difficulty')}><option value="">{t('questions.difficulty')}</option>{[1, 2, 3, 4].map((d) => <option key={d} value={d}>{t(`difficulty.${d}`)}</option>)}</Select>
      </div>
      <ul className="divide-y divide-border">
        {data?.items.map((x) => (
          <li key={x.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="w-8 font-semibold text-primary">{x.category.code}</span>
            <div className="min-w-0 flex-1"><p className="truncate text-sm">{x.title}</p><div className="flex items-center gap-2 text-xs text-muted"><span className="font-mono">{x.code}</span><DifficultyBadge level={x.difficulty} compact /><span>{t(`questionType.${x.type}`)}</span></div></div>
            <Button size="sm" variant={ids.has(x.id) ? 'secondary' : 'outline'} disabled={ids.has(x.id)} icon={ids.has(x.id) ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />} onClick={() => onAdd(x)}>{ids.has(x.id) ? t('common.selected') : t('common.add')}</Button>
          </li>
        ))}
      </ul>
      {data && <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />}
    </Card>
  );
}
