import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useT } from '@/i18n';
import { stripDiacritics } from '@solar/shared';
import { Checkbox, Input } from './primitives';

/** Searchable multi-select checklist (Vietnamese diacritic-insensitive search). */
export function CheckList<T extends { id: string }>({ items, value, onChange, render, searchText, maxHeight = 260 }: {
  items: T[];
  value: string[];
  onChange: (ids: string[]) => void;
  render: (item: T) => React.ReactNode;
  searchText: (item: T) => string;
  maxHeight?: number;
}) {
  const { t } = useT();
  const [q, setQ] = useState('');
  const norm = (s: string) => stripDiacritics(s.toLowerCase());
  const filtered = useMemo(() => (q ? items.filter((i) => norm(searchText(i)).includes(norm(q))) : items), [items, q, searchText]);
  const set = new Set(value);
  const allChecked = filtered.length > 0 && filtered.every((i) => set.has(i.id));
  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center gap-2 border-b border-border p-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <Input className="h-8 pl-8" placeholder={t('common.searchPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Checkbox
          checked={allChecked}
          onChange={(v) => {
            const ids = new Set(value);
            for (const i of filtered) v ? ids.add(i.id) : ids.delete(i.id);
            onChange([...ids]);
          }}
          label={<span className="whitespace-nowrap text-xs text-muted">{t('common.all')}</span>}
        />
      </div>
      <ul className="scrollbar-thin divide-y divide-border overflow-y-auto" style={{ maxHeight }}>
        {filtered.map((it) => (
          <li key={it.id} className="px-3 py-2 transition-colors hover:bg-surface-2/60">
            <Checkbox
              className="w-full"
              checked={set.has(it.id)}
              onChange={(v) => onChange(v ? [...value, it.id] : value.filter((x) => x !== it.id))}
              label={render(it)}
            />
          </li>
        ))}
        {!filtered.length && <li className="px-3 py-6 text-center text-sm text-muted">{t('common.noData')}</li>}
      </ul>
      <p className="border-t border-border px-3 py-1.5 text-xs text-muted">
        {value.length} {t('common.selected')}
      </p>
    </div>
  );
}
