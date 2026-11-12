import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Building2, CheckCircle2, ClipboardCheck, Clock, Phone, Play, Shuffle, Target, User } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useT } from '@/i18n';
import { api, ApiError } from '@/lib/api';
import { Button, Card, Field, Input } from '@/components/ui/primitives';
import { Skeleton } from '@/components/ui/data';
import { BrandLogo } from '@/components/BrandLogo';
import { fmtDateTime } from '@/lib/format';

interface PublicExam { id: string; code: string; name: string; description: string | null; durationMinutes: number; passingScore: number; questionCount: number; maxAttempts: number; endAt: string | null }

/** Public exam entry: name, phone, department → random (or linked) exam. */
export default function GuestEntryPage() {
  const { code } = useParams();
  const { t } = useT();
  const nav = useNavigate();
  const qc = useQueryClient();
  const exams = useQuery({ queryKey: ['public-exams', code ?? 'all'], queryFn: () => (code ? api<PublicExam>(`/public/exams/${code}`).then((e) => [e]) : api<PublicExam[]>('/public/exams')), retry: false });
  // Not persisted: entry may happen on shared computers.
  const [f, setF] = useState({ fullName: '', phone: '', department: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const list = exams.data ?? [];
  const minutes = list.length ? Math.max(...list.map((e) => e.durationMinutes)) : 0;
  const questions = list.length ? Math.max(...list.map((e) => e.questionCount)) : 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setFormError('');
    try {
      const r = await api<{ attemptId: string }>(code ? `/public/exams/${code}/start` : '/public/start', { body: f });
      await qc.invalidateQueries({ queryKey: ['me'] });
      nav(`/thi/lam-bai/${r.attemptId}`);
    } catch (err) {
      if (err instanceof ApiError) {
        if (Object.keys(err.fieldErrors).length) setErrors(err.fieldErrors);
        else setFormError(err.message);
      } else setFormError(t('common.unknownError'));
      setBusy(false);
    }
  }

  const rules = t('guest.rules', { returnObjects: true }) as string[];
  return (
    <div className="min-h-screen bg-[radial-gradient(900px_500px_at_0%_0%,rgba(11,74,128,0.12),transparent),radial-gradient(800px_500px_at_100%_100%,rgba(132,189,63,0.14),transparent)]">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <div className="flex items-center gap-3">
          <BrandLogo size={44} />
          <div className="leading-tight">
            <p className="font-bold">{t('app.short')}</p>
            <p className="hidden text-xs text-muted sm:block">{t('app.name')}</p>
          </div>
        </div>
        <Link to="/dang-nhap" className="max-w-[45%] text-right text-sm font-medium text-primary hover:underline">{t('guest.staffLogin')}</Link>
      </header>

      <main className="mx-auto grid max-w-6xl gap-8 px-4 pb-16 pt-4 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-10">
        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl font-bold sm:text-4xl">{t('guest.title')}</h1>
          <p className="mt-2 text-muted">{t('guest.subtitle')}</p>
          {exams.isLoading ? <Skeleton className="mt-8 h-40 rounded-xl" /> : exams.isError || !list.length ? (
            <div className="mt-8 rounded-xl border border-warning/30 bg-warning-soft p-5 text-warning">{code ? t('guest.examNotOpen') : t('guest.noOpen')}</div>
          ) : (
            <>
              {code ? (
                <Card className="mt-8 p-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">{t('guest.directExam')}</p>
                  <p className="mt-1 text-lg font-semibold">{list[0]!.name}</p>
                  {list[0]!.description && <p className="mt-1 text-sm text-muted">{list[0]!.description}</p>}
                </Card>
              ) : (
                <div className="mt-8 flex gap-3 rounded-xl border border-primary/25 bg-primary-soft/50 p-4 text-sm">
                  <Shuffle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <p>{t('guest.randomNote', { count: list.length })}</p>
                </div>
              )}
              <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
                <Fact icon={<ClipboardCheck className="h-4 w-4" />} label={t('ui.nQuestions', { count: questions })} />
                <Fact icon={<Clock className="h-4 w-4" />} label={t('ui.nMinutes', { count: minutes })} />
                <Fact icon={<Target className="h-4 w-4" />} label={t('ui.passAt', { value: list[0]!.passingScore })} />
              </div>
              <ul className="mt-6 space-y-2.5">
                {rules.map((r, i) => (
                  <motion.li key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.06 }} className="flex gap-2.5 text-sm">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    <span>{r.replace('{{questions}}', String(questions)).replace('{{minutes}}', String(minutes))}</span>
                  </motion.li>
                ))}
              </ul>
              {code && list[0]!.endAt && <p className="mt-4 text-xs text-muted">{t('ui.deadline', { date: fmtDateTime(list[0]!.endAt) })}</p>}
            </>
          )}
        </motion.section>

        <motion.div className="order-first lg:order-none" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
          <Card className="p-6 shadow-lift sm:p-8">
            <form onSubmit={submit} className="space-y-5" noValidate>
              <Field label={t('guest.fullName')} error={errors.fullName} required>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
                  <Input className="pl-9" autoComplete="name" placeholder={t('guest.fullNamePh')} value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} invalid={!!errors.fullName} />
                </div>
              </Field>
              <Field label={t('guest.phone')} error={errors.phone} hint={t('guest.phoneHint')} required>
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
                  <Input className="pl-9" type="tel" inputMode="tel" autoComplete="tel" placeholder={t('guest.phonePh')} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} invalid={!!errors.phone} />
                </div>
              </Field>
              <Field label={t('guest.department')} error={errors.department} required>
                <div className="relative">
                  <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
                  <Input className="pl-9" autoComplete="organization" placeholder={t('guest.departmentPh')} value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} invalid={!!errors.department} />
                </div>
              </Field>
              {formError && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">{formError}</motion.p>}
              <Button type="submit" size="lg" className="w-full" icon={<Play className="h-4 w-4" />} loading={busy} disabled={!list.length || !f.fullName || !f.phone || !f.department}>
                {busy ? t('guest.starting') : t('guest.start')}
              </Button>
            </form>
          </Card>
        </motion.div>
      </main>
    </div>
  );
}

function Fact({ icon, label }: { icon: React.ReactNode; label: string }) {
  return <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5"><span className="text-primary">{icon}</span>{label}</div>;
}
