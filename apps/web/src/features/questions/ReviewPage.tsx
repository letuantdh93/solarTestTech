import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, ChevronDown, ListChecks, Undo2, XCircle } from 'lucide-react';
import { useT } from '@/i18n';
import { api } from '@/lib/api';
import { useAction, useGet } from '@/hooks/useApi';
import { Badge, Button, Card, Checkbox, Field, Textarea } from '@/components/ui/primitives';
import { Dialog } from '@/components/ui/feedback';
import { EmptyState, PageHeader, SkeletonRows } from '@/components/ui/data';
import { DifficultyBadge } from '@/components/domain';
import { cn, fmtDateTime } from '@/lib/format';
import { QuestionPreview } from './QuestionDetailPage';
import type { Question, QualityReport } from './types';

type Item = Question & { quality: QualityReport; isOwn: boolean };

export default function ReviewPage() {
  const { t } = useT();
  const { data, isLoading } = useGet<Item[]>(['review-queue'], '/questions-review/pending');
  const [open, setOpen] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const inv = [['review-queue'], ['questions'], ['dashboard']];
  const act = useAction((v: { id: string; status: 'APPROVED' | 'DRAFT'; comment?: string }) => api(`/questions/${v.id}/status`, { body: { status: v.status, comment: v.comment } }), {
    success: t('questions.statusChanged'), invalidate: inv, onSuccess: () => { setRejecting(null); setComment(''); },
  });
  const bulk = useAction((ids: string[]) => api<{ results: Array<{ ok: boolean }> }>('/questions/bulk-status', { body: { ids, status: 'APPROVED' } }), {
    invalidate: inv, onSuccess: () => setSelected([]), success: t('questions.statusChanged'),
  });

  return (
    <div>
      <PageHeader title={t('nav.review')} subtitle={t('questions.pendingList')} icon={<ListChecks className="h-5 w-5" />}
        actions={selected.length > 0 && <Button variant="success" icon={<CheckCircle2 className="h-4 w-4" />} loading={bulk.isPending} onClick={() => bulk.mutate(selected)}>{t('questions.approve')} ({selected.length})</Button>} />
      {isLoading ? <Card><SkeletonRows /></Card> : !data?.length ? <Card><EmptyState icon={<CheckCircle2 className="h-7 w-7 text-success" />} title={t('questions.noPending')} /></Card> : (
        <div className="space-y-3">
          {data.map((q, i) => {
            const errs = q.quality.issues.filter((x) => x.severity === 'error').length;
            const warns = q.quality.issues.filter((x) => x.severity === 'warning').length;
            const isOpen = open === q.id;
            return (
              <motion.div key={q.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <Card className={cn('overflow-hidden transition-shadow', isOpen && 'shadow-lift')}>
                  <div className="flex items-center gap-3 p-4">
                    <Checkbox checked={selected.includes(q.id)} disabled={errs > 0 || q.isOwn} onChange={(v) => setSelected((s) => (v ? [...s, q.id] : s.filter((x) => x !== q.id)))} />
                    <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setOpen(isOpen ? null : q.id)} aria-expanded={isOpen}>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted"><span className="font-mono">{q.code}</span><b className="text-primary">{q.category.code}</b><DifficultyBadge level={q.difficulty} compact /><span>{q.author.fullName}</span><span>{fmtDateTime(q.updatedAt)}</span></div>
                        <p className="mt-1 truncate font-medium">{q.title}</p>
                      </div>
                      <div className="hidden gap-1 sm:flex">
                        {q.quality.verification.ok === true && <Badge tone="success" icon={<CheckCircle2 className="h-3 w-3" />}>{t('ui.keyVerified')}</Badge>}
                        {errs > 0 && <Badge tone="danger" icon={<XCircle className="h-3 w-3" />}>{errs} {t('questions.errors')}</Badge>}
                        {warns > 0 && <Badge tone="warning" icon={<AlertTriangle className="h-3 w-3" />}>{warns}</Badge>}
                      </div>
                      <ChevronDown className={cn('h-4 w-4 text-subtle transition-transform', isOpen && 'rotate-180')} />
                    </button>
                  </div>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden border-t border-border">
                        <div className="grid gap-6 p-5 lg:grid-cols-[1fr_300px]">
                          <QuestionPreview q={q} />
                          <div className="space-y-3 text-sm">
                            {q.quality.issues.map((x, k) => <p key={k} className={cn('flex gap-2', x.severity === 'error' ? 'text-danger' : 'text-warning')}>{x.severity === 'error' ? <XCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}{x.message}</p>)}
                            <Link to={`/cau-hoi/${q.id}`} className="block text-primary hover:underline">{t('common.details')} →</Link>
                            <div className="flex flex-wrap gap-2 pt-2">
                              <Button variant="outline" className="text-warning" icon={<Undo2 className="h-4 w-4" />} onClick={() => setRejecting(q.id)}>{t('questions.reject')}</Button>
                              <Button variant="success" icon={<CheckCircle2 className="h-4 w-4" />} disabled={errs > 0 || q.isOwn} loading={act.isPending && act.variables?.id === q.id} onClick={() => act.mutate({ id: q.id, status: 'APPROVED' })}>{t('questions.approve')}</Button>
                            </div>
                            {q.isOwn && <p className="text-xs text-muted">{t('ui.cannotSelfApprove')}</p>}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
      <Dialog open={!!rejecting} onClose={() => setRejecting(null)} title={t('questions.reject')} footer={<><Button variant="secondary" onClick={() => setRejecting(null)}>{t('common.cancel')}</Button><Button variant="danger" disabled={!comment.trim()} loading={act.isPending} onClick={() => act.mutate({ id: rejecting!, status: 'DRAFT', comment })}>{t('questions.reject')}</Button></>}>
        <Field label={t('questions.reviewComment')} hint={t('questions.rejectReasonRequired')} required><Textarea value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
      </Dialog>
    </div>
  );
}
