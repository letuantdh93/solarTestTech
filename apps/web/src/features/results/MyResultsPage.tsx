import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { History, Radar as RadarIcon, TrendingUp } from 'lucide-react';
import type { CompetencyLevel } from '@solar/shared';
import { useT } from '@/i18n';
import { useGet } from '@/hooks/useApi';
import { Card, CardHeader } from '@/components/ui/primitives';
import { EmptyState, PageHeader, ProgressBar, Skeleton } from '@/components/ui/data';
import { CompetencyBadge, PassBadge } from '@/components/domain';
import { CompetencyRadar, TrendLine, scoreTone } from '@/components/charts';
import { fmtDateTime, fmtDuration, fmtPct } from '@/lib/format';

interface H {
  results: Array<{ attemptId: string; exam: { code: string; name: string }; attemptNo: number; submittedAt: string; scorePercent: number; passed: boolean; durationSeconds: number; correctCount: number; totalQuestions: number }>;
  trend: Array<{ name: string; value: number; exam: string }>;
  competency: Array<{ key: string; code?: string; label: string; percent: number; level: CompetencyLevel }>;
}

export default function MyResultsPage() {
  const { t } = useT();
  const nav = useNavigate();
  const { data, isLoading } = useGet<H>(['my-results'], '/my/results');
  return (
    <div>
      <PageHeader title={t('results.myTitle')} subtitle={t('results.mySubtitle')} icon={<History className="h-5 w-5" />} />
      {isLoading || !data ? <Skeleton className="h-96 rounded-xl" /> : !data.results.length ? <Card><EmptyState title={t('results.noResults')} /></Card> : (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card><CardHeader title={t('results.trend')} icon={<TrendingUp className="h-5 w-5" />} /><div className="p-4"><TrendLine data={data.trend.map((x) => ({ name: x.name, value: x.value, hint: x.exam }))} label={t('results.score')} reference={70} referenceLabel={t('results.passMark')} /></div></Card>
            <Card>
              <CardHeader title={t('dashboard.competencyRadar')} icon={<RadarIcon className="h-5 w-5" />} />
              <div className="p-4">{data.competency.length ? <CompetencyRadar data={data.competency.map((c) => ({ name: c.code ?? c.label, full: c.label, value: c.percent }))} label={t('results.score')} height={260} /> : <EmptyState title={t('common.noData')} />}</div>
            </Card>
          </div>
          {data.competency.length > 0 && (
            <Card className="p-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.competency.map((c) => (
                  <div key={c.key} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between gap-2 text-sm"><span className="truncate"><b className="text-primary">{c.code}</b> {c.label}</span><CompetencyBadge level={c.level} /></div>
                    <ProgressBar className="mt-2" value={c.percent} tone={scoreTone(c.percent)} height="h-1.5" />
                  </div>
                ))}
              </div>
            </Card>
          )}
          <div className="space-y-3">
            {data.results.map((r, i) => (
              <motion.button key={r.attemptId} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} onClick={() => nav(`/ket-qua/luot/${r.attemptId}`)} className="card card-hover flex w-full items-center gap-4 p-4 text-left">
                <div className={`num flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-lg font-bold text-${scoreTone(r.scorePercent)} bg-surface-2`}>{Math.round(r.scorePercent)}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{r.exam.name}</p>
                  <p className="text-xs text-muted">{r.exam.code} · {t('results.attemptNo')} {r.attemptNo} · {fmtDateTime(r.submittedAt)} · {fmtDuration(r.durationSeconds)}</p>
                </div>
                <span className="num hidden text-sm text-muted sm:block">{r.correctCount}/{r.totalQuestions}</span>
                <span className="num hidden w-16 text-right font-semibold sm:block">{fmtPct(r.scorePercent)}</span>
                <PassBadge passed={r.passed} />
              </motion.button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
