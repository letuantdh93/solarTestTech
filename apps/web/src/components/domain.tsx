import { AlertTriangle, Archive, CheckCircle2, CircleDashed, Clock, FileEdit, Rocket, Star, TrendingDown, TrendingUp, XCircle } from 'lucide-react';
import type { CompetencyLevel, ExamStatus, QuestionStatus } from '@solar/shared';
import { useT } from '@/i18n';
import { Badge, type Tone } from './ui/primitives';
import { cn } from '@/lib/format';

const qStatus: Record<QuestionStatus, { tone: Tone; icon: JSX.Element }> = {
  DRAFT: { tone: 'neutral', icon: <FileEdit className="h-3 w-3" /> },
  PENDING_REVIEW: { tone: 'warning', icon: <Clock className="h-3 w-3" /> },
  APPROVED: { tone: 'success', icon: <CheckCircle2 className="h-3 w-3" /> },
  PUBLISHED: { tone: 'primary', icon: <Rocket className="h-3 w-3" /> },
  ARCHIVED: { tone: 'neutral', icon: <Archive className="h-3 w-3" /> },
};
export function QuestionStatusBadge({ status }: { status: QuestionStatus }) {
  const { t } = useT();
  return <Badge tone={qStatus[status].tone} icon={qStatus[status].icon}>{t(`questionStatus.${status}`)}</Badge>;
}

const eStatus: Record<ExamStatus, { tone: Tone; icon: JSX.Element }> = {
  DRAFT: { tone: 'neutral', icon: <FileEdit className="h-3 w-3" /> },
  PUBLISHED: { tone: 'success', icon: <Rocket className="h-3 w-3" /> },
  CLOSED: { tone: 'warning', icon: <XCircle className="h-3 w-3" /> },
  ARCHIVED: { tone: 'neutral', icon: <Archive className="h-3 w-3" /> },
};
export function ExamStatusBadge({ status }: { status: ExamStatus }) {
  const { t } = useT();
  return <Badge tone={eStatus[status].tone} icon={eStatus[status].icon}>{t(`examStatus.${status}`)}</Badge>;
}

const diffTone = ['', 'info', 'primary', 'warning', 'danger'] as const;
export function DifficultyBadge({ level, compact }: { level: number; compact?: boolean }) {
  const { t } = useT();
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted" title={t(`difficultyLong.${level}`)}>
      <span className="flex gap-0.5" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={cn('h-2.5 w-1.5 rounded-sm', i <= level ? `bg-${diffTone[level]}` : 'bg-border')} />
        ))}
      </span>
      {!compact && t(`difficulty.${level}`)}
    </span>
  );
}

const comp: Record<CompetencyLevel, { tone: Tone; icon: JSX.Element }> = {
  EXCELLENT: { tone: 'success', icon: <Star className="h-3 w-3" /> },
  GOOD: { tone: 'success', icon: <TrendingUp className="h-3 w-3" /> },
  NEEDS_IMPROVEMENT: { tone: 'warning', icon: <AlertTriangle className="h-3 w-3" /> },
  WEAK: { tone: 'danger', icon: <TrendingDown className="h-3 w-3" /> },
};
export function CompetencyBadge({ level }: { level: CompetencyLevel }) {
  const { t } = useT();
  return <Badge tone={comp[level].tone} icon={comp[level].icon}>{t(`competency.${level}`)}</Badge>;
}
export const competencyTone = (level: CompetencyLevel) => comp[level].tone as 'success' | 'warning' | 'danger';

export function PassBadge({ passed, large }: { passed: boolean; large?: boolean }) {
  const { t } = useT();
  return (
    <Badge tone={passed ? 'success' : 'danger'} icon={passed ? <CheckCircle2 className={large ? 'h-4 w-4' : 'h-3 w-3'} /> : <XCircle className={large ? 'h-4 w-4' : 'h-3 w-3'} />} className={large ? 'px-3 py-1 text-sm' : ''}>
      {passed ? t('results.passed') : t('results.failed')}
    </Badge>
  );
}

export function PendingIcon() {
  return <CircleDashed className="h-4 w-4" />;
}
