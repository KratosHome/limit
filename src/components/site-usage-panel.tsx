import { Globe2, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDuration } from '../lib/format';
import type { AppUsage, SiteUsageDelete } from '../types/usage';
import { SiteUsageDeleteDialog } from './site-usage-delete-dialog';
import { Button } from './ui/button';

interface SiteUsagePanelProps {
  app: AppUsage;
  days: string[];
  websiteTrackingEnabled: boolean;
  onOpenSettings: () => void;
  onActivityChanged: () => Promise<void>;
  className?: string;
  limit?: number;
}

export function SiteUsagePanel({
  app,
  days,
  websiteTrackingEnabled,
  onOpenSettings,
  onActivityChanged,
  className = '',
  limit = 5,
}: SiteUsagePanelProps) {
  const { t } = useTranslation('components');
  const [showAll, setShowAll] = useState(false);
  const [deleting, setDeleting] = useState<SiteUsageDelete | null>(null);
  const [deletedDomain, setDeletedDomain] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const sites = app.sites ?? [];
  const visibleSites = showAll ? sites : sites.slice(0, limit);
  const hiddenSiteCount = Math.max(0, sites.length - visibleSites.length);
  const unattributedSeconds = Math.max(
    0,
    app.seconds - sites.reduce((sum, site) => sum + site.seconds, 0),
  );

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      className={`border-l border-[var(--border)] pl-3 ${className}`}
    >
      {sites.length ? (
        <ul
          className="space-y-1"
          aria-label={t('sites.label', { app: app.name })}
        >
          {visibleSites.map((site) => {
            const siteShare = app.seconds
              ? Math.min(100, (site.seconds / app.seconds) * 100)
              : 0;
            return (
              <li key={site.domain} className="rounded-lg px-2 py-1.5">
                <div className="flex min-w-0 items-center gap-2 text-[10px]">
                  <Globe2
                    size={12}
                    className="shrink-0 text-[var(--muted)]"
                    aria-hidden="true"
                  />
                  <span
                    className="min-w-0 flex-1 truncate font-semibold text-[var(--muted-strong)]"
                    title={site.domain}
                  >
                    {site.domain}
                  </span>
                  <span className="shrink-0 font-bold tabular-nums text-[var(--muted-strong)]">
                    {formatDuration(site.seconds)}
                  </span>
                  <Button
                    variant="icon"
                    size="none"
                    className="h-7 w-7 shrink-0 hover:text-rose-500"
                    disabled={!days.length}
                    aria-label={t('sites.delete', { domain: site.domain })}
                    title={t('sites.delete', { domain: site.domain })}
                    onClick={() => {
                      const sortedDays = [...days].sort();
                      setDeleting({
                        appId: app.id,
                        domain: site.domain,
                        range: {
                          from: sortedDays[0],
                          to: sortedDays[sortedDays.length - 1],
                        },
                      });
                    }}
                  >
                    <Trash2 size={12} aria-hidden="true" />
                  </Button>
                </div>
                <div
                  className="ml-5 mr-9 mt-1 h-0.5 overflow-hidden rounded-full bg-[var(--progress-track)]"
                  aria-hidden="true"
                >
                  <div
                    className="h-full rounded-full bg-[var(--accent)] opacity-70"
                    style={{ width: `${Math.max(2, siteShare)}%` }}
                  />
                </div>
              </li>
            );
          })}
          {sites.length > limit && (
            <li className="px-2 py-1.5 text-[10px] font-semibold text-[var(--muted)]">
              <Button
                variant="link"
                size="none"
                aria-expanded={showAll}
                onClick={() => setShowAll((value) => !value)}
              >
                {showAll
                  ? t('sites.showLess')
                  : t('sites.more', { count: hiddenSiteCount })}
              </Button>
            </li>
          )}
          {unattributedSeconds >= 1 && (
            <li className="flex items-center justify-between gap-2 px-2 py-1.5 text-[10px] text-[var(--muted)]">
              <span className="truncate font-medium">
                {t('sites.unattributed')}
              </span>
              <span className="shrink-0 font-semibold tabular-nums">
                {formatDuration(unattributedSeconds)}
              </span>
            </li>
          )}
        </ul>
      ) : (
        <div className="px-2 py-2">
          <p className="text-[10px] font-medium leading-4 text-[var(--muted)]">
            {deletedDomain
              ? t('sites.emptyAfterDelete')
              : websiteTrackingEnabled
                ? t('sites.unavailable', { app: app.name })
                : t('sites.disabled')}
          </p>
          <Button
            variant="link"
            size="none"
            onClick={onOpenSettings}
            className="mt-2"
          >
            {t('sites.openSettings')}
          </Button>
        </div>
      )}
      {deletedDomain && (
        <p
          role="status"
          className="mt-2 break-words px-2 text-[10px] leading-4 text-[var(--muted)]"
        >
          {t('sites.deleted', { domain: deletedDomain })}
        </p>
      )}
      {deleting && (
        <SiteUsageDeleteDialog
          app={{ id: deleting.appId, name: app.name }}
          domain={deleting.domain}
          range={deleting.range}
          onClose={() => setDeleting(null)}
          onSaved={async () => {
            await onActivityChanged();
            setDeletedDomain(deleting.domain);
            window.requestAnimationFrame(() => panelRef.current?.focus());
          }}
        />
      )}
    </div>
  );
}
