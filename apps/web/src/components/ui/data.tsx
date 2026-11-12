import { useEffect, useRef, useState, type ReactNode } from 'react';
import { animate, motion, useInView, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import { useT } from '@/i18n';
import { cn, fmtNum } from '@/lib/format';
import { Button } from './primitives';

/** Number that counts up when it enters the viewport (instant with reduced motion). */
export function AnimatedNumber({ value, digits = 0, suffix = '', duration = 1.1, className }: { value: number; digits?: number; suffix?: string; duration?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  const from = useRef(0);
  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      setShown(value);
      return;
    }
    const c = animate(from.current, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setShown(v),
    });
    from.current = value;
    return () => c.stop();
  }, [value, inView, reduce, duration]);
  return (
    <span ref={ref} className={cn('num', className)}>
      {fmtNum(shown, digits)}
      {suffix}
    </span>
  );
}

export function ProgressBar({ value, tone = 'primary', className, height = 'h-2', label }: { value: number; tone?: 'primary' | 'success' | 'danger' | 'warning' | 'info' | 'solar'; className?: string; height?: string; label?: string }) {
  const color = { primary: 'bg-primary', success: 'bg-success', danger: 'bg-danger', warning: 'bg-warning', info: 'bg-info', solar: 'bg-solar' }[tone];
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cn('w-full overflow-hidden rounded-full bg-surface-2', height, className)} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <motion.div className={cn('h-full rounded-full', color)} initial={{ width: 0 }} animate={{ width: `${v}%` }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden />;
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-5" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-subtle">{icon ?? <Inbox className="h-7 w-7" />}</div>
      <p className="font-medium text-fg">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, icon }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex items-start gap-3">
        {icon && <div className="mt-1 hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary sm:flex">{icon}</div>}
        <div>
          <h1 className="text-2xl font-bold text-fg">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Pagination({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (p: number) => void }) {
  const { t } = useT();
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-muted">
      <span className="num">
        {t('common.total')}: {fmtNum(total)} · {t('common.page')} {page}/{pages}
      </span>
      <div className="flex gap-1">
        <Button variant="ghost" size="icon" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={t('common.previous')}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label={t('common.next')}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: Array<{ id: T; label: ReactNode; icon?: ReactNode; count?: number }>; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cn('scrollbar-thin flex gap-1 overflow-x-auto border-b border-border', className)} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={value === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn('relative flex items-center gap-2 whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors', value === tab.id ? 'text-primary' : 'text-muted hover:text-fg')}
        >
          {tab.icon}
          {tab.label}
          {tab.count != null && <span className="num rounded-full bg-surface-2 px-1.5 text-xs text-muted">{tab.count}</span>}
          {value === tab.id && <motion.span layoutId={`tab-underline-${tabs.map((x) => x.id).join('')}`} className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />}
        </button>
      ))}
    </div>
  );
}

export function StatCard({ label, value, digits = 0, suffix, icon, tone = 'primary', hint, delay = 0 }: { label: string; value: number; digits?: number; suffix?: string; icon: ReactNode; tone?: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'solar'; hint?: ReactNode; delay?: number }) {
  const toneCls = { primary: 'bg-primary-soft text-primary', success: 'bg-success-soft text-success', warning: 'bg-warning-soft text-warning', danger: 'bg-danger-soft text-danger', info: 'bg-info-soft text-info', solar: 'bg-solar-soft text-solar' }[tone];
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.4, ease: [0.22, 1, 0.36, 1] }} className="card card-hover p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted sm:text-sm">{label}</p>
        <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-110', toneCls)}>{icon}</div>
      </div>
      <p className="mt-3 text-2xl font-bold text-fg sm:text-3xl">
        <AnimatedNumber value={value} digits={digits} suffix={suffix} />
      </p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </motion.div>
  );
}

/** Circular score visualisation with animated stroke. */
export function ScoreRing({ value, size = 160, stroke = 12, tone, label, children }: { value: number; size?: number; stroke?: number; tone: 'success' | 'danger' | 'warning' | 'primary'; label?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const reduce = useReducedMotion();
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--surface-2))" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`rgb(var(--${tone}))`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: reduce ? c * (1 - v / 100) : c }}
          animate={{ strokeDashoffset: c * (1 - v / 100) }}
          transition={{ duration: reduce ? 0 : 1.4, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="scrollbar-thin overflow-x-auto">
      <table className={cn('w-full text-sm', className)}>{children}</table>
    </div>
  );
}
export const Th = ({ children, className }: { children?: ReactNode; className?: string }) => (
  <th className={cn('whitespace-nowrap border-b border-border bg-surface-2/60 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted', className)}>{children}</th>
);
export const Td = ({ children, className, colSpan }: { children?: ReactNode; className?: string; colSpan?: number }) => (
  <td colSpan={colSpan} className={cn('border-b border-border px-4 py-3 align-middle', className)}>{children}</td>
);
