import { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, SkipForward, XCircle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useT } from '@/i18n';
import { api, ApiError, download } from '@/lib/api';
import { Badge, Button } from '@/components/ui/primitives';
import { Dialog, useToast } from '@/components/ui/feedback';
import { Table, Td, Th } from '@/components/ui/data';

interface Row { row: number; code?: string; title?: string; status: 'ok' | 'error' | 'skipped'; errors: string[]; warnings: string[] }
interface Result { dryRun: boolean; total: number; ok: number; errors: number; skipped: number; rows: Row[] }

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const toast = useToast();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(dryRun: boolean) {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const r = await api<Result>(`/questions/excel/import?dryRun=${dryRun}`, { form });
      setResult(r);
      if (!dryRun) {
        toast.success(`${t('questions.importResult')}: ${r.ok} ${t('questions.importedCount')}`);
        void qc.invalidateQueries({ queryKey: ['questions'] });
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t('common.unknownError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      size="xl"
      title={t('questions.importTitle')}
      description={t('questions.importHint')}
      footer={
        <>
          <Button variant="ghost" icon={<Download className="h-4 w-4" />} onClick={() => void download('/questions/excel/template', 'mau-nhap-cau-hoi.xlsx')} className="mr-auto">{t('questions.downloadTemplate')}</Button>
          <Button variant="secondary" onClick={onClose}>{t('common.close')}</Button>
          <Button variant="outline" disabled={!file} loading={busy && !result?.dryRun} onClick={() => void run(true)}>{t('questions.importDryRun')}</Button>
          <Button disabled={!file || !result || result.ok === 0 || !result.dryRun} loading={busy} onClick={() => void run(false)}>{t('questions.importRun')}</Button>
        </>
      }
    >
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-surface-2/40 px-6 py-8 text-center transition-colors hover:border-primary/50 hover:bg-primary-soft/30"
      >
        <FileSpreadsheet className="h-8 w-8 text-success" />
        <span className="text-sm font-medium">{file ? file.name : t('questions.selectFile')}</span>
      </button>
      <input ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }} />

      {result && (
        <div className="mt-5">
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge tone="success" icon={<CheckCircle2 className="h-3 w-3" />}>{result.ok} {t('questions.importedCount')}</Badge>
            <Badge tone="danger" icon={<XCircle className="h-3 w-3" />}>{result.errors} {t('questions.importErrors')}</Badge>
            <Badge icon={<SkipForward className="h-3 w-3" />}>{t('ui.nSkipped', { count: result.skipped })}</Badge>
            {result.dryRun && <Badge tone="info">{t('questions.importDryRun')}</Badge>}
          </div>
          <div className="max-h-[45vh] overflow-y-auto rounded-lg border border-border">
            <Table>
              <thead><tr><Th>{t('questions.row')}</Th><Th>{t('questions.questionTitle')}</Th><Th>{t('common.status')}</Th><Th>{t('common.details')}</Th></tr></thead>
              <tbody>
                {result.rows.map((r) => (
                  <tr key={r.row}>
                    <Td className="num">{r.row}</Td>
                    <Td className="max-w-[260px]"><p className="truncate">{r.title}</p>{r.code && <p className="font-mono text-xs text-muted">{r.code}</p>}</Td>
                    <Td>{r.status === 'ok' ? <Badge tone="success">{t('ui.valid')}</Badge> : r.status === 'error' ? <Badge tone="danger">{t('ui.error')}</Badge> : <Badge>{t('ui.skipped')}</Badge>}</Td>
                    <Td className="text-xs">
                      {r.errors.map((e, i) => <p key={i} className="flex gap-1 text-danger"><XCircle className="mt-0.5 h-3 w-3 shrink-0" />{e}</p>)}
                      {r.warnings.map((w, i) => <p key={i} className="flex gap-1 text-warning"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{w}</p>)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </div>
      )}
    </Dialog>
  );
}
