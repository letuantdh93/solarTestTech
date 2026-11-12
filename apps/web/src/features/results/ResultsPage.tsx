import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileSpreadsheet, Search, Trophy } from 'lucide-react';
import { useT } from '@/i18n';
import { download } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useGet } from '@/hooks/useApi';
import { Badge, Button, Card, Input, Select } from '@/components/ui/primitives';
import { EmptyState, PageHeader, Pagination, SkeletonRows, Table, Td, Th } from '@/components/ui/data';
import { PassBadge } from '@/components/domain';
import { scoreTone } from '@/components/charts';
import { cn, fmtDateTime, fmtDuration, fmtPct } from '@/lib/format';

interface Row { id: string; attemptId: string; user: { fullName: string; username: string; phone: string | null; department: string | null }; exam: { code: string; name: string }; attemptNo: number; status: string; submittedAt: string; scorePercent: number; correctCount: number; incorrectCount: number; unansweredCount: number; durationSeconds: number; passed: boolean }

export default function ResultsPage() {
  const { t } = useT();
  const { can } = useAuth();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [deb, setDeb] = useState('');
  const [examId, setExamId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [passed, setPassed] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => { const h = setTimeout(() => { setDeb(q); setPage(1); }, 300); return () => clearTimeout(h); }, [q]);
  const filters = new URLSearchParams({ ...(deb ? { q: deb } : {}), ...(examId ? { examId } : {}), ...(groupId ? { groupId } : {}), ...(passed ? { passed } : {}) });
  const qs = new URLSearchParams(filters);
  qs.set('page', String(page));
  const { data, isLoading } = useGet<{ items: Row[]; total: number; page: number; pages: number }>(['results', qs.toString()], `/results?${qs}`, { keepPrevious: true });
  const exams = useGet<{ items: Array<{ id: string; code: string; name: string }> }>(['exams', 'all-for-filter'], '/exams?pageSize=200');
  const groups = useGet<Array<{ id: string; name: string }>>(['groups'], '/groups');
  return (
    <div>
      <PageHeader title={t('results.title')} subtitle={t('results.subtitle')} icon={<Trophy className="h-5 w-5" />}
        actions={can('results.export') && <Button variant="outline" icon={<FileSpreadsheet className="h-4 w-4" />} onClick={() => void download(`/results/export.xlsx?${filters}`, 'ket-qua-thi.xlsx')}>{t('common.exportExcel')}</Button>} />
      <Card>
        <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative lg:col-span-2"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" /><Input className="pl-9" placeholder={t('common.searchPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Select value={examId} onChange={(e) => { setExamId(e.target.value); setPage(1); }} aria-label={t('results.filterExam')}><option value="">{t('results.filterExam')}</option>{exams.data?.items.map((e) => <option key={e.id} value={e.id}>{e.code} – {e.name}</option>)}</Select>
          <Select value={groupId} onChange={(e) => { setGroupId(e.target.value); setPage(1); }} aria-label={t('results.filterGroup')}><option value="">{t('results.filterGroup')}</option>{groups.data?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select>
          <Select value={passed} onChange={(e) => { setPassed(e.target.value); setPage(1); }} aria-label={t('common.status')}><option value="">{t('common.status')}</option><option value="true">{t('results.passed')}</option><option value="false">{t('results.failed')}</option></Select>
        </div>
        {isLoading ? <SkeletonRows rows={8} /> : !data?.items.length ? <EmptyState title={t('results.noResults')} /> : (
          <>
            <Table>
              <thead><tr><Th>{t('results.candidate')}</Th><Th className="hidden md:table-cell">{t('results.exam')}</Th><Th className="text-right">{t('results.score')}</Th><Th className="hidden lg:table-cell">{t('ui.correctWrongSkip')}</Th><Th className="hidden lg:table-cell">{t('results.duration')}</Th><Th>{t('common.status')}</Th><Th className="hidden xl:table-cell">{t('results.submittedAt')}</Th></tr></thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r.id} className="cursor-pointer transition-colors hover:bg-surface-2/60" onClick={() => nav(`/ket-qua/luot/${r.attemptId}`)}>
                    <Td><p className="font-medium">{r.user.fullName}</p><p className="text-xs text-muted">{[r.user.department, r.user.phone].filter(Boolean).join(' · ')}</p></Td>
                    <Td className="hidden max-w-[260px] md:table-cell"><p className="truncate">{r.exam.name}</p><p className="font-mono text-xs text-muted">{r.exam.code} · {t('results.attemptNo')} {r.attemptNo}</p></Td>
                    <Td className={cn('num text-right text-base font-bold', `text-${scoreTone(r.scorePercent)}`)}>{fmtPct(r.scorePercent)}</Td>
                    <Td className="num hidden text-sm lg:table-cell"><span className="text-success">{r.correctCount}</span> / <span className="text-danger">{r.incorrectCount}</span> / <span className="text-muted">{r.unansweredCount}</span></Td>
                    <Td className="hidden text-xs text-muted lg:table-cell">{fmtDuration(r.durationSeconds)}{r.status === 'AUTO_SUBMITTED' && <Badge tone="warning" className="ml-1">{t('ui.timeUp')}</Badge>}</Td>
                    <Td><PassBadge passed={r.passed} /></Td>
                    <Td className="hidden text-xs text-muted xl:table-cell">{fmtDateTime(r.submittedAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
