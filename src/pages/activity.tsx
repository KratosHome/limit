import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  ChevronDown,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { Fragment, type ReactNode, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppIcon } from '../components/app-icon';
import { SiteUsagePanel } from '../components/site-usage-panel';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { formatDuration } from '../lib/format';
import { translateCategory } from '../i18n/helpers';
import type { AppUsage, DashboardData } from '../types/usage';

type SortKey = 'name' | 'seconds' | 'launches' | 'share';

interface ActivityProps {
  data: DashboardData;
  onSetLimit: (app: AppUsage) => void;
  onOpenSettings: () => void;
}

export function Activity({ data, onSetLimit, onOpenSettings }: ActivityProps) {
  const { i18n, t } = useTranslation('activity');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('__all__');
  const [sortKey, setSortKey] = useState<SortKey>('seconds');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [expandedApps, setExpandedApps] = useState<Set<string>>(
    () => new Set(),
  );
  const categories = useMemo(
    () => [...new Set(data.apps.map((app) => app.category))],
    [data.apps],
  );
  const percentFormatter = useMemo(
    () =>
      new Intl.NumberFormat(
        i18n.resolvedLanguage === 'uk' ? 'uk-UA' : 'en-US',
        {
          style: 'percent',
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        },
      ),
    [i18n.resolvedLanguage],
  );

  const apps = useMemo(() => {
    const locale = i18n.resolvedLanguage === 'en' ? 'en' : 'uk';
    const normalized = query.trim().toLocaleLowerCase(locale);
    const filtered = data.apps.filter((app) => {
      const matchesQuery =
        !normalized || app.name.toLocaleLowerCase(locale).includes(normalized);
      const matchesCategory =
        category === '__all__' || app.category === category;
      return matchesQuery && matchesCategory;
    });
    const direction = sortDirection === 'asc' ? 1 : -1;
    return filtered.sort((a, b) => {
      if (sortKey === 'name')
        return a.name.localeCompare(b.name, locale) * direction;
      if (sortKey === 'launches') return (a.launches - b.launches) * direction;
      if (sortKey === 'share') return (a.seconds - b.seconds) * direction;
      return (a.seconds - b.seconds) * direction;
    });
  }, [
    category,
    data.apps,
    i18n.resolvedLanguage,
    query,
    sortDirection,
    sortKey,
  ]);

  function changeSort(next: SortKey) {
    if (sortKey === next)
      setSortDirection((value) => (value === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(next);
      setSortDirection(next === 'name' ? 'asc' : 'desc');
    }
  }

  function toggleSites(appId: string) {
    setExpandedApps((current) => {
      const next = new Set(current);
      if (next.has(appId)) next.delete(appId);
      else next.add(appId);
      return next;
    });
  }

  function SortLabel({
    value,
    children,
  }: {
    value: SortKey;
    children: ReactNode;
  }) {
    const active = sortKey === value;
    const Icon = sortDirection === 'asc' ? ArrowUp : ArrowDown;
    return (
      <Button
        variant="ghost"
        size="none"
        onClick={() => changeSort(value)}
        aria-label={t(
          active
            ? sortDirection === 'asc'
              ? 'sort.ascending'
              : 'sort.descending'
            : 'sort.inactive',
          { label: String(children) },
        )}
        className={`inline-flex items-center gap-1 rounded-none uppercase tracking-[0.08em] hover:bg-transparent ${active ? 'text-[var(--text)]' : ''}`}
      >
        {children}
        {active && <Icon size={11} />}
      </Button>
    );
  }

  return (
    <div>
      <div className="mb-7">
        <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--accent-strong)]">
          <SlidersHorizontal size={13} /> {t('eyebrow')}
        </div>
        <h1 className="page-title">{t('title')}</h1>
        <p className="page-subtitle">{t('subtitle')}</p>
      </div>

      <div className="mb-4 grid grid-cols-[minmax(260px,1fr)_210px_auto] gap-3">
        <label className="input-shell flex items-center gap-2.5">
          <Search size={16} className="text-[var(--muted)]" />
          <Input
            variant="ghost"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('search')}
            aria-label={t('searchLabel')}
          />
        </label>
        <label className="input-shell flex items-center gap-2">
          <SlidersHorizontal size={15} className="text-[var(--muted)]" />
          <select
            aria-label={t('categoryLabel')}
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="w-full bg-transparent text-[12px] font-semibold outline-none"
          >
            <option value="__all__">{t('allCategories')}</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {translateCategory(item)}
              </option>
            ))}
          </select>
        </label>
        <div className="input-shell flex items-center gap-2 px-4 text-[11px] font-semibold text-[var(--muted-strong)]">
          <CalendarDays size={15} /> {t('days', { count: data.days.length })}
        </div>
      </div>

      <section className="card overflow-x-auto">
        <div
          role="table"
          aria-label={t('tableLabel')}
          className="min-w-[830px] overflow-hidden rounded-2xl"
        >
          <div
            role="row"
            className="grid grid-cols-[minmax(250px,1.5fr)_130px_150px_105px_155px] items-center border-b border-[var(--border)] bg-[var(--surface-muted)] px-5 py-3 text-[9px] font-bold text-[var(--muted)]"
          >
            <div
              role="columnheader"
              aria-sort={
                sortKey === 'name'
                  ? sortDirection === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : 'none'
              }
            >
              <SortLabel value="name">{t('columns.app')}</SortLabel>
            </div>
            <span role="columnheader" className="uppercase tracking-[0.08em]">
              {t('columns.category')}
            </span>
            <div
              role="columnheader"
              aria-sort={
                sortKey === 'seconds'
                  ? sortDirection === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : 'none'
              }
            >
              <SortLabel value="seconds">{t('columns.activeTime')}</SortLabel>
            </div>
            <div
              role="columnheader"
              aria-sort={
                sortKey === 'launches'
                  ? sortDirection === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : 'none'
              }
            >
              <SortLabel value="launches">{t('columns.launches')}</SortLabel>
            </div>
            <span
              role="columnheader"
              className="text-right uppercase tracking-[0.08em]"
            >
              {t('columns.limit')}
            </span>
          </div>
          <div role="rowgroup">
            {apps.map((app) => {
              const share = data.totalSeconds
                ? (app.seconds / data.totalSeconds) * 100
                : 0;
              const limitSeconds = (app.limitMinutes || 0) * 60;
              const limitPeriod = app.limitPeriod ?? 'day';
              const hasEnabledLimit =
                app.limitEnabled && Boolean(app.limitMinutes);
              const limitProgress = limitSeconds
                ? Math.min(100, (app.seconds / limitSeconds) * 100)
                : 0;
              const isBrowser = app.isBrowser || app.sites.length > 0;
              const expanded = expandedApps.has(app.id);
              const sitesPanelId = `activity-sites-${app.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
              return (
                <Fragment key={app.id}>
                  <div
                    role="row"
                    className={`grid grid-cols-[minmax(250px,1.5fr)_130px_150px_105px_155px] items-center px-5 py-3.5 hover:bg-[var(--surface-hover)] ${expanded ? '' : 'border-b border-[var(--border)]'}`}
                  >
                    <div
                      role="cell"
                      className="flex min-w-0 items-center gap-3"
                    >
                      <AppIcon id={app.id} name={app.name} />
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-1">
                          <div className="truncate text-[12px] font-bold text-[var(--text)]">
                            {app.name}
                          </div>
                          {isBrowser && (
                            <Button
                              variant="icon"
                              size="none"
                              className="h-7 w-7 shrink-0"
                              aria-expanded={expanded}
                              aria-controls={sitesPanelId}
                              aria-label={t('sitesToggle', {
                                action: t(expanded ? 'collapse' : 'expand'),
                                app: app.name,
                              })}
                              onClick={() => toggleSites(app.id)}
                            >
                              <ChevronDown
                                size={13}
                                aria-hidden="true"
                                className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
                              />
                            </Button>
                          )}
                        </div>
                        <div className="mt-0.5 text-[10px] font-medium text-[var(--muted)]">
                          {t('share', {
                            value: percentFormatter.format(share / 100),
                          })}
                        </div>
                      </div>
                    </div>
                    <span role="cell">
                      <span className="rounded-lg bg-[var(--surface-muted)] px-2 py-1 text-[9px] font-bold text-[var(--muted-strong)]">
                        {translateCategory(app.category)}
                      </span>
                    </span>
                    <div role="cell">
                      <div className="text-[12px] font-bold tabular-nums text-[var(--text)]">
                        {formatDuration(app.seconds)}
                      </div>
                      <div className="mt-1.5 h-1 w-20 overflow-hidden rounded-full bg-[var(--progress-track)]">
                        <div
                          className="h-full rounded-full bg-[var(--accent)]"
                          style={{ width: `${Math.max(2, share)}%` }}
                        />
                      </div>
                    </div>
                    <span
                      role="cell"
                      className="text-[12px] font-semibold tabular-nums text-[var(--muted-strong)]"
                    >
                      {app.launches}
                    </span>
                    <div role="cell" className="flex items-center justify-end">
                      {hasEnabledLimit &&
                      limitPeriod === 'day' &&
                      data.days.length === 1 ? (
                        <Button
                          variant="ghost"
                          size="none"
                          onClick={() => onSetLimit(app)}
                          className="group w-[128px] rounded-none text-left hover:bg-transparent"
                        >
                          <div className="flex items-center justify-between text-[9px] font-bold text-[var(--muted-strong)]">
                            <span>{formatDuration(app.seconds)}</span>
                            <span>{formatDuration(limitSeconds)}</span>
                          </div>
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--progress-track)]">
                            <div
                              className={`h-full rounded-full ${limitProgress >= 100 ? 'bg-rose-500' : limitProgress >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                              style={{
                                width: `${Math.max(2, limitProgress)}%`,
                              }}
                            />
                          </div>
                        </Button>
                      ) : hasEnabledLimit ? (
                        <Button
                          variant="subtle"
                          size="none"
                          onClick={() => onSetLimit(app)}
                        >
                          {t(`perPeriod.${limitPeriod}`, {
                            duration: formatDuration(limitSeconds),
                          })}
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          size="none"
                          onClick={() => onSetLimit(app)}
                          className="rounded-lg px-2.5 py-1.5 text-[10px] text-[var(--muted-strong)] hover:border-[var(--accent)] hover:text-[var(--accent-strong)]"
                        >
                          {t('addLimit')}
                        </Button>
                      )}
                    </div>
                  </div>
                  {isBrowser && expanded && (
                    <div
                      id={sitesPanelId}
                      role="row"
                      className="border-b border-[var(--border)] px-5 pb-3"
                    >
                      <div role="cell" className="ml-[52px] max-w-[430px]">
                        <SiteUsagePanel
                          app={app}
                          websiteTrackingEnabled={
                            data.settings.websiteTrackingEnabled
                          }
                          onOpenSettings={onOpenSettings}
                          limit={10}
                        />
                      </div>
                    </div>
                  )}
                </Fragment>
              );
            })}
            {!apps.length && (
              <div className="flex flex-col items-center px-6 py-20 text-center">
                <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-[var(--surface-muted)] text-[var(--muted)]">
                  <Search size={20} />
                </div>
                <h3 className="text-[13px] font-bold text-[var(--text)]">
                  {t('emptyTitle')}
                </h3>
                <p className="mt-1 max-w-sm text-[11px] leading-5 text-[var(--muted)]">
                  {t('emptyDescription')}
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
