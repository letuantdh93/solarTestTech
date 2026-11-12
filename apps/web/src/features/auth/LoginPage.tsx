import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BarChart3, Lock, ShieldCheck, User, Wand2 } from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';
import { useQueryClient } from '@tanstack/react-query';
import { useT } from '@/i18n';
import { api, ApiError } from '@/lib/api';
import { Button, Field, Input } from '@/components/ui/primitives';

/** Decorative animated PV array (pure SVG, respects reduced motion via MotionConfig). */
function PvArt() {
  return (
    <svg viewBox="0 0 400 260" className="w-full max-w-md" aria-hidden>
      <defs>
        <linearGradient id="panel" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1e3a8a" />
          <stop offset="1" stopColor="#0b1324" />
        </linearGradient>
        <radialGradient id="sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fde68a" />
          <stop offset="1" stopColor="#f59e0b" />
        </radialGradient>
      </defs>
      <motion.circle cx="320" cy="60" r="34" fill="url(#sun)" animate={{ scale: [1, 1.06, 1] }} transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }} />
      {Array.from({ length: 8 }).map((_, i) => (
        <motion.line key={i} x1="320" y1="60" x2={320 + Math.cos((i * Math.PI) / 4) * 58} y2={60 + Math.sin((i * Math.PI) / 4) * 58} stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.15 }} />
      ))}
      {[0, 1, 2].map((row) =>
        [0, 1, 2, 3].map((col) => (
          <motion.g key={`${row}-${col}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + (row * 4 + col) * 0.05 }}>
            <polygon
              points={`${40 + col * 70 + row * 18},${130 + row * 38} ${100 + col * 70 + row * 18},${130 + row * 38} ${112 + col * 70 + row * 18},${162 + row * 38} ${52 + col * 70 + row * 18},${162 + row * 38}`}
              fill="url(#panel)"
              stroke="#3b82f6"
              strokeOpacity="0.5"
            />
            <line x1={70 + col * 70 + row * 18} y1={130 + row * 38} x2={82 + col * 70 + row * 18} y2={162 + row * 38} stroke="#60a5fa" strokeOpacity="0.35" />
          </motion.g>
        )),
      )}
      <motion.path d="M30 250 C 120 230, 220 250, 380 236" stroke="#f59e0b" strokeWidth="2" fill="none" strokeDasharray="6 8" animate={{ strokeDashoffset: [0, -56] }} transition={{ duration: 3, repeat: Infinity, ease: 'linear' }} />
    </svg>
  );
}

export function LoginPage() {
  const { t } = useT();
  const qc = useQueryClient();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api('/auth/login', { body: { username, password } });
      await qc.invalidateQueries({ queryKey: ['me'] });
      nav(loc.state?.from && loc.state.from !== '/dang-nhap' ? loc.state.from : '/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.unknownError'));
    } finally {
      setBusy(false);
    }
  }

  const features = t('auth.features', { returnObjects: true }) as string[];
  const fIcons = [<ShieldCheck key={0} className="h-4 w-4" />, <Wand2 key={1} className="h-4 w-4" />, <BarChart3 key={2} className="h-4 w-4" />];

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-sidebar lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_400px_at_80%_10%,rgba(132,189,63,0.16),transparent),radial-gradient(700px_500px_at_10%_90%,rgba(11,74,128,0.45),transparent)]" />
        <div className="relative flex items-center gap-3">
          <BrandLogo size={52} />
          <div>
            <p className="font-bold text-white">{t('app.short')}</p>
            <p className="text-xs text-sidebar-muted">{t('app.subtitle')}</p>
          </div>
        </div>
        <div className="relative">
          <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="max-w-lg text-4xl font-bold leading-tight text-white">
            {t('app.name')}
          </motion.h1>
          <p className="mt-3 max-w-md text-sidebar-muted">{t('app.tagline')}</p>
          <ul className="mt-8 space-y-3">
            {features.map((f, i) => (
              <motion.li key={f} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.1 }} className="flex items-center gap-3 text-sm text-sidebar-fg">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-solar">{fIcons[i]}</span>
                {f}
              </motion.li>
            ))}
          </ul>
        </div>
        <div className="relative">
          <PvArt />
        </div>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12">
        <motion.form
          onSubmit={submit}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-sm"
          noValidate
        >
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BrandLogo size={44} />
            <p className="font-bold">{t('app.short')}</p>
          </div>
          <h2 className="text-2xl font-bold">{t('auth.welcome')}</h2>
          <p className="mt-1 text-sm text-muted">{t('auth.loginSubtitle')}</p>
          <div className="mt-8 space-y-4">
            <Field label={t('auth.username')}>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
                <Input className="pl-9" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
              </div>
            </Field>
            <Field label={t('auth.password')}>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
                <Input className="pl-9" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
            </Field>
            {error && (
              <motion.p initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: [0, -4, 4, -2, 0] }} className="rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
                {error}
              </motion.p>
            )}
            <Button type="submit" className="w-full" size="lg" loading={busy} disabled={!username || !password}>
              {busy ? t('auth.loggingIn') : t('auth.login')}
            </Button>
            <Link to="/vao-thi" className="block rounded-lg border border-dashed border-primary/40 px-4 py-3 text-center text-sm font-medium text-primary transition-colors hover:bg-primary-soft/40">
              {t('guest.candidateEntry')} →
            </Link>
          </div>
        </motion.form>
      </div>
    </div>
  );
}
