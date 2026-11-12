import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BookOpenCheck, Bot, Calculator, Copy, Download, FileSpreadsheet, FilterX, Image as ImageIcon, Plus, Search, Upload, Workflow } from 'lucide-react';
import { QUESTION_STATUSES, QUESTION_TYPES } from '@solar/shared';
import { useT } from '@/i18n';
import { api, download } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction, useGet } from '@/hooks/useApi';
import { Badge, Button, Card, Input, Select } from '@/components/ui/primitives';
import { EmptyState, PageHeader, Pagination, SkeletonRows, Table, Td, Th } from '@/components/ui/data';
import { DifficultyBadge, QuestionStatusBadge } from '@/components/domain';
import { fmtDate } from '@/lib/format';
import type { CategoryNode } from '../categories/CategoriesPage';
import type { QuestionListItem } from './types';
import { ImportDialog } from './ImportDialog';

interface Paged<T> { items: T[]; total: number; page: number; pages: number }

const FILTER_KEYS = ['q', 'categoryId', 'difficulty', 'type', 'status', 'isCalculation', 'isScenario', 'tag'] as const;

export default function QuestionsPage() {
  const { t } = useT();
  const { can } = useAuth();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const [importOpen, setImportOpen] = useState(false);
  const page = Number(sp.get('page') ?? 1);
  const cats = useGet<CategoryNode[]>(['categories'], '/categories');

  useEffect(() => {
    const h = setTimeout(() => {
      if ((sp.get('q') ?? '') !== q) update({ q });
    }, 350);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function update(patch: Record<string, string>) {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    if (!('page' in patch)) next.delete('page');
    setSp(next, { replace: true });
  }

  const params = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: '25', sort: 'code', dir: 'asc' });
    for (const k of FILTER_KEYS) if (sp.get(k)) p.set(k, sp.get(k)!);
    return p;
  }, [sp, page]);
  const { data, isLoading, isFetching } = useGet<Paged<QuestionListItem>>(['questions', params.toString()], `/questions?${params}`, { keepPrevious: true });
  const dup = useAction((id: string) => api<{ id: string }>(`/questions/${id}/duplicate`, { method: 'POST' }), { success: t('questions.duplicated'), invalidate: [['questions']], onSuccess: (r) => nav(`/cau-hoi/${r.id}/sua`) });
  const hasFilters = FILTER_KEYS.some((k) => sp.get(k));

  return (
    <div>
      <PageHeader
        title={t('questions.title')}
        subtitle={t('questions.subtitle')}
        icon={<BookOpenCheck className="h-5 w-5" />}
        actions={
          <>
            {can('questions.import') && <Button variant="outline" icon={<Upload className="h-4 w-4" />} onClick={() => setImportOpen(true)}>{t('questions.importExcel')}</Button>}
            {can('questions.export') && (
              <Button variant="outline" icon={<Download className="h-4 w-4" />} onClick={() => { const p = new URLSearchParams(params); p.delete('page'); p.delete('pageSize'); void download(`/questions/excel/export?${p}`, 'ngan-hang-cau-hoi.xlsx'); }}>
                {t('questions.exportExcel')}
              </Button>
            )}
            {can('questions.create') && <Button icon={<Plus className="h-4 w-4" />} onClick={() => nav('/cau-hoi/moi')}>{t('questions.newQuestion')}</Button>}
          </>
        }
      />

      <Card>
        <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-2 lg:grid-cols-6">
          <div className="relative sm:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
            <Input className="pl-9" placeholder={t('common.searchPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('common.search')} />
          </div>
          <Select value={sp.get('categoryId') ?? ''} onChange={(e) => update({ categoryId: e.target.value })} aria-label={t('questions.category')}>
            <option value="">{t('questions.category')}</option>
            {cats.data?.map((c) => (
              <optgroup key={c.id} label={`${c.code}. ${c.name}`}>
                <option value={c.id}>{c.code}. {c.name}</option>
                {c.children?.map((s) => <option key={s.id} value={s.id}>   {s.code} {s.name}</option>)}
              </optgroup>
            ))}
          </Select>
          <Select value={sp.get('difficulty') ?? ''} onChange={(e) => update({ difficulty: e.target.value })} aria-label={t('questions.difficulty')}>
            <option value="">{t('questions.difficulty')}</option>
            {[1, 2, 3, 4].map((d) => <option key={d} value={d}>{t(`difficulty.${d}`)}</option>)}
          </Select>
          <Select value={sp.get('type') ?? ''} onChange={(e) => update({ type: e.target.value })} aria-label={t('questions.type')}>
            <option value="">{t('questions.type')}</option>
            {QUESTION_TYPES.map((x) => <option key={x} value={x}>{t(`questionType.${x}`)}</option>)}
          </Select>
          <Select value={sp.get('status') ?? ''} onChange={(e) => update({ status: e.target.value })} aria-label={t('common.status')}>
            <option value="">{t('common.status')}</option>
            {QUESTION_STATUSES.map((x) => <option key={x} value={x}>{t(`questionStatus.${x}`)}</option>)}
          </Select>
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-6">
            <FilterChip active={sp.get('isCalculation') === 'true'} onClick={() => update({ isCalculation: sp.get('isCalculation') === 'true' ? '' : 'true' })} icon={<Calculator className="h-3.5 w-3.5" />}>{t('questions.calcBadge')}</FilterChip>
            <FilterChip active={sp.get('isScenario') === 'true'} onClick={() => update({ isScenario: sp.get('isScenario') === 'true' ? '' : 'true' })} icon={<Workflow className="h-3.5 w-3.5" />}>{t('questions.scenarioBadge')}</FilterChip>
            {sp.get('tag') && <FilterChip active onClick={() => update({ tag: '' })}># {sp.get('tag')}</FilterChip>}
            {hasFilters && <Button variant="ghost" size="sm" icon={<FilterX className="h-3.5 w-3.5" />} onClick={() => { setQ(''); setSp(new URLSearchParams(), { replace: true }); }}>{t('common.clearFilters')}</Button>}
            {isFetching && !isLoading && <span className="ml-auto text-xs text-muted">{t('common.loading')}</span>}
          </div>
        </div>

        {isLoading ? <SkeletonRows rows={8} /> : !data?.items.length ? (
          <EmptyState title={t('questions.emptyBank')} action={can('questions.create') && <Button icon={<Plus className="h-4 w-4" />} onClick={() => nav('/cau-hoi/moi')}>{t('questions.newQuestion')}</Button>} />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>{t('questions.questionCode')}</Th>
                  <Th>{t('questions.questionTitle')}</Th>
                  <Th className="hidden md:table-cell">{t('questions.category')}</Th>
                  <Th className="hidden lg:table-cell">{t('questions.difficulty')}</Th>
                  <Th className="hidden 2xl:table-cell">{t('questions.type')}</Th>
                  <Th>{t('common.status')}</Th>
                  <Th className="hidden xl:table-cell">{t('common.updatedAt')}</Th>
                  <Th className="text-right">{t('common.actions')}</Th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((it, i) => (
                  <motion.tr key={it.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 12) * 0.015 }} className="group cursor-pointer transition-colors hover:bg-surface-2/60" onClick={() => nav(`/cau-hoi/${it.id}`)}>
                    <Td className="whitespace-nowrap font-mono text-xs text-muted">{it.code}</Td>
                    <Td className="min-w-[280px]">
                      <p className="font-medium text-fg transition-colors group-hover:text-primary">{it.title}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {it.isCalculation && <Badge tone="info" icon={<Calculator className="h-3 w-3" />}>{t('questions.calcBadge')}</Badge>}
                        {it.isScenario && <Badge tone="solar" icon={<Workflow className="h-3 w-3" />}>{t('questions.scenarioBadge')}</Badge>}
                        {it._count.media > 0 && <Badge icon={<ImageIcon className="h-3 w-3" />}>{t('questions.diagramBadge')}</Badge>}
                        {it.isAiGenerated && <Badge tone="primary" icon={<Bot className="h-3 w-3" />}>{t('questions.aiBadge')}</Badge>}
                      </div>
                    </Td>
                    <Td className="hidden max-w-[220px] md:table-cell"><span className="font-semibold text-primary">{it.category.code}</span> <span className="text-muted">{it.subcategory?.name ?? it.category.name}</span></Td>
                    <Td className="hidden lg:table-cell"><DifficultyBadge level={it.difficulty} /></Td>
                    <Td className="hidden whitespace-nowrap text-muted 2xl:table-cell">{t(`questionType.${it.type}`)}</Td>
                    <Td><QuestionStatusBadge status={it.status} /></Td>
                    <Td className="hidden whitespace-nowrap text-xs text-muted xl:table-cell">{fmtDate(it.updatedAt)}<p>{it.author.fullName}</p></Td>
                    <Td className="text-right" >
                      {can('questions.create') && (
                        <Button variant="ghost" size="icon" title={t('common.duplicate')} aria-label={t('common.duplicate')} onClick={(e) => { e.stopPropagation(); dup.mutate(it.id); }}>
                          <Copy className="h-4 w-4" />
                        </Button>
                      )}
                    </Td>
                  </motion.tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={data.page} pages={data.pages} total={data.total} onPage={(p) => update({ page: String(p) })} />
          </>
        )}
      </Card>
      {importOpen && <ImportDialog onClose={() => setImportOpen(false)} />}
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted"><FileSpreadsheet className="h-3.5 w-3.5" /> {t('questions.importHint')}</p>
    </div>
  );
}

function FilterChip({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={active} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all duration-150 active:scale-95 ${active ? 'border-primary bg-primary-soft text-primary' : 'border-border text-muted hover:border-primary/40 hover:text-fg'}`}>
      {icon}
      {children}
    </button>
  );
}

