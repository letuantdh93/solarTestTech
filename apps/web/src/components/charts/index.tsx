/**
 * Chart building blocks (Recharts) with Vietnamese labels/tooltips.
 * Colour rules: magnitude = single primary hue; correct/incorrect = status colours
 * that always ship with text labels; recessive grid; tooltip on every chart.
 */
import { useEffect, useState, type ReactNode } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis,
  Radar, RadarChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, LabelList,
} from 'recharts';
import { useReducedMotion } from 'framer-motion';
import { fmtNum } from '@/lib/format';

const TOKENS = ['primary', 'success', 'danger', 'warning', 'info', 'solar', 'border', 'muted', 'subtle', 'surface', 'fg', 'surface-2'] as const;
type Tok = (typeof TOKENS)[number];

function readTokens(): Record<Tok, string> {
  const cs = getComputedStyle(document.documentElement);
  const out = {} as Record<Tok, string>;
  for (const t of TOKENS) out[t] = `rgb(${cs.getPropertyValue(`--${t}`).trim().split(/\s+/).join(',')})`;
  return out;
}

/** Resolved theme colours; updates when the dark class toggles. */
export function useChartColors() {
  const [c, setC] = useState(readTokens);
  useEffect(() => {
    const obs = new MutationObserver(() => setC(readTokens()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return c;
}

export function useChartAnim() {
  const reduce = useReducedMotion();
  return { isAnimationActive: !reduce, animationDuration: 900, animationEasing: 'ease-out' as const };
}

function TipBox({ title, rows }: { title?: ReactNode; rows: Array<{ label: ReactNode; value: ReactNode; color?: string }> }) {
  return (
    <div className="card min-w-[160px] px-3 py-2 text-xs shadow-lift">
      {title && <p className="mb-1 font-semibold text-fg">{title}</p>}
      {rows.map((r, i) => (
        <p key={i} className="flex items-center justify-between gap-4 text-muted">
          <span className="flex items-center gap-1.5">
            {r.color && <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />}
            {r.label}
          </span>
          <span className="num font-semibold text-fg">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

const axisTick = (color: string) => ({ fill: color, fontSize: 12 });

/** Horizontal bars for category magnitudes (single hue, values labelled at bar end). */
export function HBarChart({ data, valueLabel, unit = '', height, max, colorBy }: {
  data: Array<{ name: string; value: number; hint?: string }>;
  valueLabel: string;
  unit?: string;
  height?: number;
  max?: number;
  colorBy?: (v: number) => 'success' | 'warning' | 'danger' | 'primary';
}) {
  const c = useChartColors();
  const anim = useChartAnim();
  const h = height ?? Math.max(160, data.length * 34 + 30);
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 44, left: 4, bottom: 4 }} barCategoryGap={6}>
        <CartesianGrid horizontal={false} stroke={c.border} strokeDasharray="3 3" />
        <XAxis type="number" domain={[0, max ?? 'auto']} tick={axisTick(c.subtle)} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" width={230} tick={axisTick(c.muted)} axisLine={false} tickLine={false} />
        <Tooltip
          cursor={{ fill: c['surface-2'] }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <TipBox title={(payload[0]!.payload as { hint?: string; name: string }).hint ?? payload[0]!.payload.name} rows={[{ label: valueLabel, value: `${fmtNum(payload[0]!.value as number)}${unit}` }]} />
            ) : null
          }
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={22} {...anim}>
          {data.map((d, i) => (
            <Cell key={i} fill={c[colorBy ? colorBy(d.value) : 'primary']} />
          ))}
          <LabelList dataKey="value" position="right" formatter={(v: number) => `${fmtNum(v)}${unit}`} style={{ fill: c.muted, fontSize: 12 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Vertical bars (e.g. difficulty levels). */
export function VBarChart({ data, valueLabel, unit = '', height = 220, colorBy, max }: {
  data: Array<{ name: string; value: number; hint?: string }>;
  valueLabel: string;
  unit?: string;
  height?: number;
  max?: number;
  colorBy?: (v: number) => 'success' | 'warning' | 'danger' | 'primary';
}) {
  const c = useChartColors();
  const anim = useChartAnim();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 20, right: 8, left: -12, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke={c.border} strokeDasharray="3 3" />
        <XAxis dataKey="name" tick={axisTick(c.muted)} axisLine={false} tickLine={false} interval={0} />
        <YAxis domain={[0, max ?? 'auto']} tick={axisTick(c.subtle)} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: c['surface-2'] }}
          content={({ active, payload }) =>
            active && payload?.length ? <TipBox title={(payload[0]!.payload as { hint?: string; name: string }).hint ?? payload[0]!.payload.name} rows={[{ label: valueLabel, value: `${fmtNum(payload[0]!.value as number)}${unit}` }]} /> : null
          }
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={48} {...anim}>
          {data.map((d, i) => (
            <Cell key={i} fill={c[colorBy ? colorBy(d.value) : 'primary']} />
          ))}
          <LabelList dataKey="value" position="top" formatter={(v: number) => `${fmtNum(v)}${unit}`} style={{ fill: c.muted, fontSize: 12 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Single-series radar for technical competency (0–100%). */
export function CompetencyRadar({ data, height = 300, label }: { data: Array<{ name: string; value: number; full?: string }>; height?: number; label: string }) {
  const c = useChartColors();
  const anim = useChartAnim();
  if (data.length < 3) return <HBarChart data={data} valueLabel={label} unit="%" max={100} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={data} outerRadius="72%">
        <PolarGrid stroke={c.border} />
        <PolarAngleAxis dataKey="name" tick={{ fill: c.muted, fontSize: 11 }} />
        <PolarRadiusAxis domain={[0, 100]} tick={{ fill: c.subtle, fontSize: 10 }} axisLine={false} tickCount={5} />
        <Radar dataKey="value" stroke={c.primary} fill={c.primary} fillOpacity={0.18} strokeWidth={2} dot={{ r: 4, fill: c.primary, stroke: c.surface, strokeWidth: 2 }} {...anim} />
        <Tooltip content={({ active, payload }) => (active && payload?.length ? <TipBox title={(payload[0]!.payload as { full?: string; name: string }).full ?? payload[0]!.payload.name} rows={[{ label, value: `${fmtNum(payload[0]!.value as number, 1)}%` }]} /> : null)} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

/** Single-series trend line with optional reference line (e.g. pass mark). */
export function TrendLine({ data, label, unit = '%', height = 240, reference, referenceLabel, max = 100 }: {
  data: Array<{ name: string; value: number; hint?: string }>;
  label: string;
  unit?: string;
  height?: number;
  reference?: number;
  referenceLabel?: string;
  max?: number;
}) {
  const c = useChartColors();
  const anim = useChartAnim();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 12, right: 16, left: -12, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={c.border} strokeDasharray="3 3" />
        <XAxis dataKey="name" tick={axisTick(c.muted)} axisLine={false} tickLine={false} />
        <YAxis domain={[0, max]} tick={axisTick(c.subtle)} axisLine={false} tickLine={false} />
        {reference != null && <ReferenceLine y={reference} stroke={c.warning} strokeDasharray="5 5" label={{ value: referenceLabel, fill: c.warning, fontSize: 11, position: 'insideTopRight' }} />}
        <Tooltip
          cursor={{ stroke: c.subtle, strokeDasharray: '3 3' }}
          content={({ active, payload }) => (active && payload?.length ? <TipBox title={(payload[0]!.payload as { hint?: string; name: string }).hint ?? payload[0]!.payload.name} rows={[{ label, value: `${fmtNum(payload[0]!.value as number, 1)}${unit}`, color: c.primary }]} /> : null)}
        />
        <Line type="monotone" dataKey="value" stroke={c.primary} strokeWidth={2} dot={{ r: 4, fill: c.primary, stroke: c.surface, strokeWidth: 2 }} activeDot={{ r: 6 }} {...anim} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Donut for a part-to-whole of status values (correct / incorrect / unanswered). */
export function StatusDonut({ data, height = 200, center }: { data: Array<{ name: string; value: number; tone: 'success' | 'danger' | 'subtle' | 'warning' | 'primary' }>; height?: number; center?: ReactNode }) {
  const c = useChartColors();
  const anim = useChartAnim();
  const total = data.reduce((a, b) => a + b.value, 0);
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative" style={{ width: height, height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="92%" paddingAngle={data.filter((d) => d.value).length > 1 ? 2 : 0} stroke={c.surface} strokeWidth={2} startAngle={90} endAngle={-270} {...anim}>
              {data.map((d, i) => (
                <Cell key={i} fill={c[d.tone]} />
              ))}
            </Pie>
            <Tooltip content={({ active, payload }) => (active && payload?.length ? <TipBox rows={[{ label: payload[0]!.name, value: `${payload[0]!.value} (${fmtNum(((payload[0]!.value as number) / (total || 1)) * 100, 0)}%)`, color: c[(payload[0]!.payload as { tone: Tok }).tone] }]} /> : null)} />
          </PieChart>
        </ResponsiveContainer>
        {center && <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">{center}</div>}
      </div>
      <ul className="space-y-2 text-sm">
        {data.map((d) => (
          <li key={d.name} className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm" style={{ background: c[d.tone] }} />
            <span className="text-muted">{d.name}</span>
            <span className="num ml-auto pl-4 font-semibold">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export const scoreTone = (v: number): 'success' | 'warning' | 'danger' => (v >= 70 ? 'success' : v >= 50 ? 'warning' : 'danger');
