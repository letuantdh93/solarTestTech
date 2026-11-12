import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, FolderTree, Pencil, Plus, Trash2 } from 'lucide-react';
import { useT } from '@/i18n';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction, useGet } from '@/hooks/useApi';
import { Badge, Button, Card, Field, Input, Select, Switch, Textarea } from '@/components/ui/primitives';
import { Dialog, useConfirm } from '@/components/ui/feedback';
import { PageHeader, ProgressBar, SkeletonRows } from '@/components/ui/data';
import { cn } from '@/lib/format';

export interface CategoryNode {
  id: string; code: string; name: string; description: string | null; parentId: string | null; sortOrder: number; isActive: boolean;
  totalQuestions: number; usableQuestions?: number; questionCounts?: Record<string, number>;
  children?: CategoryNode[];
}

export default function CategoriesPage() {
  const { t } = useT();
  const { can } = useAuth();
  const canManage = can('categories.manage');
  const confirm = useConfirm();
  const { data, isLoading } = useGet<CategoryNode[]>(['categories'], '/categories');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ node: CategoryNode | null; parentId: string | null } | null>(null);
  const del = useAction((id: string) => api(`/categories/${id}`, { method: 'DELETE' }), { success: t('categories.deleted'), invalidate: [['categories']] });
  const maxUsable = Math.max(1, ...(data ?? []).map((c) => c.usableQuestions ?? 0));

  return (
    <div>
      <PageHeader title={t('categories.title')} subtitle={t('categories.subtitle')} icon={<FolderTree className="h-5 w-5" />}
        actions={canManage && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({ node: null, parentId: null })}>{t('categories.newCategory')}</Button>} />
      {isLoading || !data ? <Card><SkeletonRows rows={10} /></Card> : (
        <div className="space-y-3">
          {data.map((c, i) => {
            const isOpen = open.has(c.id);
            return (
              <motion.div key={c.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <Card className={cn('overflow-hidden transition-shadow', isOpen && 'shadow-lift')}>
                  <div className="flex items-center gap-3 p-4">
                    <button onClick={() => setOpen((s) => { const n = new Set(s); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-expanded={isOpen}>
                      <ChevronRight className={cn('h-4 w-4 shrink-0 text-subtle transition-transform duration-200', isOpen && 'rotate-90')} />
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft font-bold text-primary">{c.code}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2"><span className="truncate font-semibold">{c.name}</span>{!c.isActive && <Badge>{t('common.inactive')}</Badge>}</span>
                        <span className="mt-0.5 block truncate text-xs text-muted">{c.description}</span>
                      </span>
                    </button>
                    <div className="hidden w-48 shrink-0 md:block">
                      <div className="mb-1 flex justify-between text-xs text-muted"><span>{c.usableQuestions} {t('categories.usable')}</span><span>{c.totalQuestions} {t('categories.totalQ')}</span></div>
                      <ProgressBar value={((c.usableQuestions ?? 0) / maxUsable) * 100} tone="success" />
                    </div>
                    <Badge className="hidden sm:inline-flex">{c.children?.length ?? 0} {t('categories.subcategories')}</Badge>
                    {canManage && (
                      <div className="flex shrink-0">
                        <Button variant="ghost" size="icon" onClick={() => setEditing({ node: null, parentId: c.id })} aria-label={t('categories.newSub')} title={t('categories.newSub')}><Plus className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => setEditing({ node: c, parentId: null })} aria-label={t('common.edit')}><Pencil className="h-4 w-4" /></Button>
                      </div>
                    )}
                  </div>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.ul initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden border-t border-border bg-surface-2/40">
                        {c.children?.map((s) => (
                          <li key={s.id} className="flex items-center gap-3 border-b border-border/60 px-4 py-2.5 pl-16 text-sm last:border-0">
                            <span className="font-mono text-xs text-subtle">{s.code}</span>
                            <span className="flex-1">{s.name}</span>
                            <span className="num text-xs text-muted">{s.totalQuestions} {t('common.questions')}</span>
                            {canManage && (
                              <>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing({ node: s, parentId: c.id })} aria-label={t('common.edit')}><Pencil className="h-3.5 w-3.5" /></Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={t('common.delete')} onClick={async () => { if (await confirm({ title: t('common.delete'), message: t('categories.confirmDelete'), tone: 'danger' })) del.mutate(s.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                              </>
                            )}
                          </li>
                        ))}
                      </motion.ul>
                    )}
                  </AnimatePresence>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
      {editing && <CategoryDialog roots={data ?? []} node={editing.node} parentId={editing.parentId} onClose={() => setEditing(null)} />}
    </div>
  );
}

function CategoryDialog({ roots, node, parentId, onClose }: { roots: CategoryNode[]; node: CategoryNode | null; parentId: string | null; onClose: () => void }) {
  const { t } = useT();
  const [f, setF] = useState({ code: node?.code ?? '', name: node?.name ?? '', description: node?.description ?? '', parentId: node?.parentId ?? parentId ?? '', sortOrder: node?.sortOrder ?? 0, isActive: node?.isActive ?? true });
  const save = useAction(() => {
    const body = { ...f, parentId: f.parentId || null, sortOrder: Number(f.sortOrder) };
    return node ? api(`/categories/${node.id}`, { method: 'PATCH', body }) : api('/categories', { body });
  }, { success: t('categories.saved'), invalidate: [['categories']], onSuccess: onClose });
  const errs = save.error?.fieldErrors ?? {};
  return (
    <Dialog open onClose={onClose} title={node ? `${node.code}. ${node.name}` : parentId ? t('categories.newSub') : t('categories.newCategory')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button loading={save.isPending} onClick={() => save.mutate(undefined)}>{t('common.save')}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('common.code')} error={errs.code} required><Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} /></Field>
        <Field className="sm:col-span-2" label={t('common.name')} error={errs.name} required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field className="sm:col-span-3" label={t('common.description')}><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field className="sm:col-span-2" label={t('categories.parent')}>
          <Select value={f.parentId} onChange={(e) => setF({ ...f, parentId: e.target.value })}>
            <option value="">{t('categories.rootLevel')}</option>
            {roots.filter((r) => r.id !== node?.id).map((r) => <option key={r.id} value={r.id}>{r.code}. {r.name}</option>)}
          </Select>
        </Field>
        <Field label={t('categories.sortOrder')}><Input type="number" min={0} value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: Number(e.target.value) })} /></Field>
        <div className="sm:col-span-3"><Switch checked={f.isActive} onChange={(isActive) => setF({ ...f, isActive })} label={t('common.active')} /></div>
      </div>
    </Dialog>
  );
}
