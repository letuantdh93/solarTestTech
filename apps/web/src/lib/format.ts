import i18n from '@/i18n';
const nf = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });
export const fmtNum = (n: number | null | undefined, digits?: number) =>
  n == null || Number.isNaN(n)
    ? '—'
    : digits != null
      ? new Intl.NumberFormat('vi-VN', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n)
      : nf.format(n);
export const fmtPct = (n: number | null | undefined, digits = 1) => (n == null ? '—' : `${fmtNum(n, digits)}%`);
export const fmtDate = (d: string | Date | null | undefined) =>
  d ? new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(d)) : '—';
export const fmtDateTime = (d: string | Date | null | undefined) =>
  d
    ? new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(d))
    : '—';
export function fmtDuration(sec: number | null | undefined) {
  if (sec == null) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h) return i18n.t('ui.durHM', { h, m });
  if (m) return i18n.t('ui.durMS', { m, s: s.toString().padStart(2, '0') });
  return i18n.t('ui.durS', { s });
}
export function fmtClock(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = m.toString().padStart(2, '0');
  const ss = r.toString().padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
/** Parse Vietnamese-style decimal input ("53,5" or "53.5"). */
export function parseDecimal(s: string): number | null {
  const t = s.trim().replace(/\s/g, '').replace(',', '.');
  if (!t || !/^-?\d*\.?\d+(e-?\d+)?$/i.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
export const cn = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');
