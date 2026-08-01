import { ArrowDown, ArrowUp, CalendarDays, Search, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AppIcon } from './AppIcon';
import { formatDuration } from '../lib/format';
import type { AppUsage, DashboardData } from '../types';

type SortKey = 'name' | 'seconds' | 'launches' | 'share';

interface ActivityProps {
  data: DashboardData;
  onSetLimit: (app: AppUsage) => void;
}

export function Activity({ data, onSetLimit }: ActivityProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Усі категорії');
  const [sortKey, setSortKey] = useState<SortKey>('seconds');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const categories = useMemo(() => ['Усі категорії', ...new Set(data.apps.map((app) => app.category))], [data.apps]);

  const apps = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('uk');
    const filtered = data.apps.filter((app) => {
      const matchesQuery = !normalized || app.name.toLocaleLowerCase('uk').includes(normalized);
      const matchesCategory = category === 'Усі категорії' || app.category === category;
      return matchesQuery && matchesCategory;
    });
    const direction = sortDirection === 'asc' ? 1 : -1;
    return filtered.sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name, 'uk') * direction;
      if (sortKey === 'launches') return (a.launches - b.launches) * direction;
      if (sortKey === 'share') return (a.seconds - b.seconds) * direction;
      return (a.seconds - b.seconds) * direction;
    });
  }, [category, data.apps, query, sortDirection, sortKey]);

  function changeSort(next: SortKey) {
    if (sortKey === next) setSortDirection((value) => value === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(next);
      setSortDirection(next === 'name' ? 'asc' : 'desc');
    }
  }

  function SortLabel({ value, children }: { value: SortKey; children: React.ReactNode }) {
    const active = sortKey === value;
    const Icon = sortDirection === 'asc' ? ArrowUp : ArrowDown;
    return (
      <button type="button" onClick={() => changeSort(value)} aria-label={`${String(children)}. ${active ? `Сортування ${sortDirection === 'asc' ? 'за зростанням' : 'за спаданням'}` : 'Сортувати'}`} className={`inline-flex items-center gap-1 uppercase tracking-[0.08em] ${active ? 'text-[var(--text)]' : ''}`}>
        {children}{active && <Icon size={11} />}
      </button>
    );
  }

  return (
    <div>
      <div className="mb-7">
        <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--accent-strong)]">
          <SlidersHorizontal size={13} /> Детальна статистика
        </div>
        <h1 className="page-title">Активність</h1>
        <p className="page-subtitle">Переглядайте, куди йде ваш час, і знаходьте звички для покращення.</p>
      </div>

      <div className="mb-4 grid grid-cols-[minmax(260px,1fr)_210px_auto] gap-3">
        <label className="input-shell flex items-center gap-2.5">
          <Search size={16} className="text-[var(--muted)]" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Пошук застосунку…" className="w-full bg-transparent text-[12px] font-medium outline-none placeholder:text-[var(--muted)]" />
        </label>
        <label className="input-shell flex items-center gap-2">
          <SlidersHorizontal size={15} className="text-[var(--muted)]" />
          <select aria-label="Категорія застосунку" value={category} onChange={(event) => setCategory(event.target.value)} className="w-full bg-transparent text-[12px] font-semibold outline-none">
            {categories.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <div className="input-shell flex items-center gap-2 px-4 text-[11px] font-semibold text-[var(--muted-strong)]">
          <CalendarDays size={15} /> {data.days.length} {data.days.length === 1 ? 'день' : 'днів'}
        </div>
      </div>

      <section className="card overflow-x-auto">
        <div role="table" aria-label="Активність застосунків" className="min-w-[830px] overflow-hidden rounded-2xl">
        <div role="row" className="grid grid-cols-[minmax(250px,1.5fr)_130px_150px_105px_155px] items-center border-b border-[var(--border)] bg-[var(--surface-muted)] px-5 py-3 text-[9px] font-bold text-[var(--muted)]">
          <div role="columnheader" aria-sort={sortKey === 'name' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}><SortLabel value="name">Застосунок</SortLabel></div>
          <span role="columnheader" className="uppercase tracking-[0.08em]">Категорія</span>
          <div role="columnheader" aria-sort={sortKey === 'seconds' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}><SortLabel value="seconds">Активний час</SortLabel></div>
          <div role="columnheader" aria-sort={sortKey === 'launches' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}><SortLabel value="launches">Запуски</SortLabel></div>
          <span role="columnheader" className="text-right uppercase tracking-[0.08em]">Ліміт</span>
        </div>
        <div role="rowgroup">
          {apps.map((app) => {
            const share = data.totalSeconds ? (app.seconds / data.totalSeconds) * 100 : 0;
            const limitSeconds = (app.limitMinutes || 0) * 60;
            const limitProgress = limitSeconds ? Math.min(100, (app.seconds / limitSeconds) * 100) : 0;
            return (
              <div role="row" key={app.id} className="grid grid-cols-[minmax(250px,1.5fr)_130px_150px_105px_155px] items-center border-b border-[var(--border)] px-5 py-3.5 last:border-b-0 hover:bg-[var(--surface-hover)]">
                <div role="cell" className="flex min-w-0 items-center gap-3">
                  <AppIcon id={app.id} name={app.name} />
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-bold text-[var(--text)]">{app.name}</div>
                    <div className="mt-0.5 text-[10px] font-medium text-[var(--muted)]">{share.toFixed(1)}% загального часу</div>
                  </div>
                </div>
                <span role="cell"><span className="rounded-lg bg-[var(--surface-muted)] px-2 py-1 text-[9px] font-bold text-[var(--muted-strong)]">{app.category}</span></span>
                <div role="cell">
                  <div className="text-[12px] font-bold tabular-nums text-[var(--text)]">{formatDuration(app.seconds)}</div>
                  <div className="mt-1.5 h-1 w-20 overflow-hidden rounded-full bg-[var(--progress-track)]"><div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.max(2, share)}%` }} /></div>
                </div>
                <span role="cell" className="text-[12px] font-semibold tabular-nums text-[var(--muted-strong)]">{app.launches}</span>
                <div role="cell" className="flex items-center justify-end">
                  {app.limitEnabled && app.limitMinutes && data.days.length === 1 ? (
                    <button type="button" onClick={() => onSetLimit(app)} className="group w-[128px] text-left">
                      <div className="flex items-center justify-between text-[9px] font-bold text-[var(--muted-strong)]"><span>{formatDuration(app.seconds)}</span><span>{formatDuration(limitSeconds)}</span></div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--progress-track)]"><div className={`h-full rounded-full ${limitProgress >= 100 ? 'bg-rose-500' : limitProgress >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.max(2, limitProgress)}%` }} /></div>
                    </button>
                  ) : app.limitEnabled && app.limitMinutes ? (
                    <button type="button" onClick={() => onSetLimit(app)} className="rounded-lg bg-[var(--surface-muted)] px-2.5 py-1.5 text-[9px] font-bold text-[var(--muted-strong)]">{formatDuration(app.limitMinutes * 60)} / день</button>
                  ) : (
                    <button type="button" onClick={() => onSetLimit(app)} className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[10px] font-bold text-[var(--muted-strong)] transition hover:border-[var(--accent)] hover:text-[var(--accent-strong)]">+ Ліміт</button>
                  )}
                </div>
              </div>
            );
          })}
          {!apps.length && (
            <div className="flex flex-col items-center px-6 py-20 text-center">
              <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-[var(--surface-muted)] text-[var(--muted)]"><Search size={20} /></div>
              <h3 className="text-[13px] font-bold text-[var(--text)]">Нічого не знайдено</h3>
              <p className="mt-1 max-w-sm text-[11px] leading-5 text-[var(--muted)]">Спробуйте іншу назву або скиньте фільтр категорії.</p>
            </div>
          )}
        </div>
        </div>
      </section>
    </div>
  );
}
