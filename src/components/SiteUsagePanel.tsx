import { Globe2 } from 'lucide-react';
import { formatDuration } from '../lib/format';
import type { AppUsage } from '../types';
import { Button } from './ui/button';

interface SiteUsagePanelProps {
  app: AppUsage;
  websiteTrackingEnabled: boolean;
  onOpenSettings: () => void;
  className?: string;
  limit?: number;
}

export function SiteUsagePanel({ app, websiteTrackingEnabled, onOpenSettings, className = '', limit = 5 }: SiteUsagePanelProps) {
  const sites = app.sites ?? [];
  const visibleSites = sites.slice(0, limit);
  const hiddenSiteCount = Math.max(0, sites.length - visibleSites.length);
  const unattributedSeconds = Math.max(0, app.seconds - sites.reduce((sum, site) => sum + site.seconds, 0));

  return (
    <div className={`border-l border-[var(--border)] pl-3 ${className}`}>
      {sites.length ? (
        <ul className="space-y-1" aria-label={`Сайти в ${app.name}`}>
          {visibleSites.map((site) => {
            const siteShare = app.seconds ? Math.min(100, (site.seconds / app.seconds) * 100) : 0;
            return (
              <li key={site.domain} className="rounded-lg px-2 py-1.5">
                <div className="flex min-w-0 items-center gap-2 text-[10px]">
                  <Globe2 size={12} className="shrink-0 text-[var(--muted)]" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate font-semibold text-[var(--muted-strong)]" title={site.domain}>{site.domain}</span>
                  <span className="shrink-0 font-bold tabular-nums text-[var(--muted-strong)]">{formatDuration(site.seconds)}</span>
                </div>
                <div className="ml-5 mt-1 h-0.5 overflow-hidden rounded-full bg-[var(--progress-track)]" aria-hidden="true">
                  <div className="h-full rounded-full bg-[var(--accent)] opacity-70" style={{ width: `${Math.max(2, siteShare)}%` }} />
                </div>
              </li>
            );
          })}
          {hiddenSiteCount > 0 && <li className="px-2 py-1.5 text-[10px] font-semibold text-[var(--muted)]">Ще сайтів: {hiddenSiteCount}</li>}
          {unattributedSeconds >= 1 && (
            <li className="flex items-center justify-between gap-2 px-2 py-1.5 text-[10px] text-[var(--muted)]">
              <span className="truncate font-medium">Без визначеного домену</span>
              <span className="shrink-0 font-semibold tabular-nums">{formatDuration(unattributedSeconds)}</span>
            </li>
          )}
        </ul>
      ) : (
        <div className="px-2 py-2">
          <p className="text-[10px] font-medium leading-4 text-[var(--muted)]">
            {websiteTrackingEnabled ? `Домен ще не отримано. Перевірте доступи macOS і відкрийте вкладку ${app.name}.` : 'Відстеження сайтів зараз вимкнене.'}
          </p>
          <Button variant="link" size="none" onClick={onOpenSettings} className="mt-2">Відкрити налаштування</Button>
        </div>
      )}
    </div>
  );
}
