import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertTriangle, BarChart3, CheckCircle2, Clock, Gauge, Medal, Radar as RadarIcon, TrendingUp, Trophy, Users, UsersRound } from 'lucide-react';
import type { CompetencyLevel } from '@solar/shared';
import { useT } from '@/i18n';
import { Card, CardHeader } from '@/components/ui/primitives';
import { EmptyState, ProgressBar, StatCard, Table, Td, Th } from '@/components/ui/data';
import { CompetencyBadge, PassBadge, competencyTone } from '@/components/domain';
import { CompetencyRadar, HBarChart, TrendLine, VBarChart, scoreTone } from '@/components/charts';
import { cn, fmtDuration, fmtPct } from '@/lib/format';

interface Bucket { key: string; code?: string; label: string; total: number; correct: number; percent: number; level: CompetencyLevel }
export interface AnalyticsData {
  count: number; candidates: number; avgScore: number; passRate: number; avgDurationSeconds: number;
  categories: Bucket[]; difficulty: Bucket[];
  trend: Array<{ month: string; avg: number; count: number; passRate: number }>;
  byExam: Array<{ id: string; code: string; name: string; count: number; avgScore: number; passRate: number }>;
  distribution: Array<{ from: number; to: number; count: number }>;
  hardestQuestions: Array<{ questionId: string; code: string; title: string; categoryCode: string; attempts: number; correctRate: number }>;
  ranking: Array<{ rank: number; user: { id: string; fullName: string; department: string | null }; bestScore: number; passed: boolean; attempts: number; durationSeconds: number; attemptId: string }>;
  groups: Array<{ id: string; name: string; members: number; results: number; avgScore: number | null; passRate: number | null; categories: Bucket[] }>;
}

const rankIcon = (r: number) => (r === 1 ? <Trophy className="h-4 w-4 text-solar" /> : r <= 3 ? <Medal className="h-4 w-4 text-muted" /> : null);

export function AnalyticsView({ a, passingScore = 70, showExams = true }: { a: AnalyticsData; passingScore?: number; showExams?: boolean }) {
  const { t } = useT();
  if (!a.count) return <Card><EmptyState icon={<BarChart3 className="h-7 w-7" />} title={t('results.noResults')} /></Card>;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label={t('dashboard.attempts')} value={a.count} icon={<BarChart3 className="h-5 w-5" />} hint={`${a.candidates} ${t('analytics.candidates')}`} />
        <StatCard label={t('dashboard.averageScore')} value={a.avgScore} digits={1} suffix="%" icon={<Gauge className="h-5 w-5" />} tone="info" delay={0.05} />
        <StatCard label={t('dashboard.passRate')} value={a.passRate} digits={1} suffix="%" icon={<CheckCircle2 className="h-5 w-5" />} tone={a.passRate >= 70 ? 'success' : 'warning'} delay={0.1} />
        <StatCard label={t('results.timeUsed')} value={Math.round(a.avgDurationSeconds / 60)} suffix={t('ui.minutesSuffix')} icon={<Clock className="h-5 w-5" />} tone="solar" hint={fmtDuration(a.avgDurationSeconds)} delay={0.15} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={t('analytics.teamRadar')} icon={<RadarIcon className="h-5 w-5" />} />
          <div className="p-4"><CompetencyRadar data={a.categories.map((c) => ({ name: c.code ?? c.label, full: c.label, value: c.percent }))} label={t('dashboard.averageScore')} height={320} /></div>
        </Card>
        <Card>
          <CardHeader title={t('results.byCategory')} icon={<BarChart3 className="h-5 w-5" />} />
          <Table>
            <thead><tr><Th>{t('results.technicalArea')}</Th><Th className="text-right">{t('results.score')}</Th><Th>{t('results.assessment')}</Th></tr></thead>
            <tbody>
              {a.categories.map((c) => (
                <tr key={c.key}>
                  <Td><span className="font-semibold text-primary">{c.code}</span> {c.label}<ProgressBar className="mt-1" value={c.percent} tone={competencyTone(c.level)} height="h-1.5" /></Td>
                  <Td className="num text-right font-semibold">{fmtPct(c.percent, 0)}</Td>
                  <Td><CompetencyBadge level={c.level} /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title={t('analytics.difficultyPerf')} icon={<Gauge className="h-5 w-5" />} />
          <div className="p-4"><VBarChart data={a.difficulty.map((d) => ({ name: t(`difficulty.${d.key}`), value: d.percent, hint: `${t(`difficultyLong.${d.key}`)} · ${d.correct}/${d.total}` }))} valueLabel={t('analytics.correctRate')} unit="%" max={100} colorBy={(v) => scoreTone(v)} height={260} /></div>
        </Card>
        <Card>
          <CardHeader title={t('analytics.distribution')} icon={<BarChart3 className="h-5 w-5" />} />
          <div className="p-4"><VBarChart data={a.distribution.map((b) => ({ name: `${b.from}`, value: b.count, hint: `${b.from}–${b.to}%` }))} valueLabel={t('dashboard.attempts')} height={260} colorBy={() => 'primary'} /></div>
        </Card>
        <Card>
          <CardHeader title={t('analytics.monthlyTrend')} icon={<TrendingUp className="h-5 w-5" />} />
          <div className="p-4">{a.trend.length > 0 ? <TrendLine data={a.trend.map((x) => ({ name: x.month, value: x.avg, hint: `${x.month} · ${x.count} ${t('dashboard.attempts').toLowerCase()}` }))} label={t('dashboard.averageScore')} reference={passingScore} referenceLabel={t('results.passMark')} height={260} /> : <EmptyState title={t('common.noData')} />}</div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title={t('results.ranking')} icon={<Trophy className="h-5 w-5" />} />
          <Table>
            <thead><tr><Th className="w-16">{t('results.rank')}</Th><Th>{t('results.candidate')}</Th><Th className="text-right">{t('results.score')}</Th><Th className="hidden sm:table-cell">{t('results.duration')}</Th><Th>{t('common.status')}</Th></tr></thead>
            <tbody>
              {a.ranking.slice(0, 20).map((r, i) => (
                <motion.tr key={r.user.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }} className="hover:bg-surface-2/50">
                  <Td><span className="flex items-center gap-1.5 font-bold">{rankIcon(r.rank)}{r.rank}</span></Td>
                  <Td><Link to={`/ket-qua/luot/${r.attemptId}`} className="font-medium hover:text-primary">{r.user.fullName}</Link><p className="text-xs text-muted">{r.user.department}</p></Td>
                  <Td className={cn('num text-right font-semibold', `text-${scoreTone(r.bestScore)}`)}>{fmtPct(r.bestScore)}</Td>
                  <Td className="hidden text-xs text-muted sm:table-cell">{fmtDuration(r.durationSeconds)}</Td>
                  <Td><PassBadge passed={r.passed} /></Td>
                </motion.tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title={t('analytics.hardestQuestions')} icon={<AlertTriangle className="h-5 w-5" />} />
          <ul className="divide-y divide-border">
            {a.hardestQuestions.map((q) => (
              <li key={q.questionId} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <Link to={`/cau-hoi/${q.questionId}`} className="min-w-0 flex-1 text-sm hover:text-primary"><span className="font-mono text-xs text-muted">{q.code}</span><p className="truncate">{q.title}</p></Link>
                  <span className={cn('num text-sm font-semibold', `text-${scoreTone(q.correctRate)}`)}>{fmtPct(q.correctRate, 0)}</span>
                </div>
                <ProgressBar className="mt-1.5" value={q.correctRate} tone={scoreTone(q.correctRate)} height="h-1" />
                <p className="mt-1 text-[11px] text-subtle">{q.attempts} {t('analytics.attempts').toLowerCase()}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {showExams && a.byExam.length > 0 && (
          <Card>
            <CardHeader title={t('analytics.passRateByExam')} icon={<Users className="h-5 w-5" />} subtitle={t('results.comparison')} />
            <div className="p-4"><HBarChart data={a.byExam.map((e) => ({ name: e.code, value: e.passRate, hint: t('ui.examCompare', { name: e.name, avg: fmtPct(e.avgScore), count: e.count }) }))} valueLabel={t('dashboard.passRate')} unit="%" max={100} colorBy={(v) => scoreTone(v)} /></div>
          </Card>
        )}
        {a.groups.length > 0 && (
          <Card>
            <CardHeader title={t('results.groupPerformance')} icon={<UsersRound className="h-5 w-5" />} />
            <Table>
              <thead><tr><Th>{t('users.groups')}</Th><Th className="text-right">{t('dashboard.averageScore')}</Th><Th className="text-right">{t('dashboard.passRate')}</Th><Th className="hidden text-right sm:table-cell">{t('dashboard.attempts')}</Th></tr></thead>
              <tbody>
                {a.groups.map((g) => (
                  <tr key={g.id}>
                    <Td><p className="font-medium">{g.name}</p><p className="text-xs text-muted">{g.members} {t('users.members').toLowerCase()}</p></Td>
                    <Td className="num text-right font-semibold">{fmtPct(g.avgScore)}</Td>
                    <Td className="num text-right">{fmtPct(g.passRate)}</Td>
                    <Td className="num hidden text-right text-muted sm:table-cell">{g.results}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </div>
    </div>
  );
}
