import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle, BookMarked, Calculator, CheckCircle2, Copy, Eye, FileEdit, GripVertical, ImagePlus, Loader2, Plus, Save, Send, ShieldCheck, Trash2, XCircle,
} from 'lucide-react';
import { QUESTION_TYPES, type CalcTemplate, type QuestionType } from '@solar/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useT } from '@/i18n';
import { api, ApiError } from '@/lib/api';
import { useGet } from '@/hooks/useApi';
import { Badge, Button, Card, CardHeader, Checkbox, Field, Input, Select, Switch, Textarea } from '@/components/ui/primitives';
import { PageHeader, Skeleton, Tabs } from '@/components/ui/data';
import { useToast } from '@/components/ui/feedback';
import { RichContent } from '@/components/RichContent';
import { cn, fmtNum, parseDecimal } from '@/lib/format';
import type { CategoryNode } from '../categories/CategoriesPage';
import type { QOption, QReference, QualityReport, QuestionDetail, SimilarItem } from './types';

interface Form {
  title: string; content: string; type: QuestionType; categoryId: string; subcategoryId: string;
  difficulty: number; calcComplexity: number; isCalculation: boolean; isScenario: boolean;
  assumptions: string; explanation: string; calcMethod: string; conceptKey: string; tags: string[];
  options: QOption[]; numericAnswer: string; numericUnit: string; numericTolerance: string; toleranceType: 'ABSOLUTE' | 'RELATIVE'; numericDecimals: string;
  calcEnabled: boolean; calcMode: 'template' | 'expression'; templateId: string; expression: string; variables: Array<{ key: string; value: string }>;
  references: QReference[]; changeNote: string;
}

const emptyForm = (): Form => ({
  title: '', content: '', type: 'SINGLE_CHOICE', categoryId: '', subcategoryId: '', difficulty: 2, calcComplexity: 0, isCalculation: false, isScenario: false,
  assumptions: '', explanation: '', calcMethod: '', conceptKey: '', tags: [],
  options: [{ label: '', isCorrect: true }, { label: '', isCorrect: false }, { label: '', isCorrect: false }, { label: '', isCorrect: false }],
  numericAnswer: '', numericUnit: '', numericTolerance: '0.01', toleranceType: 'RELATIVE', numericDecimals: '2',
  calcEnabled: false, calcMode: 'template', templateId: '', expression: '', variables: [], references: [], changeNote: '',
});

function toPayload(f: Form) {
  const calcSpec = f.calcEnabled
    ? {
        ...(f.calcMode === 'template' ? { templateId: f.templateId } : { expression: f.expression }),
        variables: Object.fromEntries(f.variables.filter((v) => v.key.trim()).map((v) => [v.key.trim(), parseDecimal(v.value) ?? NaN])),
      }
    : null;
  const tol = parseDecimal(f.numericTolerance);
  return {
    title: f.title, content: f.content, type: f.type, categoryId: f.categoryId, subcategoryId: f.subcategoryId || null,
    difficulty: f.difficulty, calcComplexity: f.calcComplexity, isCalculation: f.isCalculation, isScenario: f.isScenario,
    assumptions: f.assumptions || null, explanation: f.explanation || null, calcMethod: f.calcMethod || null, conceptKey: f.conceptKey || null, tags: f.tags,
    options: f.type === 'NUMERIC' ? [] : f.options.map((o) => ({ ...o, label: o.label.trim(), numericValue: o.numericValue ?? null, rationale: o.rationale || null })),
    numericAnswer: f.type === 'NUMERIC' ? parseDecimal(f.numericAnswer) : null,
    numericUnit: f.numericUnit || null,
    numericTolerance: f.type === 'NUMERIC' || f.calcEnabled ? tol : null,
    toleranceType: f.type === 'NUMERIC' || f.calcEnabled ? f.toleranceType : null,
    numericDecimals: f.type === 'NUMERIC' ? parseDecimal(f.numericDecimals) : null,
    calcSpec,
    references: f.references.filter((r) => r.standard.trim()),
    changeNote: f.changeNote || undefined,
  };
}

function fromQuestion(q: QuestionDetail['question']): Form {
  const spec = q.calcSpec;
  return {
    ...emptyForm(),
    title: q.title, content: q.content, type: q.type, categoryId: q.categoryId, subcategoryId: q.subcategoryId ?? '', difficulty: q.difficulty,
    calcComplexity: q.calcComplexity, isCalculation: q.isCalculation, isScenario: q.isScenario, assumptions: q.assumptions ?? '', explanation: q.explanation ?? '',
    calcMethod: q.calcMethod ?? '', conceptKey: q.conceptKey ?? '', tags: q.tags,
    options: q.options.map((o) => ({ label: o.label, isCorrect: o.isCorrect, numericValue: o.numericValue, rationale: o.rationale })),
    numericAnswer: q.numericAnswer?.toString() ?? '', numericUnit: q.numericUnit ?? '', numericTolerance: q.numericTolerance?.toString() ?? '0.01',
    toleranceType: q.toleranceType ?? 'RELATIVE', numericDecimals: q.numericDecimals?.toString() ?? '2',
    calcEnabled: !!spec, calcMode: spec?.expression ? 'expression' : 'template', templateId: spec?.templateId ?? '', expression: spec?.expression ?? '',
    variables: spec ? Object.entries(spec.variables).map(([key, value]) => ({ key, value: String(value) })) : [],
    references: q.references,
  };
}

export default function QuestionEditorPage() {
  const { id } = useParams();
  const { t } = useT();
  const nav = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const existing = useGet<QuestionDetail>(['question', id], id ? `/questions/${id}` : null);
  const cats = useGet<CategoryNode[]>(['categories'], '/categories');
  const templates = useGet<CalcTemplate[]>(['calc-templates'], '/questions/calc-templates');
  const [f, setF] = useState<Form>(emptyForm);
  const [loaded, setLoaded] = useState(!id);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<null | 'save' | 'submit'>(null);
  const [check, setCheck] = useState<(QualityReport & { similar: SimilarItem[] }) | null>(null);
  const [checking, setChecking] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (existing.data && !loaded) {
      setF(fromQuestion(existing.data.question));
      setLoaded(true);
    }
  }, [existing.data, loaded]);
  useEffect(() => {
    if (!id && cats.data?.length && !f.categoryId) setF((s) => ({ ...s, categoryId: cats.data![0]!.id }));
  }, [cats.data, id, f.categoryId]);

  // Warn on unsaved changes
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setF((s) => ({ ...s, [k]: v })); setDirty(true); };

  // Live quality check (debounced)
  const payload = useMemo(() => toPayload(f), [f]);
  useEffect(() => {
    if (!loaded || !f.title || f.content.length < 10 || !f.categoryId) return;
    const h = setTimeout(async () => {
      setChecking(true);
      try {
        setCheck(await api('/questions/check', { body: { input: payload, excludeId: id } }));
      } catch {
        setCheck(null);
      } finally {
        setChecking(false);
      }
    }, 700);
    return () => clearTimeout(h);
  }, [payload, loaded, id, f.title, f.content.length, f.categoryId]);

  const category = cats.data?.find((c) => c.id === f.categoryId);
  const template = templates.data?.find((x) => x.id === f.templateId);

  function changeType(type: QuestionType) {
    setF((s) => ({
      ...s,
      type,
      options:
        type === 'TRUE_FALSE' ? [{ label: t('questions.trueLabel'), isCorrect: true }, { label: t('questions.falseLabel'), isCorrect: false }]
        : type === 'NUMERIC' ? []
        : s.options.length >= 3 && s.type !== 'TRUE_FALSE' ? s.options
        : emptyForm().options,
      isCalculation: type === 'NUMERIC' ? true : s.isCalculation,
    }));
    setDirty(true);
  }

  function pickTemplate(tid: string) {
    const tpl = templates.data?.find((x) => x.id === tid);
    setF((s) => ({ ...s, templateId: tid, variables: tpl ? tpl.params.map((p) => ({ key: p.key, value: s.variables.find((v) => v.key === p.key)?.value ?? '' })) : s.variables, numericUnit: s.numericUnit || tpl?.resultUnit || '' }));
    setDirty(true);
  }

  async function uploadImage(file: File) {
    const form = new FormData();
    form.append('file', file);
    try {
      const r = await api<{ id: string; url: string }>('/media', { form });
      const snippet = `\n\n![${file.name.replace(/\.[^.]+$/, '')}](${r.url})\n`;
      const el = contentRef.current;
      const pos = el?.selectionEnd ?? f.content.length;
      set('content', f.content.slice(0, pos) + snippet + f.content.slice(pos));
      toast.success(t('questions.insertIntoContent'));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t('common.unknownError'));
    }
  }

  async function save(submit: boolean) {
    setSaving(submit ? 'submit' : 'save');
    setErrors({});
    try {
      const q = id
        ? await api<{ id: string }>(`/questions/${id}`, { method: 'PUT', body: payload })
        : await api<{ id: string }>('/questions', { body: payload });
      if (submit) await api(`/questions/${q.id}/status`, { body: { status: 'PENDING_REVIEW' } });
      setDirty(false);
      toast.success(submit ? t('questions.statusChanged') : id ? t('questions.updated') : t('questions.created'));
      void qc.invalidateQueries({ queryKey: ['questions'] });
      void qc.invalidateQueries({ queryKey: ['question', q.id] });
      nav(`/cau-hoi/${q.id}`);
    } catch (e) {
      if (e instanceof ApiError) {
        setErrors(e.fieldErrors);
        toast.error(e.code === 'QUALITY' ? e.message : e.message);
      }
    } finally {
      setSaving(null);
    }
  }

  if (!loaded) return <div className="space-y-4"><Skeleton className="h-10 w-80" /><Skeleton className="h-[600px]" /></div>;

  const status = existing.data?.question.status;
  const errorsCount = check?.issues.filter((i) => i.severity === 'error').length ?? 0;
  const warnCount = check?.issues.filter((i) => i.severity === 'warning').length ?? 0;

  return (
    <div>
      <PageHeader
        title={id ? `${t('questions.editQuestion')} · ${existing.data?.question.code}` : t('questions.newQuestion')}
        subtitle={status && (status === 'APPROVED' || status === 'PUBLISHED') ? <span className="flex items-center gap-1 text-warning"><AlertTriangle className="h-4 w-4" />{t('ui.editApprovedWarn')}</span> : t('questions.contentHint')}
        icon={<FileEdit className="h-5 w-5" />}
        actions={
          <>
            <Button variant="secondary" onClick={() => (dirty && !confirm(t('questions.unsavedChanges')) ? undefined : nav(-1))}>{t('common.cancel')}</Button>
            <Button variant="outline" icon={<Save className="h-4 w-4" />} loading={saving === 'save'} onClick={() => void save(false)}>{t('common.save')}</Button>
            <Button icon={<Send className="h-4 w-4" />} loading={saving === 'submit'} disabled={errorsCount > 0} onClick={() => void save(true)}>{t('questions.submitReview')}</Button>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card className="p-5">
            <div className="grid gap-4 md:grid-cols-2">
              <Field className="md:col-span-2" label={t('questions.questionTitle')} error={errors.title} required>
                <Input value={f.title} onChange={(e) => set('title', e.target.value)} invalid={!!errors.title} maxLength={300} />
              </Field>
              <Field label={t('questions.category')} error={errors.categoryId} required>
                <Select value={f.categoryId} onChange={(e) => { set('categoryId', e.target.value); set('subcategoryId', ''); }}>
                  {cats.data?.map((c) => <option key={c.id} value={c.id}>{c.code}. {c.name}</option>)}
                </Select>
              </Field>
              <Field label={t('questions.subcategory')}>
                <Select value={f.subcategoryId} onChange={(e) => set('subcategoryId', e.target.value)}>
                  <option value="">—</option>
                  {category?.children?.map((s) => <option key={s.id} value={s.id}>{s.code} {s.name}</option>)}
                </Select>
              </Field>
              <Field label={t('questions.type')} required>
                <Select value={f.type} onChange={(e) => changeType(e.target.value as QuestionType)}>
                  {QUESTION_TYPES.map((x) => <option key={x} value={x}>{t(`questionType.${x}`)}</option>)}
                </Select>
              </Field>
              <Field label={t('questions.difficulty')} hint={t(`difficultyLong.${f.difficulty}`)} required>
                <div className="grid grid-cols-4 gap-1 rounded-lg border border-border p-1" role="radiogroup">
                  {[1, 2, 3, 4].map((d) => (
                    <button key={d} type="button" role="radio" aria-checked={f.difficulty === d} onClick={() => set('difficulty', d)} className={cn('rounded-md px-2 py-1.5 text-xs font-medium transition-colors', f.difficulty === d ? 'bg-primary text-white shadow-sm' : 'text-muted hover:bg-surface-2')}>
                      {t(`difficulty.${d}`)}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label={t('questions.calcComplexity')}>
                <Select value={f.calcComplexity} onChange={(e) => set('calcComplexity', Number(e.target.value))}>
                  {[0, 1, 2, 3].map((c) => <option key={c} value={c}>{c} – {t(`calcComplexity.${c}`)}</option>)}
                </Select>
              </Field>
              <div className="flex flex-wrap items-end gap-6 pb-2">
                <Switch checked={f.isCalculation} onChange={(v) => set('isCalculation', v)} label={t('questions.isCalculation')} />
                <Switch checked={f.isScenario} onChange={(v) => set('isScenario', v)} label={t('questions.isScenario')} />
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between gap-2 px-5 pt-3">
              <Tabs value={tab} onChange={setTab} tabs={[{ id: 'edit', label: t('questions.editTab'), icon: <FileEdit className="h-4 w-4" /> }, { id: 'preview', label: t('questions.preview'), icon: <Eye className="h-4 w-4" /> }]} className="flex-1 border-0" />
              <Button variant="ghost" size="sm" icon={<ImagePlus className="h-4 w-4" />} onClick={() => fileRef.current?.click()}>{t('questions.uploadImage')}</Button>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void uploadImage(file); e.target.value = ''; }} />
            </div>
            <div className="p-5 pt-3">
              {tab === 'edit' ? (
                <div className="space-y-4">
                  <Field label={t('questions.content')} hint={t('questions.contentHint')} error={errors.content} required>
                    <Textarea ref={contentRef} style={{ minHeight: 220 }} className="font-mono text-[13px]" value={f.content} onChange={(e) => set('content', e.target.value)} invalid={!!errors.content} />
                  </Field>
                  <Field label={t('questions.assumptions')}>
                    <Textarea value={f.assumptions} onChange={(e) => set('assumptions', e.target.value)} />
                  </Field>
                </div>
              ) : (
                <div className="min-h-[200px] rounded-lg border border-border bg-surface-2/30 p-5">
                  <RichContent text={f.content || '—'} />
                  {f.assumptions && <div className="mt-4 rounded-lg border-l-4 border-info bg-info-soft/50 p-3 text-sm"><p className="mb-1 font-semibold text-info">{t('questions.assumptions')}</p><RichContent text={f.assumptions} /></div>}
                  <OptionsPreview f={f} />
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title={f.type === 'NUMERIC' ? t('questions.numericAnswer') : t('questions.options')} subtitle={f.type === 'MULTIPLE_CHOICE' ? t('ui.markAllCorrect') : undefined} />
            <div className="p-5">
              {f.type === 'NUMERIC' ? (
                <div className="grid gap-4 sm:grid-cols-5">
                  <Field label={t('questions.numericAnswer')} required className="sm:col-span-2"><Input inputMode="decimal" value={f.numericAnswer} onChange={(e) => set('numericAnswer', e.target.value)} /></Field>
                  <Field label={t('questions.unit')}><Input value={f.numericUnit} onChange={(e) => set('numericUnit', e.target.value)} /></Field>
                  <Field label={t('questions.decimals')}><Input inputMode="numeric" value={f.numericDecimals} onChange={(e) => set('numericDecimals', e.target.value)} /></Field>
                  <div />
                  <Field label={t('questions.tolerance')} className="sm:col-span-2"><Input inputMode="decimal" value={f.numericTolerance} onChange={(e) => set('numericTolerance', e.target.value)} /></Field>
                  <Field label={t('questions.toleranceType')} className="sm:col-span-3">
                    <Select value={f.toleranceType} onChange={(e) => set('toleranceType', e.target.value as Form['toleranceType'])}>
                      <option value="RELATIVE">{t('questions.toleranceRel')}</option>
                      <option value="ABSOLUTE">{t('questions.toleranceAbs')}</option>
                    </Select>
                  </Field>
                </div>
              ) : (
                <OptionsEditor f={f} setF={(fn) => { setF(fn); setDirty(true); }} showValue={f.calcEnabled} />
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title={t('questions.calcSpec')} subtitle={t('questions.calcSpecHint')} icon={<Calculator className="h-5 w-5" />} action={<Switch checked={f.calcEnabled} onChange={(v) => set('calcEnabled', v)} />} />
            <AnimatePresence initial={false}>
              {f.calcEnabled && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="space-y-4 p-5">
                    <div className="flex gap-2">
                      <Button size="sm" variant={f.calcMode === 'template' ? 'primary' : 'secondary'} onClick={() => set('calcMode', 'template')}>{t('questions.template')}</Button>
                      <Button size="sm" variant={f.calcMode === 'expression' ? 'primary' : 'secondary'} onClick={() => set('calcMode', 'expression')}>{t('questions.customExpression')}</Button>
                    </div>
                    {f.calcMode === 'template' ? (
                      <>
                        <Select value={f.templateId} onChange={(e) => pickTemplate(e.target.value)} aria-label={t('questions.template')}>
                          <option value="">—</option>
                          {templates.data?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                        </Select>
                        {template && <div className="overflow-x-auto rounded-lg bg-surface-2/60 px-4 py-2"><RichContent text={`$$${template.latex}$$`} /></div>}
                      </>
                    ) : (
                      <Field label={t('questions.expression')} hint={t('ui.expressionHint')}>
                        <Input className="font-mono" value={f.expression} onChange={(e) => set('expression', e.target.value)} placeholder="2 * l * i * rho / s / u * 100" />
                      </Field>
                    )}
                    <div>
                      <p className="label">{t('questions.variables')}</p>
                      <div className="space-y-2">
                        {f.variables.map((v, i) => {
                          const p = template?.params.find((x) => x.key === v.key);
                          return (
                            <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                              {f.calcMode === 'template' && p ? <span className="text-sm"><code className="font-mono text-primary">{v.key}</code> <span className="text-muted">{p.label}{p.unit && ` (${p.unit})`}</span></span>
                                : <Input className="font-mono" placeholder={t('ui.variableName')} value={v.key} onChange={(e) => set('variables', f.variables.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))} />}
                              <Input inputMode="decimal" value={v.value} onChange={(e) => set('variables', f.variables.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                              <Button variant="ghost" size="icon" aria-label={t('common.remove')} onClick={() => set('variables', f.variables.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          );
                        })}
                        <Button variant="ghost" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => set('variables', [...f.variables, { key: '', value: '' }])}>{t('questions.addVariable')}</Button>
                      </div>
                    </div>
                    {f.type !== 'NUMERIC' && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label={t('questions.tolerance')}><Input inputMode="decimal" value={f.numericTolerance} onChange={(e) => set('numericTolerance', e.target.value)} /></Field>
                        <Field label={t('questions.toleranceType')}>
                          <Select value={f.toleranceType} onChange={(e) => set('toleranceType', e.target.value as Form['toleranceType'])}>
                            <option value="RELATIVE">{t('questions.toleranceRel')}</option>
                            <option value="ABSOLUTE">{t('questions.toleranceAbs')}</option>
                          </Select>
                        </Field>
                      </div>
                    )}
                    <VerificationBox v={check?.verification} loading={checking} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>

          <Card className="space-y-4 p-5">
            <Field label={t('questions.explanation')}><Textarea style={{ minHeight: 160 }} value={f.explanation} onChange={(e) => set('explanation', e.target.value)} /></Field>
            <Field label={t('questions.calcMethod')}><Textarea value={f.calcMethod} onChange={(e) => set('calcMethod', e.target.value)} /></Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={t('questions.conceptKey')} hint={t('questions.conceptKeyHint')}><Input className="font-mono" value={f.conceptKey} onChange={(e) => set('conceptKey', e.target.value)} placeholder="string-max-voc" /></Field>
              <Field label={t('questions.tags')} hint={t('questions.tagsHint')}>
                <div className="input flex min-h-[40px] flex-wrap items-center gap-1.5 py-1.5">
                  {f.tags.map((tg) => <Badge key={tg} tone="primary">{tg}<button className="ml-0.5" aria-label={t('common.remove')} onClick={() => set('tags', f.tags.filter((x) => x !== tg))}>×</button></Badge>)}
                  <input className="min-w-[100px] flex-1 bg-transparent text-sm outline-none" value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) { e.preventDefault(); if (!f.tags.includes(tagInput.trim().toLowerCase())) set('tags', [...f.tags, tagInput.trim().toLowerCase()]); setTagInput(''); }
                  }} />
                </div>
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader title={t('questions.references')} icon={<BookMarked className="h-5 w-5" />} subtitle={t('questions.refWarning')} />
            <div className="space-y-3 p-5">
              {f.references.map((r, i) => (
                <div key={i} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-6">
                  <Input className="sm:col-span-2" placeholder={t('questions.standard')} value={r.standard} onChange={(e) => set('references', f.references.map((x, j) => (j === i ? { ...x, standard: e.target.value } : x)))} />
                  <Input placeholder={t('questions.edition')} value={r.edition ?? ''} onChange={(e) => set('references', f.references.map((x, j) => (j === i ? { ...x, edition: e.target.value } : x)))} />
                  <Input placeholder={t('questions.jurisdiction')} value={r.jurisdiction ?? ''} onChange={(e) => set('references', f.references.map((x, j) => (j === i ? { ...x, jurisdiction: e.target.value } : x)))} />
                  <Input placeholder={t('questions.clause')} value={r.clause ?? ''} onChange={(e) => set('references', f.references.map((x, j) => (j === i ? { ...x, clause: e.target.value } : x)))} />
                  <div className="flex items-center justify-between gap-2">
                    <Checkbox checked={!!r.verified} onChange={(v) => set('references', f.references.map((x, j) => (j === i ? { ...x, verified: v } : x)))} label={<span className="text-xs">{t('questions.verified')}</span>} />
                    <Button variant="ghost" size="icon" aria-label={t('common.remove')} onClick={() => set('references', f.references.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                  <Input className="sm:col-span-6" placeholder={t('questions.refNote')} value={r.note ?? ''} onChange={(e) => set('references', f.references.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))} />
                </div>
              ))}
              <Button variant="ghost" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => set('references', [...f.references, { standard: '', verified: false }])}>{t('questions.addReference')}</Button>
            </div>
          </Card>
          {id && (
            <Card className="p-5"><Field label={t('questions.changeNote')}><Input value={f.changeNote} onChange={(e) => set('changeNote', e.target.value)} /></Field></Card>
          )}
        </div>

        {/* Quality side panel */}
        <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start">
          <Card>
            <CardHeader title={t('questions.quality')} icon={<ShieldCheck className="h-5 w-5" />} action={checking ? <Loader2 className="h-4 w-4 animate-spin text-muted" /> : check && <div className="flex gap-1"><Badge tone={errorsCount ? 'danger' : 'success'}>{errorsCount} {t('questions.errors')}</Badge><Badge tone={warnCount ? 'warning' : 'neutral'}>{warnCount} {t('questions.warnings')}</Badge></div>} />
            <div className="max-h-[40vh] space-y-2 overflow-y-auto p-4">
              {!check ? <p className="text-sm text-muted">{t('common.loading')}</p> : check.issues.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-success"><CheckCircle2 className="h-4 w-4" />{t('questions.qualityOk')}</p>
              ) : check.issues.map((i, k) => (
                <motion.p key={i.code + k} initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} className={cn('flex gap-2 text-sm', i.severity === 'error' ? 'text-danger' : 'text-warning')}>
                  {i.severity === 'error' ? <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
                  {i.message}
                </motion.p>
              ))}
            </div>
          </Card>
          <Card>
            <CardHeader title={t('questions.similar')} subtitle={t('questions.similarHint')} icon={<Copy className="h-5 w-5" />} />
            <div className="space-y-2 p-4">
              {!check?.similar.length ? <p className="text-sm text-muted">{t('questions.noSimilar')}</p> : check.similar.map((s) => (
                <a key={s.id} href={`/cau-hoi/${s.id}`} target="_blank" rel="noreferrer" className={cn('block rounded-lg border p-2.5 text-sm transition-colors hover:bg-surface-2', s.isDuplicate ? 'border-danger/40 bg-danger-soft/40' : 'border-border')}>
                  <div className="flex items-center justify-between gap-2"><span className="font-mono text-xs text-muted">{s.code}</span><Badge tone={s.isDuplicate ? 'danger' : 'warning'}>{Math.round(s.score * 100)}%</Badge></div>
                  <p className="mt-1 line-clamp-2">{s.title}</p>
                </a>
              ))}
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function VerificationBox({ v, loading }: { v?: QualityReport['verification']; loading: boolean }) {
  const { t } = useT();
  if (loading && !v) return <p className="flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" />{t('common.loading')}</p>;
  if (!v || v.ok === null) return <p className="text-sm text-muted">{v?.message ?? t('ai.verificationNone')}</p>;
  return (
    <motion.div key={String(v.ok)} initial={{ scale: 0.98, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={cn('rounded-lg border p-3 text-sm', v.ok ? 'border-success/30 bg-success-soft text-success' : 'border-danger/30 bg-danger-soft text-danger')}>
      <p className="flex items-center gap-2 font-semibold">{v.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}{v.ok ? t('questions.verifyOk') : t('questions.verifyFail')}</p>
      <p className="num mt-1 text-fg">{t('questions.computed')}: <b>{v.computed != null ? fmtNum(v.computed, 4) : '—'}</b> · {t('questions.declared')}: <b>{v.expected != null ? fmtNum(v.expected, 4) : '—'}</b></p>
      {v.message && <p className="mt-1 text-xs">{v.message}</p>}
    </motion.div>
  );
}

function OptionsEditor({ f, setF, showValue }: { f: Form; setF: (fn: (s: Form) => Form) => void; showValue: boolean }) {
  const { t } = useT();
  const multi = f.type === 'MULTIPLE_CHOICE';
  const tf = f.type === 'TRUE_FALSE';
  const toggle = (i: number) =>
    setF((s) => ({ ...s, options: s.options.map((o, j) => (multi ? (j === i ? { ...o, isCorrect: !o.isCorrect } : o) : { ...o, isCorrect: j === i })) }));
  const upd = (i: number, patch: Partial<QOption>) => setF((s) => ({ ...s, options: s.options.map((o, j) => (j === i ? { ...o, ...patch } : o)) }));
  return (
    <div className="space-y-2">
      {f.options.map((o, i) => (
        <motion.div layout key={i} className={cn('flex items-start gap-2 rounded-lg border p-2 transition-colors', o.isCorrect ? 'border-success/50 bg-success-soft/40' : 'border-border')}>
          <GripVertical className="mt-2.5 h-4 w-4 shrink-0 text-subtle" aria-hidden />
          <span className="mt-2 w-5 shrink-0 text-center text-sm font-bold text-muted">{String.fromCharCode(65 + i)}</span>
          <button type="button" onClick={() => toggle(i)} aria-pressed={o.isCorrect} title={t('questions.markCorrect')} className={cn('mt-1 flex h-7 w-7 shrink-0 items-center justify-center border-2 transition-all', multi ? 'rounded-md' : 'rounded-full', o.isCorrect ? 'border-success bg-success text-white' : 'border-border hover:border-success')}>
            {o.isCorrect && <CheckCircle2 className="h-4 w-4" />}
          </button>
          <div className="grid flex-1 gap-2">
            <Input value={o.label} disabled={tf} onChange={(e) => upd(i, { label: e.target.value })} placeholder={`${t('questions.options')} ${String.fromCharCode(65 + i)}`} />
            <div className={cn('grid gap-2', showValue && 'sm:grid-cols-[160px_1fr]')}>
              {showValue && <Input inputMode="decimal" placeholder={t('questions.optionValue')} value={o.numericValue ?? ''} onChange={(e) => upd(i, { numericValue: parseDecimal(e.target.value) })} />}
              <Input placeholder={t('questions.rationale')} value={o.rationale ?? ''} onChange={(e) => upd(i, { rationale: e.target.value })} className="text-xs" />
            </div>
          </div>
          {!tf && f.options.length > 2 && (
            <Button variant="ghost" size="icon" aria-label={t('common.remove')} onClick={() => setF((s) => ({ ...s, options: s.options.filter((_, j) => j !== i) }))}><Trash2 className="h-4 w-4" /></Button>
          )}
        </motion.div>
      ))}
      {!tf && f.options.length < 8 && <Button variant="ghost" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setF((s) => ({ ...s, options: [...s.options, { label: '', isCorrect: false }] }))}>{t('questions.addOption')}</Button>}
    </div>
  );
}

function OptionsPreview({ f }: { f: Form }) {
  const { t } = useT();
  if (f.type === 'NUMERIC') return <p className="mt-4 text-sm text-muted">{t('questions.numericAnswer')}: <b className="num text-fg">{f.numericAnswer || '—'} {f.numericUnit}</b></p>;
  return (
    <ul className="mt-4 space-y-2">
      {f.options.map((o, i) => (
        <li key={i} className={cn('flex gap-3 rounded-lg border p-3 text-sm', o.isCorrect ? 'border-success/50 bg-success-soft/40' : 'border-border bg-surface')}>
          <span className="font-bold text-muted">{String.fromCharCode(65 + i)}.</span>
          <RichContent text={o.label || '—'} className="flex-1 [&_p]:my-0" />
          {o.isCorrect && <CheckCircle2 className="h-4 w-4 text-success" />}
        </li>
      ))}
    </ul>
  );
}
