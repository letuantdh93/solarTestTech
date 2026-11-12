import { useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Archive, ArchiveRestore, BookMarked, Bot, Calculator, CheckCircle2, Copy, FileEdit, History, Lightbulb, ListChecks, Pencil, Rocket, RotateCcw, Send, ShieldCheck, Trash2, Undo2, Workflow, XCircle, AlertTriangle,
} from 'lucide-react';
import type { QuestionStatus } from '@solar/shared';
import { useT } from '@/i18n';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction, useGet } from '@/hooks/useApi';
import { Badge, Button, Card, CardHeader, Field, Textarea } from '@/components/ui/primitives';
import { Dialog, useConfirm } from '@/components/ui/feedback';
import { Skeleton } from '@/components/ui/data';
import { DifficultyBadge, QuestionStatusBadge } from '@/components/domain';
import { RichContent } from '@/components/RichContent';
import { cn, fmtDateTime, fmtNum } from '@/lib/format';
import type { QuestionDetail } from './types';

export function QuestionPreview({ q, showAnswers = true }: { q: QuestionDetail['question']; showAnswers?: boolean }) {
  const { t } = useT();
  return (
    <div className="space-y-4">
      <RichContent text={q.content} />
      {q.assumptions && (
        <div className="rounded-lg border-l-4 border-info bg-info-soft/50 p-3 text-sm">
          <p className="mb-1 font-semibold text-info">{t('questions.assumptions')}</p>
          <RichContent text={q.assumptions} />
        </div>
      )}
      {q.type === 'NUMERIC' ? (
        showAnswers && (
          <div className="rounded-lg border border-success/40 bg-success-soft/40 p-3 text-sm">
            {t('questions.numericAnswer')}: <b className="num">{fmtNum(q.numericAnswer, q.numericDecimals ?? undefined)} {q.numericUnit}</b>
            <span className="ml-2 text-muted">(± {q.toleranceType === 'RELATIVE' ? `${fmtNum((q.numericTolerance ?? 0) * 100)} %` : `${fmtNum(q.numericTolerance)} ${q.numericUnit ?? ''}`})</span>
          </div>
        )
      ) : (
        <ul className="space-y-2">
          {q.options.map((o, i) => (
            <li key={i} className={cn('rounded-lg border p-3 text-sm', showAnswers && o.isCorrect ? 'border-success/50 bg-success-soft/40' : 'border-border')}>
              <div className="flex gap-3">
                <span className="font-bold text-muted">{String.fromCharCode(65 + i)}.</span>
                <RichContent text={o.label} className="flex-1 [&_p]:my-0" />
                {showAnswers && (o.isCorrect ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-label={t('questions.correct')} /> : null)}
              </div>
              {showAnswers && o.rationale && <p className="ml-6 mt-1 text-xs text-muted">↳ {o.rationale}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function QuestionDetailPage() {
  const { id } = useParams();
  const { t } = useT();
  const nav = useNavigate();
  const { me, can } = useAuth();
  const confirm = useConfirm();
  const { data, isLoading } = useGet<QuestionDetail>(['question', id], `/questions/${id}`);
  const [reject, setReject] = useState(false);
  const [comment, setComment] = useState('');
  const inv = [['question', id], ['questions'], ['review-queue']];
  const status = useAction((v: { status: QuestionStatus; comment?: string }) => api(`/questions/${id}/status`, { body: v }), { success: t('questions.statusChanged'), invalidate: inv, onSuccess: () => { setReject(false); setComment(''); } });
  const dup = useAction(() => api<{ id: string }>(`/questions/${id}/duplicate`, { method: 'POST' }), { success: t('questions.duplicated'), invalidate: [['questions']], onSuccess: (r) => nav(`/cau-hoi/${r.id}/sua`) });
  const del = useAction(() => api(`/questions/${id}`, { method: 'DELETE' }), { success: t('questions.deleted'), invalidate: [['questions']], onSuccess: () => nav('/cau-hoi') });
  const restore = useAction((v: number) => api(`/questions/${id}/revisions/${v}/restore`, { method: 'POST' }), { success: t('questions.updated'), invalidate: inv });

  if (isLoading || !data) return <div className="space-y-4"><Skeleton className="h-10 w-96" /><Skeleton className="h-[500px]" /></div>;
  const q = data.question;
  const isOwner = q.author.id === me?.id;
  const reviewer = can('questions.review');
  const canEdit = can('questions.edit_all') || (isOwner && q.status === 'DRAFT');
  const actions: ReactNode[] = [];
  if (canEdit) actions.push(<Button key="e" variant="outline" icon={<Pencil className="h-4 w-4" />} onClick={() => nav(`/cau-hoi/${id}/sua`)}>{t('common.edit')}</Button>);
  if (can('questions.create')) actions.push(<Button key="d" variant="outline" icon={<Copy className="h-4 w-4" />} loading={dup.isPending} onClick={() => dup.mutate(undefined)}>{t('common.duplicate')}</Button>);
  if (q.status === 'DRAFT' && (isOwner || can('questions.edit_all'))) actions.push(<Button key="s" icon={<Send className="h-4 w-4" />} loading={status.isPending} onClick={() => status.mutate({ status: 'PENDING_REVIEW' })}>{t('questions.submitReview')}</Button>);
  if (q.status === 'PENDING_REVIEW' && reviewer) {
    actions.push(<Button key="r" variant="outline" className="text-warning" icon={<Undo2 className="h-4 w-4" />} onClick={() => setReject(true)}>{t('questions.reject')}</Button>);
    actions.push(<Button key="a" variant="success" icon={<CheckCircle2 className="h-4 w-4" />} loading={status.isPending} onClick={() => status.mutate({ status: 'APPROVED' })}>{t('questions.approve')}</Button>);
  }
  if (q.status === 'APPROVED' && reviewer) actions.push(<Button key="p" icon={<Rocket className="h-4 w-4" />} onClick={() => status.mutate({ status: 'PUBLISHED' })}>{t('questions.publish')}</Button>);
  if (q.status !== 'ARCHIVED' && (reviewer || can('questions.edit_all'))) actions.push(<Button key="ar" variant="ghost" icon={<Archive className="h-4 w-4" />} onClick={async () => { if (await confirm({ title: t('common.archive'), message: t('questions.confirmArchive') })) status.mutate({ status: 'ARCHIVED' }); }}>{t('common.archive')}</Button>);
  if (q.status === 'ARCHIVED' && (reviewer || can('questions.edit_all'))) actions.push(<Button key="un" variant="outline" icon={<ArchiveRestore className="h-4 w-4" />} onClick={() => status.mutate({ status: 'DRAFT' })}>{t('questions.unarchive')}</Button>);
  if ((can('questions.delete') || (isOwner && q.status === 'DRAFT')) && data.usage === 0) actions.push(<Button key="x" variant="ghost" className="hover:text-danger" icon={<Trash2 className="h-4 w-4" />} onClick={async () => { if (await confirm({ title: t('common.delete'), message: t('questions.confirmDelete'), tone: 'danger', confirmLabel: t('common.delete') })) del.mutate(undefined); }}>{t('common.delete')}</Button>);

  const errs = data.quality.issues.filter((i) => i.severity === 'error');
  const warns = data.quality.issues.filter((i) => i.severity === 'warning');

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-muted">{q.code}</span>
            <QuestionStatusBadge status={q.status} />
            <Badge>v{q.version}</Badge>
            {q.isAiGenerated && <Badge tone="primary" icon={<Bot className="h-3 w-3" />}>{t('questions.aiBadge')}</Badge>}
          </div>
          <h1 className="text-2xl font-bold">{q.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted">
            <span><b className="text-primary">{q.category.code}</b> {q.category.name}{q.subcategory && ` › ${q.subcategory.name}`}</span>
            <DifficultyBadge level={q.difficulty} />
            <span>{t(`questionType.${q.type}`)}</span>
            {q.isCalculation && <Badge tone="info" icon={<Calculator className="h-3 w-3" />}>{t(`calcComplexity.${q.calcComplexity}`)}</Badge>}
            {q.isScenario && <Badge tone="solar" icon={<Workflow className="h-3 w-3" />}>{t('questions.scenarioBadge')}</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">{actions}</div>
      </div>

      {q.reviewComment && (q.status === 'DRAFT' || q.status === 'APPROVED') && (
        <div className={cn('mb-5 flex gap-3 rounded-xl border p-4 text-sm', q.status === 'DRAFT' ? 'border-warning/30 bg-warning-soft text-warning' : 'border-success/30 bg-success-soft text-success')}>
          <FileEdit className="h-5 w-5 shrink-0" />
          <div><p className="font-semibold">{t('questions.reviewComment')} – {q.reviewer?.fullName}</p><p className="text-fg">{q.reviewComment}</p></div>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card className="p-6"><QuestionPreview q={q} /></Card>
          {(q.explanation || q.calcMethod) && (
            <Card>
              <CardHeader title={t('questions.explanation')} icon={<Lightbulb className="h-5 w-5" />} />
              <div className="space-y-4 p-6">
                <RichContent text={q.explanation} />
                {q.calcMethod && <div className="rounded-lg bg-surface-2/60 p-4"><p className="mb-1 text-sm font-semibold">{t('questions.calcMethod')}</p><RichContent text={q.calcMethod} /></div>}
              </div>
            </Card>
          )}
          {q.references.length > 0 && (
            <Card>
              <CardHeader title={t('questions.references')} icon={<BookMarked className="h-5 w-5" />} />
              <ul className="divide-y divide-border">
                {q.references.map((r, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2 px-5 py-3 text-sm">
                    <b>{r.standard}</b>{r.edition && <Badge>{r.edition}</Badge>}{r.jurisdiction && <span className="text-muted">{r.jurisdiction}</span>}
                    {r.clause && <span>· {t('questions.clause')} {r.clause}</span>}
                    {r.verified ? <Badge tone="success" icon={<CheckCircle2 className="h-3 w-3" />}>{t('questions.verified')}</Badge> : r.clause ? <Badge tone="warning">{t('ui.unverified')}</Badge> : null}
                    {r.note && <span className="w-full text-xs text-muted">{r.note}</span>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
        <aside className="space-y-4">
          <Card>
            <CardHeader title={t('questions.quality')} icon={<ShieldCheck className="h-5 w-5" />} />
            <div className="space-y-2 p-4 text-sm">
              {data.quality.verification.ok !== null && (
                <p className={cn('flex items-center gap-2 font-medium', data.quality.verification.ok ? 'text-success' : 'text-danger')}>
                  {data.quality.verification.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  {data.quality.verification.ok ? t('questions.verifyOk') : t('questions.verifyFail')}
                  <span className="num ml-auto text-xs text-muted">{fmtNum(data.quality.verification.computed, 4)}</span>
                </p>
              )}
              {!errs.length && !warns.length && <p className="flex items-center gap-2 text-success"><CheckCircle2 className="h-4 w-4" />{t('questions.qualityOk')}</p>}
              {errs.map((i) => <p key={i.code} className="flex gap-2 text-danger"><XCircle className="mt-0.5 h-4 w-4 shrink-0" />{i.message}</p>)}
              {warns.map((i, k) => <p key={i.code + k} className="flex gap-2 text-warning"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{i.message}</p>)}
            </div>
          </Card>
          <Card className="space-y-2 p-4 text-sm">
            <Meta label={t('questions.author')} value={q.author.fullName} />
            <Meta label={t('questions.reviewer')} value={q.reviewer?.fullName ?? '—'} />
            <Meta label={t('common.createdAt')} value={fmtDateTime(q.createdAt)} />
            <Meta label={t('common.updatedAt')} value={fmtDateTime(q.updatedAt)} />
            <Meta label={t('questions.conceptKey')} value={<code className="font-mono text-xs">{q.conceptKey ?? '—'}</code>} />
            <Meta label={t('ui.usedInExams')} value={t('ui.nExams', { count: data.usage })} />
            {q.tags.length > 0 && <div className="flex flex-wrap gap-1 pt-1">{q.tags.map((tg) => <Badge key={tg} tone="primary">#{tg}</Badge>)}</div>}
          </Card>
          <Card>
            <CardHeader title={t('questions.reviewHistory')} icon={<ListChecks className="h-5 w-5" />} />
            <ol className="relative space-y-4 p-5 before:absolute before:bottom-6 before:left-[27px] before:top-6 before:w-px before:bg-border">
              {data.reviewLogs.map((l, i) => (
                <motion.li key={l.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="relative pl-8 text-sm">
                  <span className="absolute left-0 top-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-surface bg-primary" />
                  <div className="flex flex-wrap items-center gap-1"><QuestionStatusBadge status={l.toStatus} /><span className="text-xs text-muted">{fmtDateTime(l.createdAt)}</span></div>
                  <p className="mt-0.5 text-xs text-muted">{l.actor.fullName}</p>
                  {l.comment && <p className="mt-1 rounded bg-surface-2 px-2 py-1 text-xs">{l.comment}</p>}
                </motion.li>
              ))}
              {!data.reviewLogs.length && <li className="pl-8 text-sm text-muted">{t('common.noData')}</li>}
            </ol>
          </Card>
          <Card>
            <CardHeader title={t('questions.history')} icon={<History className="h-5 w-5" />} />
            <ul className="divide-y divide-border">
              {data.revisions.map((r) => (
                <li key={r.id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                  <Badge>v{r.version}</Badge>
                  <div className="min-w-0 flex-1"><p className="truncate">{r.changeNote ?? '—'}</p><p className="text-xs text-muted">{r.changedBy.fullName} · {fmtDateTime(r.createdAt)}</p></div>
                  {canEdit && r.version !== q.version && (
                    <Button variant="ghost" size="icon" title={t('questions.restore')} aria-label={t('questions.restore')} onClick={async () => { if (await confirm({ title: t('questions.restore'), message: `v${r.version}` })) restore.mutate(r.version); }}><RotateCcw className="h-4 w-4" /></Button>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </aside>
      </div>

      <Dialog open={reject} onClose={() => setReject(false)} title={t('questions.reject')} footer={<><Button variant="secondary" onClick={() => setReject(false)}>{t('common.cancel')}</Button><Button variant="danger" disabled={!comment.trim()} loading={status.isPending} onClick={() => status.mutate({ status: 'DRAFT', comment })}>{t('questions.reject')}</Button></>}>
        <Field label={t('questions.reviewComment')} hint={t('questions.rejectReasonRequired')} required><Textarea value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
      </Dialog>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: ReactNode }) {
  return <div className="flex justify-between gap-3"><span className="text-muted">{label}</span><span className="text-right font-medium">{value}</span></div>;
}
