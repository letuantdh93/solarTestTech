import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Archive, BarChart3, Link2, ClipboardList, Copy, Lock, Pencil, Rocket, Save, Settings2, Trash2, UserPlus, Users, XCircle, RotateCcw } from 'lucide-react';
import type { ExamStatus, QuestionType } from '@solar/shared';
import { useT } from '@/i18n';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction, useGet } from '@/hooks/useApi';
import { Badge, Button, Card, Field, Input } from '@/components/ui/primitives';
import { Dialog, useConfirm, useToast } from '@/components/ui/feedback';
import { EmptyState, PageHeader, Skeleton, Table, Tabs, Td, Th } from '@/components/ui/data';
import { CheckList } from '@/components/ui/CheckList';
import { ExamStatusBadge } from '@/components/domain';
import { fmtDateTime } from '@/lib/format';
import { ExamConfigForm, configToPayload, toLocalInput, type ExamConfig } from './ExamConfigForm';
import { ManualPicker, SelectedList, type PickedQuestion } from './ExamBuilderPage';
import { ExamStats } from '../results/ExamStats';

interface ExamDetail {
  id: string; code: string; name: string; description: string | null; targetAudience: string | null; examCategory: string | null; status: ExamStatus;
  durationMinutes: number; passingScore: number; randomizeQuestions: boolean; publicAccess: boolean; randomizeOptions: boolean; maxAttempts: number; startAt: string | null; endAt: string | null;
  resultVisibility: ExamConfig['resultVisibility']; explanationVisibility: ExamConfig['explanationVisibility'];
  _count: { questions: number; assignments: number; attempts: number; results: number };
  questions: Array<{ id: string; points: number; question: PickedQuestion & { status: string; type: QuestionType } }>;
  assignments: Array<{ id: string; dueAt: string | null; createdAt: string; user: { id: string; fullName: string; username: string; department: string | null } | null; group: { id: string; name: string; _count: { members: number } } | null; assignedBy: { fullName: string } }>;
}

export default function ExamDetailPage() {
  const { id } = useParams();
  const { t } = useT();
  const nav = useNavigate();
  const { can } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const { data, isLoading } = useGet<ExamDetail>(['exam', id], `/exams/${id}`);
  const [tab, setTab] = useState<'questions' | 'assign' | 'settings' | 'stats'>('questions');
  const [assignOpen, setAssignOpen] = useState(false);
  const inv = [['exam', id], ['exams'], ['dashboard']];
  const status = useAction((s: ExamStatus) => api(`/exams/${id}/status`, { body: { status: s } }), { success: t('common.saved'), invalidate: inv });
  const dup = useAction(() => api<{ exam: { id: string }; skipped: number }>(`/exams/${id}/duplicate`, { method: 'POST' }), { invalidate: [['exams']], onSuccess: (r) => { toast.success(r.skipped ? t('ui.duplicatedSkipped', { count: r.skipped }) : t('common.saved')); nav(`/de-thi/${r.exam.id}`); } });
  const del = useAction(() => api(`/exams/${id}`, { method: 'DELETE' }), { success: t('exams.deleted'), invalidate: [['exams']], onSuccess: () => nav('/de-thi') });
  const unassign = useAction((aid: string) => api(`/exams/${id}/assignments/${aid}`, { method: 'DELETE' }), { success: t('common.saved'), invalidate: inv });

  if (isLoading || !data) return <div className="space-y-4"><Skeleton className="h-12 w-96" /><Skeleton className="h-96" /></div>;
  const manage = can('exams.manage');
  const locked = data._count.attempts > 0;

  return (
    <div>
      <PageHeader
        title={data.name}
        subtitle={<span className="flex flex-wrap items-center gap-2"><span className="font-mono">{data.code}</span><ExamStatusBadge status={data.status} />{locked && <Badge icon={<Lock className="h-3 w-3" />}>{t('ui.nAttempts', { count: data._count.attempts })}</Badge>}</span>}
        icon={<ClipboardList className="h-5 w-5" />}
        actions={manage && (
          <>
            {data.status === 'DRAFT' && <Button icon={<Rocket className="h-4 w-4" />} loading={status.isPending} onClick={async () => { if (await confirm({ title: t('exams.publish'), message: t('exams.confirmPublish') })) status.mutate('PUBLISHED'); }}>{t('exams.publish')}</Button>}
            {data.status === 'PUBLISHED' && <Button variant="outline" icon={<XCircle className="h-4 w-4" />} onClick={async () => { if (await confirm({ title: t('exams.close'), message: t('exams.confirmClose') })) status.mutate('CLOSED'); }}>{t('exams.close')}</Button>}
            {data.status === 'CLOSED' && <Button variant="outline" icon={<RotateCcw className="h-4 w-4" />} onClick={() => status.mutate('PUBLISHED')}>{t('exams.reopen')}</Button>}
            <Button variant="outline" icon={<Copy className="h-4 w-4" />} loading={dup.isPending} onClick={() => dup.mutate(undefined)}>{t('exams.duplicateExam')}</Button>
            {(data.status === 'CLOSED' || data.status === 'DRAFT') && <Button variant="ghost" icon={<Archive className="h-4 w-4" />} onClick={() => status.mutate('ARCHIVED')}>{t('exams.archive')}</Button>}
            {!locked && <Button variant="ghost" className="hover:text-danger" icon={<Trash2 className="h-4 w-4" />} onClick={async () => { if (await confirm({ title: t('common.delete'), message: t('exams.confirmDelete'), tone: 'danger' })) del.mutate(undefined); }}>{t('common.delete')}</Button>}
          </>
        )}
      />
      <Tabs className="mb-5" value={tab} onChange={setTab} tabs={[
        { id: 'questions', label: t('exams.questionsTab'), icon: <ClipboardList className="h-4 w-4" />, count: data.questions.length },
        { id: 'assign', label: t('exams.assignmentsTab'), icon: <Users className="h-4 w-4" />, count: data.assignments.length },
        ...(manage ? [{ id: 'settings' as const, label: t('exams.settingsTab'), icon: <Settings2 className="h-4 w-4" /> }] : []),
        { id: 'stats', label: t('exams.statsTab'), icon: <BarChart3 className="h-4 w-4" /> },
      ]} />
      {data.publicAccess && data.status === 'PUBLISHED' && (
        <Card className="mb-5 flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{t('guest.publicLink')}</p>
            <p className="truncate font-mono text-xs text-muted">{`${location.origin}/vao-thi/${data.code}`}</p>
            <p className="mt-1 text-xs text-muted">{t('guest.publicAccessHint')} ({location.origin}/vao-thi)</p>
          </div>
          <Button variant="outline" size="sm" icon={<Link2 className="h-4 w-4" />} onClick={() => { void navigator.clipboard?.writeText(`${location.origin}/vao-thi/${data.code}`); toast.success(t('guest.copied')); }}>{t('guest.copyLink')}</Button>
        </Card>
      )}
      {tab === 'questions' && <QuestionsTab exam={data} locked={locked || !manage} />}
      {tab === 'assign' && (
        <Card>
          <div className="flex items-center justify-between border-b border-border p-4">
            <p className="text-sm text-muted">{t('exams.assignments')}</p>
            {can('exams.assign') && <Button icon={<UserPlus className="h-4 w-4" />} onClick={() => setAssignOpen(true)}>{t('exams.assign')}</Button>}
          </div>
          {!data.assignments.length ? <EmptyState title={t('common.noData')} /> : (
            <Table>
              <thead><tr><Th>{t('results.candidate')} / {t('users.groups')}</Th><Th>{t('exams.dueAt')}</Th><Th className="hidden md:table-cell">{t('common.createdAt')}</Th><Th /></tr></thead>
              <tbody>
                {data.assignments.map((a) => (
                  <tr key={a.id} className="hover:bg-surface-2/50">
                    <Td>{a.user ? <><p className="font-medium">{a.user.fullName}</p><p className="text-xs text-muted">@{a.user.username} · {a.user.department}</p></> : <><p className="flex items-center gap-2 font-medium"><Users className="h-4 w-4 text-primary" />{a.group?.name}</p><p className="text-xs text-muted">{a.group?._count.members} {t('users.members').toLowerCase()}</p></>}</Td>
                    <Td className="text-sm">{a.dueAt ? fmtDateTime(a.dueAt) : '—'}</Td>
                    <Td className="hidden text-xs text-muted md:table-cell">{fmtDateTime(a.createdAt)} · {a.assignedBy.fullName}</Td>
                    <Td className="text-right">{can('exams.assign') && <Button variant="ghost" size="sm" onClick={() => unassign.mutate(a.id)}>{t('exams.unassign')}</Button>}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}
      {tab === 'settings' && <SettingsTab exam={data} />}
      {tab === 'stats' && <ExamStats examId={data.id} passingScore={data.passingScore} />}
      {assignOpen && <AssignDialog examId={data.id} onClose={() => setAssignOpen(false)} />}
    </div>
  );
}

function QuestionsTab({ exam, locked }: { exam: ExamDetail; locked: boolean }) {
  const { t } = useT();
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<PickedQuestion[]>(exam.questions.map((q) => q.question));
  useEffect(() => setItems(exam.questions.map((q) => q.question)), [exam]);
  const save = useAction(() => api(`/exams/${exam.id}/questions`, { method: 'PUT', body: { questionIds: items.map((q) => q.id) } }), { success: t('exams.saved'), invalidate: [['exam', exam.id]], onSuccess: () => setEditing(false) });
  const unusable = exam.questions.filter((q) => q.question.status !== 'APPROVED' && q.question.status !== 'PUBLISHED');
  return (
    <div className="space-y-4">
      {unusable.length > 0 && <p className="rounded-lg bg-warning-soft p-3 text-sm text-warning">{t('exams.unusableQuestions')}: {unusable.map((q) => q.question.code).join(', ')}</p>}
      {locked && <p className="flex items-center gap-2 text-sm text-muted"><Lock className="h-4 w-4" />{t('exams.lockedAfterAttempts')}</p>}
      {!locked && !editing && <Button variant="outline" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)}>{t('common.edit')}</Button>}
      {editing && (
        <>
          <ManualPicker selected={items} onAdd={(q) => setItems((s) => [...s, q])} />
          <div className="flex gap-2"><Button variant="secondary" onClick={() => { setEditing(false); setItems(exam.questions.map((q) => q.question)); }}>{t('common.cancel')}</Button><Button icon={<Save className="h-4 w-4" />} loading={save.isPending} onClick={() => save.mutate(undefined)}>{t('common.save')} ({items.length})</Button></div>
        </>
      )}
      <SelectedList items={items} readOnly={!editing} onRemove={editing ? (qid) => setItems((s) => s.filter((x) => x.id !== qid)) : undefined} />
    </div>
  );
}

function SettingsTab({ exam }: { exam: ExamDetail }) {
  const { t } = useT();
  const [cfg, setCfg] = useState<ExamConfig>({
    name: exam.name, description: exam.description ?? '', targetAudience: exam.targetAudience ?? '', examCategory: exam.examCategory ?? '', durationMinutes: exam.durationMinutes,
    passingScore: exam.passingScore, randomizeQuestions: true, publicAccess: exam.publicAccess, randomizeOptions: exam.randomizeOptions, maxAttempts: exam.maxAttempts,
    startAt: toLocalInput(exam.startAt), endAt: toLocalInput(exam.endAt), resultVisibility: exam.resultVisibility, explanationVisibility: exam.explanationVisibility,
  });
  const save = useAction(() => api(`/exams/${exam.id}`, { method: 'PUT', body: configToPayload(cfg) }), { success: t('exams.saved'), invalidate: [['exam', exam.id], ['exams']] });
  return (
    <Card className="p-6">
      <ExamConfigForm value={cfg} onChange={setCfg} errors={save.error?.fieldErrors} />
      <div className="mt-6 flex justify-end"><Button icon={<Save className="h-4 w-4" />} loading={save.isPending} onClick={() => save.mutate(undefined)}>{t('common.save')}</Button></div>
    </Card>
  );
}

function AssignDialog({ examId, onClose }: { examId: string; onClose: () => void }) {
  const { t } = useT();
  const users = useGet<{ items: Array<{ id: string; fullName: string; username: string; department: string | null; isActive: boolean }> }>(['users', 'candidates'], '/users?role=CANDIDATE&pageSize=500');
  const groups = useGet<Array<{ id: string; name: string; members: unknown[] }>>(['groups'], '/groups');
  const [userIds, setUserIds] = useState<string[]>([]);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [dueAt, setDueAt] = useState('');
  const save = useAction(() => api(`/exams/${examId}/assignments`, { body: { userIds, groupIds, dueAt: dueAt ? new Date(dueAt).toISOString() : null } }), { success: t('exams.assigned'), invalidate: [['exam', examId]], onSuccess: onClose });
  return (
    <Dialog open onClose={onClose} size="lg" title={t('exams.assignTitle')} footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button disabled={!userIds.length && !groupIds.length} loading={save.isPending} onClick={() => save.mutate(undefined)}>{t('exams.assign')}</Button></>}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t('exams.assignGroups')}><CheckList items={groups.data ?? []} value={groupIds} onChange={setGroupIds} render={(g) => <span>{g.name} <span className="text-xs text-muted">({g.members.length})</span></span>} searchText={(g) => g.name} /></Field>
        <Field label={t('exams.assignUsers')}><CheckList items={(users.data?.items ?? []).filter((u) => u.isActive)} value={userIds} onChange={setUserIds} render={(u) => <span>{u.fullName} <span className="text-xs text-muted">{u.department}</span></span>} searchText={(u) => `${u.fullName} ${u.username} ${u.department ?? ''}`} /></Field>
        <Field label={t('exams.dueAt')}><Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} /></Field>
      </div>
    </Dialog>
  );
}
