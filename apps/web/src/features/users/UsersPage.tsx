import { Fragment, useEffect, useState } from 'react';
import { Pencil, Plus, Search, Shield, Trash2, UserCog, Users, UsersRound } from 'lucide-react';
import { ROLE_CODES, type RoleCode } from '@solar/shared';
import { useT } from '@/i18n';
import { api } from '@/lib/api';
import { useAction, useGet } from '@/hooks/useApi';
import { Badge, Button, Card, Checkbox, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { Dialog, useConfirm } from '@/components/ui/feedback';
import { EmptyState, PageHeader, Pagination, SkeletonRows, Table, Tabs, Td, Th } from '@/components/ui/data';
import { CheckList } from '@/components/ui/CheckList';
import { fmtDateTime } from '@/lib/format';

interface UserRow {
  id: string; username: string; email: string | null; phone: string | null; isGuest: boolean; fullName: string; department: string | null; position: string | null;
  isActive: boolean; lastLoginAt: string | null; role: { code: RoleCode; name: string };
  groups: Array<{ id: string; name: string }>; categories: Array<{ id: string; code: string; name: string }>;
}
interface Paged<T> { items: T[]; total: number; page: number; pages: number }
interface Group { id: string; name: string; description: string | null; members: Array<{ id: string; fullName: string; username: string }> }
interface Category { id: string; code: string; name: string }

export default function UsersPage() {
  const { t } = useT();
  const [tab, setTab] = useState<'users' | 'roles' | 'groups'>('users');
  return (
    <div>
      <PageHeader title={t('users.title')} subtitle={t('users.subtitle')} icon={<Users className="h-5 w-5" />} />
      <Tabs
        className="mb-5"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'users', label: t('users.tabUsers'), icon: <UserCog className="h-4 w-4" /> },
          { id: 'roles', label: t('users.tabRoles'), icon: <Shield className="h-4 w-4" /> },
          { id: 'groups', label: t('users.tabGroups'), icon: <UsersRound className="h-4 w-4" /> },
        ]}
      />
      {tab === 'users' && <UsersTab />}
      {tab === 'roles' && <RolesTab />}
      {tab === 'groups' && <GroupsTab />}
    </div>
  );
}

const roleTone: Record<RoleCode, 'danger' | 'primary' | 'info' | 'neutral'> = { ADMIN: 'danger', EXAM_MANAGER: 'primary', AUTHOR: 'info', CANDIDATE: 'neutral' };

function UsersTab() {
  const { t } = useT();
  const confirm = useConfirm();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<UserRow | 'new' | null>(null);
  useEffect(() => {
    const h = setTimeout(() => { setDebounced(q); setPage(1); }, 300);
    return () => clearTimeout(h);
  }, [q]);
  const params = new URLSearchParams({ page: String(page), pageSize: '20', ...(debounced ? { q: debounced } : {}), ...(role ? { role } : {}) });
  const { data, isLoading } = useGet<Paged<UserRow>>(['users', params.toString()], `/users?${params}`, { keepPrevious: true });
  const del = useAction((id: string) => api(`/users/${id}`, { method: 'DELETE' }), { success: t('users.deleted'), invalidate: [['users']] });
  const toggle = useAction((u: UserRow) => api(`/users/${u.id}`, { method: 'PATCH', body: { isActive: !u.isActive } }), { success: t('users.updated'), invalidate: [['users']] });

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <Input className="pl-9" placeholder={t('common.searchPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select className="sm:w-56" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }} aria-label={t('users.role')}>
          <option value="">{t('common.all')} – {t('users.role').toLowerCase()}</option>
          {ROLE_CODES.map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}
        </Select>
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>{t('users.newUser')}</Button>
      </div>
      {isLoading ? <SkeletonRows /> : !data?.items.length ? <EmptyState title={t('common.noData')} /> : (
        <>
          <Table>
            <thead>
              <tr><Th>{t('users.fullName')}</Th><Th>{t('users.role')}</Th><Th className="hidden md:table-cell">{t('users.department')}</Th><Th className="hidden lg:table-cell">{t('users.groups')}</Th><Th className="hidden lg:table-cell">{t('users.lastLogin')}</Th><Th>{t('common.status')}</Th><Th className="text-right">{t('common.actions')}</Th></tr>
            </thead>
            <tbody>
              {data.items.map((u) => (
                <tr key={u.id} className="transition-colors hover:bg-surface-2/60">
                  <Td><p className="font-medium">{u.fullName}</p><p className="text-xs text-muted">{u.isGuest ? `☎ ${u.phone}` : `@${u.username}${u.email ? ` · ${u.email}` : ''}`}</p></Td>
                  <Td><Badge tone={roleTone[u.role.code]}>{t(`roles.${u.role.code}`)}</Badge>{u.isGuest && <Badge tone="info" className="ml-1">{t('guest.guestBadge')}</Badge>}</Td>
                  <Td className="hidden text-muted md:table-cell">{u.department ?? '—'}<p className="text-xs">{u.position}</p></Td>
                  <Td className="hidden lg:table-cell"><div className="flex flex-wrap gap-1">{u.groups.map((g) => <Badge key={g.id}>{g.name}</Badge>)}</div></Td>
                  <Td className="hidden text-xs text-muted lg:table-cell">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : t('users.never')}</Td>
                  <Td>
                    <button onClick={() => toggle.mutate(u)} title={u.isActive ? t('users.deactivate') : t('users.activate')}>
                      <Badge tone={u.isActive ? 'success' : 'neutral'}>{u.isActive ? t('common.active') : t('common.inactive')}</Badge>
                    </button>
                  </Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setEditing(u)} aria-label={t('common.edit')}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="hover:text-danger" aria-label={t('common.delete')} onClick={async () => { if (await confirm({ title: t('common.delete'), message: t('users.confirmDelete'), tone: 'danger', confirmLabel: t('common.delete') })) del.mutate(u.id); }}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
        </>
      )}
      {editing && <UserDialog user={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function UserDialog({ user, onClose }: { user: UserRow | null; onClose: () => void }) {
  const { t } = useT();
  const groups = useGet<Group[]>(['groups'], '/groups');
  const cats = useGet<Category[]>(['categories'], '/categories');
  const [f, setF] = useState({
    username: user?.username ?? '', fullName: user?.fullName ?? '', email: user?.email ?? '', department: user?.department ?? '', position: user?.position ?? '',
    roleCode: (user?.role.code ?? 'CANDIDATE') as RoleCode, password: '', groupIds: user?.groups.map((g) => g.id) ?? [], categoryIds: user?.categories.map((c) => c.id) ?? [],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useAction(
    () => {
      const body: Record<string, unknown> = { fullName: f.fullName, email: f.email, department: f.department, position: f.position, roleCode: f.roleCode, groupIds: f.groupIds, categoryIds: f.roleCode === 'AUTHOR' ? f.categoryIds : [] };
      if (f.password) body.password = f.password;
      if (!user) body.username = f.username;
      return user ? api(`/users/${user.id}`, { method: 'PATCH', body }) : api('/users', { body });
    },
    { success: user ? t('users.updated') : t('users.created'), invalidate: [['users'], ['groups']], onSuccess: onClose, silentError: false },
  );
  useEffect(() => { if (save.error) setErrors(save.error.fieldErrors); }, [save.error]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Dialog open onClose={onClose} size="lg" title={user ? t('users.editUser') : t('users.newUser')} footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button loading={save.isPending} onClick={() => save.mutate(undefined)}>{t('common.save')}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('auth.username')} error={errors.username} required><Input value={f.username} onChange={set('username')} disabled={!!user} invalid={!!errors.username} /></Field>
        <Field label={t('users.fullName')} error={errors.fullName} required><Input value={f.fullName} onChange={set('fullName')} invalid={!!errors.fullName} /></Field>
        <Field label={t('users.email')} error={errors.email}><Input type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label={t('users.role')} required>
          <Select value={f.roleCode} onChange={set('roleCode')}>{ROLE_CODES.map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}</Select>
        </Field>
        <Field label={t('users.department')}><Input value={f.department} onChange={set('department')} /></Field>
        <Field label={t('users.position')}><Input value={f.position} onChange={set('position')} /></Field>
        <Field className="sm:col-span-2" label={user ? t('users.resetPassword') : t('users.initialPassword')} error={errors.password} hint={user ? t('users.resetPasswordHint') : t('auth.passwordRule')} required={!user}>
          <Input type="password" autoComplete="new-password" value={f.password} onChange={set('password')} invalid={!!errors.password} />
        </Field>
        <Field className="sm:col-span-2" label={t('users.groups')}>
          <CheckList items={groups.data ?? []} value={f.groupIds} onChange={(groupIds) => setF({ ...f, groupIds })} render={(g) => g.name} searchText={(g) => g.name} maxHeight={140} />
        </Field>
        {f.roleCode === 'AUTHOR' && (
          <Field className="sm:col-span-2" label={t('users.categories')}>
            <CheckList items={cats.data ?? []} value={f.categoryIds} onChange={(categoryIds) => setF({ ...f, categoryIds })} render={(c) => `${c.code}. ${c.name}`} searchText={(c) => `${c.code} ${c.name}`} maxHeight={180} />
          </Field>
        )}
      </div>
    </Dialog>
  );
}

interface RolesData { roles: Array<{ id: string; code: RoleCode; name: string; userCount: number; permissions: string[] }>; permissions: Array<{ code: string; name: string; group: string }> }

function RolesTab() {
  const { t } = useT();
  const { data, isLoading } = useGet<RolesData>(['roles'], '/roles');
  const [matrix, setMatrix] = useState<Record<string, Set<string>>>({});
  useEffect(() => {
    if (data) setMatrix(Object.fromEntries(data.roles.map((r) => [r.id, new Set(r.permissions)])));
  }, [data]);
  const save = useAction((roleId: string) => api(`/roles/${roleId}/permissions`, { method: 'PUT', body: { permissions: [...(matrix[roleId] ?? [])] } }), { success: t('users.permissionsSaved'), invalidate: [['roles'], ['me']] });
  if (isLoading || !data) return <Card><SkeletonRows rows={8} /></Card>;
  const groups = [...new Set(data.permissions.map((p) => p.group))];
  const dirty = (rid: string) => {
    const orig = data.roles.find((r) => r.id === rid)!.permissions;
    const cur = matrix[rid] ?? new Set();
    return orig.length !== cur.size || orig.some((p) => !cur.has(p));
  };
  return (
    <Card>
      <Table>
        <thead>
          <tr>
            <Th>{t('users.permissions')}</Th>
            {data.roles.map((r) => (
              <Th key={r.id} className="text-center">
                <span className="block normal-case">{t(`roles.${r.code}`)}</span>
                <span className="block text-[11px] font-normal normal-case">{r.userCount} {t('users.usersCount')}</span>
              </Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <Fragment key={g}>
              <tr><Td colSpan={data.roles.length + 1} className="bg-surface-2/40 text-xs font-semibold uppercase tracking-wide text-muted">{g}</Td></tr>
              {data.permissions.filter((p) => p.group === g).map((p) => (
                <tr key={p.code} className="hover:bg-surface-2/40">
                  <Td><p className="text-sm">{p.name}</p><p className="font-mono text-[11px] text-subtle">{p.code}</p></Td>
                  {data.roles.map((r) => (
                    <Td key={r.id} className="text-center">
                      <Checkbox
                        checked={matrix[r.id]?.has(p.code) ?? false}
                        onChange={(v) => setMatrix((m) => { const s = new Set(m[r.id]); v ? s.add(p.code) : s.delete(p.code); return { ...m, [r.id]: s }; })}
                      />
                    </Td>
                  ))}
                </tr>
              ))}
            </Fragment>
          ))}
          <tr>
            <Td />
            {data.roles.map((r) => (
              <Td key={r.id} className="text-center"><Button size="sm" disabled={!dirty(r.id)} loading={save.isPending && save.variables === r.id} onClick={() => save.mutate(r.id)}>{t('common.save')}</Button></Td>
            ))}
          </tr>
        </tbody>
      </Table>
    </Card>
  );
}

function GroupsTab() {
  const { t } = useT();
  const confirm = useConfirm();
  const { data, isLoading } = useGet<Group[]>(['groups'], '/groups');
  const [editing, setEditing] = useState<Group | 'new' | null>(null);
  const del = useAction((id: string) => api(`/groups/${id}`, { method: 'DELETE' }), { success: t('common.saved'), invalidate: [['groups']] });
  return (
    <div>
      <div className="mb-4 flex justify-end"><Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>{t('users.newGroup')}</Button></div>
      {isLoading ? <Card><SkeletonRows /></Card> : !data?.length ? <Card><EmptyState title={t('common.noData')} /></Card> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((g) => (
            <Card key={g.id} hover className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{g.name}</p>
                  {g.description && <p className="mt-0.5 text-sm text-muted">{g.description}</p>}
                </div>
                <div className="flex">
                  <Button variant="ghost" size="icon" onClick={() => setEditing(g)} aria-label={t('common.edit')}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" aria-label={t('common.delete')} onClick={async () => { if (await confirm({ title: t('common.delete'), message: t('users.confirmDeleteGroup'), tone: 'danger' })) del.mutate(g.id); }}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
              <p className="mt-3 text-xs font-medium text-muted">{g.members.length} {t('users.members').toLowerCase()}</p>
              <div className="mt-2 flex flex-wrap gap-1">{g.members.slice(0, 8).map((m) => <Badge key={m.id}>{m.fullName}</Badge>)}{g.members.length > 8 && <Badge>+{g.members.length - 8}</Badge>}</div>
            </Card>
          ))}
        </div>
      )}
      {editing && <GroupDialog group={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function GroupDialog({ group, onClose }: { group: Group | null; onClose: () => void }) {
  const { t } = useT();
  const users = useGet<Paged<UserRow>>(['users', 'all'], '/users?pageSize=500');
  const [f, setF] = useState({ name: group?.name ?? '', description: group?.description ?? '', memberIds: group?.members.map((m) => m.id) ?? [] });
  const save = useAction(() => (group ? api(`/groups/${group.id}`, { method: 'PUT', body: f }) : api('/groups', { body: f })), { success: t('users.groupSaved'), invalidate: [['groups'], ['users']], onSuccess: onClose });
  return (
    <Dialog open onClose={onClose} title={group ? group.name : t('users.newGroup')} footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button loading={save.isPending} onClick={() => save.mutate(undefined)} disabled={!f.name.trim()}>{t('common.save')}</Button></>}>
      <div className="space-y-4">
        <Field label={t('users.groupName')} required><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label={t('common.description')}><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label={t('users.members')}>
          <CheckList items={users.data?.items ?? []} value={f.memberIds} onChange={(memberIds) => setF({ ...f, memberIds })} render={(u) => <span>{u.fullName} <span className="text-xs text-muted">@{u.username} · {t(`roles.${u.role.code}`)}</span></span>} searchText={(u) => `${u.fullName} ${u.username} ${u.department ?? ''}`} />
        </Field>
      </div>
    </Dialog>
  );
}
