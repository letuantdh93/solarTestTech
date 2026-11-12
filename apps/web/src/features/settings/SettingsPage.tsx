import { useEffect, useState } from 'react';
import { Bot, CheckCircle2, ClipboardList, Settings, Shield, XCircle } from 'lucide-react';
import { useT } from '@/i18n';
import { api } from '@/lib/api';
import { useAction, useGet } from '@/hooks/useApi';
import { Button, Card, CardHeader, Field, Input, Switch } from '@/components/ui/primitives';
import { PageHeader, SkeletonRows } from '@/components/ui/data';

interface S { organizationName: string; defaultDurationMinutes: number; defaultPassingScore: number; sessionTimeoutMinutes: number; aiEnabled: boolean; aiModel: string; similarityThreshold: number; aiConfigured: boolean }

export default function SettingsPage() {
  const { t } = useT();
  const { data } = useGet<S>(['settings'], '/settings');
  const [f, setF] = useState<S | null>(null);
  useEffect(() => { if (data) setF(data); }, [data]);
  const save = useAction(() => { const { aiConfigured: _a, ...body } = f!; return api('/settings', { method: 'PUT', body }); }, { success: t('settings.saved'), invalidate: [['settings']] });
  if (!f) return <Card><SkeletonRows /></Card>;
  const num = (k: keyof S) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: Number(e.target.value) });
  return (
    <div className="max-w-3xl">
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} icon={<Settings className="h-5 w-5" />} actions={<Button loading={save.isPending} onClick={() => save.mutate(undefined)}>{t('common.save')}</Button>} />
      <div className="space-y-6">
        <Card>
          <CardHeader title={t('settings.general')} icon={<Settings className="h-5 w-5" />} />
          <div className="p-5"><Field label={t('settings.organizationName')}><Input value={f.organizationName} onChange={(e) => setF({ ...f, organizationName: e.target.value })} /></Field></div>
        </Card>
        <Card>
          <CardHeader title={t('settings.examDefaults')} icon={<ClipboardList className="h-5 w-5" />} />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label={t('settings.defaultDuration')}><Input type="number" min={1} value={f.defaultDurationMinutes} onChange={num('defaultDurationMinutes')} /></Field>
            <Field label={t('settings.defaultPassing')}><Input type="number" min={0} max={100} value={f.defaultPassingScore} onChange={num('defaultPassingScore')} /></Field>
            <Field label={t('settings.similarityThreshold')} hint="0,3 – 0,99"><Input type="number" step={0.05} min={0.3} max={0.99} value={f.similarityThreshold} onChange={num('similarityThreshold')} /></Field>
          </div>
        </Card>
        <Card>
          <CardHeader title={t('settings.security')} icon={<Shield className="h-5 w-5" />} />
          <div className="p-5"><Field label={t('settings.sessionTimeout')}><Input type="number" min={15} value={f.sessionTimeoutMinutes} onChange={num('sessionTimeoutMinutes')} /></Field></div>
        </Card>
        <Card>
          <CardHeader title={t('settings.aiSection')} icon={<Bot className="h-5 w-5" />} />
          <div className="space-y-4 p-5">
            <p className={`flex items-center gap-2 text-sm ${f.aiConfigured ? 'text-success' : 'text-warning'}`}>
              {f.aiConfigured ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              {f.aiConfigured ? t('settings.aiConfigured') : t('settings.aiNotConfigured')}
            </p>
            <Switch checked={f.aiEnabled} onChange={(aiEnabled) => setF({ ...f, aiEnabled })} label={t('settings.aiEnabled')} />
            <Field label={t('settings.aiModel')}><Input value={f.aiModel} onChange={(e) => setF({ ...f, aiModel: e.target.value })} /></Field>
          </div>
        </Card>
      </div>
    </div>
  );
}
