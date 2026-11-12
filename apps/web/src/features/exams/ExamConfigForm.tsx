import { EXPLANATION_VISIBILITY, RESULT_VISIBILITY } from '@solar/shared';
import { useT } from '@/i18n';
import { Field, Input, Select, Switch, Textarea } from '@/components/ui/primitives';

export interface ExamConfig {
  name: string; description: string; targetAudience: string; examCategory: string;
  durationMinutes: number; passingScore: number; randomizeQuestions: boolean; randomizeOptions: boolean; maxAttempts: number;
  startAt: string; endAt: string; resultVisibility: (typeof RESULT_VISIBILITY)[number]; explanationVisibility: (typeof EXPLANATION_VISIBILITY)[number];
}

export const defaultConfig = (): ExamConfig => ({
  name: '', description: '', targetAudience: '', examCategory: '', durationMinutes: 60, passingScore: 70,
  randomizeQuestions: true, randomizeOptions: true, maxAttempts: 1, startAt: '', endAt: '', resultVisibility: 'DETAILED', explanationVisibility: 'AFTER_SUBMIT',
});

/** datetime-local <-> ISO helpers (local time). */
export const toLocalInput = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const configToPayload = (c: ExamConfig) => ({
  ...c,
  description: c.description || null,
  targetAudience: c.targetAudience || null,
  examCategory: c.examCategory || null,
  startAt: c.startAt ? new Date(c.startAt).toISOString() : null,
  endAt: c.endAt ? new Date(c.endAt).toISOString() : null,
});

export function ExamConfigForm({ value, onChange, errors = {} }: { value: ExamConfig; onChange: (v: ExamConfig) => void; errors?: Record<string, string> }) {
  const { t } = useT();
  const set = <K extends keyof ExamConfig>(k: K, v: ExamConfig[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field className="md:col-span-2" label={t('exams.name')} error={errors.name} required><Input value={value.name} onChange={(e) => set('name', e.target.value)} invalid={!!errors.name} /></Field>
      <Field className="md:col-span-2" label={t('exams.description')}><Textarea value={value.description} onChange={(e) => set('description', e.target.value)} /></Field>
      <Field label={t('exams.targetAudience')}><Input value={value.targetAudience} onChange={(e) => set('targetAudience', e.target.value)} placeholder={t('ui.audiencePlaceholder')} /></Field>
      <Field label={t('exams.examCategory')}><Input value={value.examCategory} onChange={(e) => set('examCategory', e.target.value)} placeholder={t('ui.examCategoryPlaceholder')} /></Field>
      <Field label={t('exams.duration')} error={errors.durationMinutes} required><Input type="number" min={1} max={600} value={value.durationMinutes} onChange={(e) => set('durationMinutes', Number(e.target.value))} /></Field>
      <Field label={t('exams.passingScore')} error={errors.passingScore} required><Input type="number" min={0} max={100} value={value.passingScore} onChange={(e) => set('passingScore', Number(e.target.value))} /></Field>
      <Field label={t('exams.maxAttempts')}><Input type="number" min={1} max={20} value={value.maxAttempts} onChange={(e) => set('maxAttempts', Number(e.target.value))} /></Field>
      <div className="flex flex-col justify-end gap-3 pb-1">
        <Switch checked={value.randomizeQuestions} onChange={(v) => set('randomizeQuestions', v)} label={t('exams.randomizeQuestions')} />
        <Switch checked={value.randomizeOptions} onChange={(v) => set('randomizeOptions', v)} label={t('exams.randomizeOptions')} />
      </div>
      <Field label={t('exams.startAt')}><Input type="datetime-local" value={value.startAt} onChange={(e) => set('startAt', e.target.value)} /></Field>
      <Field label={t('exams.endAt')} error={errors.endAt}><Input type="datetime-local" value={value.endAt} onChange={(e) => set('endAt', e.target.value)} invalid={!!errors.endAt} /></Field>
      <Field label={t('exams.resultVisibility')}>
        <Select value={value.resultVisibility} onChange={(e) => set('resultVisibility', e.target.value as ExamConfig['resultVisibility'])}>
          {RESULT_VISIBILITY.map((v) => <option key={v} value={v}>{t(`resultVisibility.${v}`)}</option>)}
        </Select>
      </Field>
      <Field label={t('exams.explanationVisibility')}>
        <Select value={value.explanationVisibility} onChange={(e) => set('explanationVisibility', e.target.value as ExamConfig['explanationVisibility'])}>
          {EXPLANATION_VISIBILITY.map((v) => <option key={v} value={v}>{t(`explanationVisibility.${v}`)}</option>)}
        </Select>
      </Field>
    </div>
  );
}
