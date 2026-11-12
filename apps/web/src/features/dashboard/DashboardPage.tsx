import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Award, BookOpenCheck, CheckCircle2, ClipboardList, Clock, Gauge, Radar, Target, TrendingUp, Trophy, Users } from 'lucide-react';
import type { CompetencyLevel } from '@solar/shared';
import { useT } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { useGet } from '@/hooks/useApi';
import { Card, CardHeader } from '@/components/ui/primitives';
import { EmptyState, PageHeader, Skeleton, StatCard, Table, Td, Th } from '@/components/ui/data';
import { CompetencyRadar, HBarChart, TrendLine, VBarChart, scoreTone } from '@/components/charts';
import { PassBadge } from '@/components/domain';
import { fmtDateTime, fmtPct } from '@/lib/format';
import { AssignedExamsList } from '../take/AssignedExamsList';

interface Bucket { key: string; label: string; code?: string; percent: number; level: CompetencyLevel }
interface DashData {
  admin?: {
    questions: { total: number; usable: number; byStatus: Record<string, number>; byCategory: Array<{ code: string; name: string; count: number }>; byDifficulty: Array<{ difficulty: number; count: number }> };
    exams: { active: number; total: number };
    candidates: number;
    attempts: number;
    avgScore: number;
    passRate: number;
    recent: Array<{ attemptId: string; user: string; exam: string; score: number; passed: boolean; at: string }>;
    trend: Array<{ month: string; avg: number; count: number }>;
  };
  author?: { byStatus: Record<string, number> };
  candidate?: {
    completed: number;
    avgScore: number;
    bestScore: number;
    passed: number;
    history: Array<{ attemptId: string; exam: string; score: number; passed: boolean; at: string }>;
    competency: Bucket[];
  };
}

function DashSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[132px] rounded-xl" />)}</div>
      <div className="grid gap-6 lg:grid-cols-2"><Skeleton className="h-80 rounded-xl" /><Skeleton className="h-80 rounded-xl" /></div>
    </div>
  );
}

export default function DashboardPage() {
  const { t } = useT();
  const { me } = useAuth();
  const { data, isLoading } = useGet<DashData>(['dashboard'], '/dashboard');
  const hour = new Date().getHours();
  const greet = t(hour < 11 ? 'ui.greetMorning' : hour < 14 ? 'ui.greetNoon' : hour < 18 ? 'ui.greetAfternoon' : 'ui.greetEvening');

  return (
    <div>
      <PageHeader
        title={`${greet}, ${me?.fullName}`}
        subtitle={data?.admin ? t('dashboard.subtitleAdmin') : t('dashboard.subtitleCandidate')}
      />
      {isLoading || !data ? <DashSkeleton /> : (
        <div className="space-y-6">
          {data.admin && <AdminSection d={data.admin} />}
          {data.author && <AuthorSection d={data.author} />}
          {data.candidate && <CandidateSection d={data.candidate} />}
        </div>
      )}
    </div>
  );
}

function AdminSection({ d }: { d: NonNullable<DashData['admin']> }) {
  const { t } = useT();
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label={t('dashboard.totalQuestions')} value={d.questions.total} icon={<BookOpenCheck className="h-5 w-5" />} hint={`${d.questions.usable} ${t('dashboard.approvedQuestions').toLowerCase()} · ${d.questions.byStatus.PENDING_REVIEW ?? 0} ${t('dashboard.pendingReview').toLowerCase()}`} />
        <StatCard label={t('dashboard.activeExams')} value={d.exams.active} icon={<ClipboardList className="h-5 w-5" />} tone="solar" hint={`${t('common.total')}: ${d.exams.total}`} delay={0.05} />
        <StatCard label={t('dashboard.averageScore')} value={d.avgScore} digits={1} suffix="%" icon={<Gauge className="h-5 w-5" />} tone="info" hint={`${d.attempts} ${t('dashboard.attempts').toLowerCase()} · ${d.candidates} ${t('dashboard.totalCandidates').toLowerCase()}`} delay={0.1} />
        <StatCard label={t('dashboard.passRate')} value={d.passRate} digits={1} suffix="%" icon={<CheckCircle2 className="h-5 w-5" />} tone={d.passRate >= 70 ? 'success' : 'warning'} delay={0.15} />
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title={t('dashboard.questionsByCategory')} subtitle={t('dashboard.approvedQuestions')} icon={<Target className="h-5 w-5" />} />
          <div className="p-4">
            <HBarChart data={d.questions.byCategory.map((c) => ({ name: c.name.length > 24 ? `${c.code}. ${c.name.slice(0, 22)}…` : `${c.code}. ${c.name}`, value: c.count, hint: `${c.code} – ${c.name}` }))} valueLabel={t('dashboard.approvedQuestions')} />
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title={t('dashboard.questionsByDifficulty')} icon={<Gauge className="h-5 w-5" />} />
          <div className="p-4">
            <VBarChart data={d.questions.byDifficulty.map((x) => ({ name: t(`difficulty.${x.difficulty}`), value: x.count, hint: t(`difficultyLong.${x.difficulty}`) }))} valueLabel={t('dashboard.approvedQuestions')} height={300} />
          </div>
        </Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader title={t('dashboard.scoreTrend')} icon={<TrendingUp className="h-5 w-5" />} />
          <div className="p-4">
            {d.trend.length ? <TrendLine data={d.trend.map((x) => ({ name: x.month, value: x.avg, hint: `${x.month} · ${x.count} ${t('dashboard.attempts').toLowerCase()}` }))} label={t('dashboard.averageScore')} reference={70} referenceLabel={t('results.passMark')} /> : <EmptyState title={t('results.noResults')} />}
          </div>
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader title={t('dashboard.recentResults')} icon={<Trophy className="h-5 w-5" />} action={<Link to="/ket-qua" className="text-sm font-medium text-primary hover:underline">{t('common.view')}</Link>} />
          {d.recent.length ? (
            <Table>
              <thead><tr><Th>{t('results.candidate')}</Th><Th>{t('results.exam')}</Th><Th className="text-right">{t('results.score')}</Th><Th>{t('common.status')}</Th></tr></thead>
              <tbody>
                {d.recent.map((r, i) => (
                  <motion.tr key={r.attemptId} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }} className="transition-colors hover:bg-surface-2/60">
                    <Td><Link to={`/ket-qua/luot/${r.attemptId}`} className="font-medium hover:text-primary">{r.user}</Link><p className="text-xs text-muted">{fmtDateTime(r.at)}</p></Td>
                    <Td className="max-w-[220px] truncate text-muted">{r.exam}</Td>
                    <Td className={`num text-right font-semibold text-${scoreTone(r.score)}`}>{fmtPct(r.score)}</Td>
                    <Td><PassBadge passed={r.passed} /></Td>
                  </motion.tr>
                ))}
              </tbody>
            </Table>
          ) : <EmptyState title={t('results.noResults')} />}
        </Card>
      </div>
    </>
  );
}

function AuthorSection({ d }: { d: NonNullable<DashData['author']> }) {
  const { t } = useT();
  const s = d.byStatus;
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      <StatCard label={t('questionStatus.DRAFT')} value={s.DRAFT ?? 0} icon={<BookOpenCheck className="h-5 w-5" />} tone="info" />
      <StatCard label={t('questionStatus.PENDING_REVIEW')} value={s.PENDING_REVIEW ?? 0} icon={<Clock className="h-5 w-5" />} tone="warning" delay={0.05} />
      <StatCard label={t('questionStatus.APPROVED')} value={s.APPROVED ?? 0} icon={<CheckCircle2 className="h-5 w-5" />} tone="success" delay={0.1} />
      <StatCard label={t('questionStatus.PUBLISHED')} value={s.PUBLISHED ?? 0} icon={<Award className="h-5 w-5" />} delay={0.15} />
    </div>
  );
}

function CandidateSection({ d }: { d: NonNullable<DashData['candidate']> }) {
  const { t } = useT();
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t('dashboard.completedExams')} value={d.completed} icon={<ClipboardList className="h-5 w-5" />} hint={`${d.passed} ${t('results.passed').toLowerCase()}`} />
        <StatCard label={t('dashboard.myAverage')} value={d.avgScore} digits={1} suffix="%" icon={<Gauge className="h-5 w-5" />} tone="info" delay={0.05} />
        <StatCard label={t('dashboard.bestScore')} value={d.bestScore} digits={1} suffix="%" icon={<Trophy className="h-5 w-5" />} tone="solar" delay={0.1} />
      </div>
      <Card>
        <CardHeader title={t('dashboard.assignedExams')} icon={<ClipboardList className="h-5 w-5" />} action={<Link to="/thi" className="text-sm font-medium text-primary hover:underline">{t('common.view')}</Link>} />
        <AssignedExamsList compact />
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={t('dashboard.competencyRadar')} icon={<Radar className="h-5 w-5" />} />
          <div className="p-4">
            {d.competency.length ? <CompetencyRadar data={d.competency.map((b) => ({ name: b.code ?? b.label, full: b.label, value: b.percent }))} label={t('results.score')} /> : <EmptyState icon={<Users className="h-7 w-7" />} title={t('results.noResults')} />}
          </div>
        </Card>
        <Card>
          <CardHeader title={t('results.trend')} icon={<TrendingUp className="h-5 w-5" />} />
          <div className="p-4">
            {d.history.length ? <TrendLine data={d.history.map((h, i) => ({ name: `#${i + 1}`, value: h.score, hint: h.exam }))} label={t('results.score')} reference={70} referenceLabel={t('results.passMark')} /> : <EmptyState title={t('results.noResults')} />}
          </div>
        </Card>
      </div>
    </>
  );
}
