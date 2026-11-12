import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, ShieldAlert } from 'lucide-react';
import { useT } from '@/i18n';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, Card, Field, Input } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/data';
import { useToast } from '@/components/ui/feedback';

export default function ChangePasswordPage() {
  const { t } = useT();
  const { me, refresh } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [f, setF] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (f.newPassword !== f.confirm) return setErrors({ confirm: t('auth.passwordMismatch') });
    setBusy(true);
    setErrors({});
    try {
      await api('/auth/change-password', { body: { currentPassword: f.currentPassword, newPassword: f.newPassword } });
      toast.success(t('auth.passwordChanged'));
      await refresh();
      nav('/');
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(Object.keys(err.fieldErrors).length ? err.fieldErrors : { currentPassword: err.message });
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title={t('auth.changePassword')} icon={<KeyRound className="h-5 w-5" />} />
      {me?.mustChangePassword && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-soft p-4 text-sm text-warning">
          <ShieldAlert className="h-5 w-5 shrink-0" /> {t('auth.mustChange')}
        </div>
      )}
      <Card className="p-6">
        <form onSubmit={submit} className="space-y-4">
          <Field label={t('auth.currentPassword')} error={errors.currentPassword} required>
            <Input type="password" autoComplete="current-password" value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} invalid={!!errors.currentPassword} />
          </Field>
          <Field label={t('auth.newPassword')} error={errors.newPassword} hint={t('auth.passwordRule')} required>
            <Input type="password" autoComplete="new-password" value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} invalid={!!errors.newPassword} />
          </Field>
          <Field label={t('auth.confirmPassword')} error={errors.confirm} required>
            <Input type="password" autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} invalid={!!errors.confirm} />
          </Field>
          <Button type="submit" loading={busy} className="w-full">{t('common.save')}</Button>
        </form>
      </Card>
    </div>
  );
}
