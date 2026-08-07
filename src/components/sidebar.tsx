import { BarChart3, Clock3, Gauge, Settings2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ViewKey } from '../types/navigation';
import { Button } from './ui/button';

const navigation: Array<{
  key: ViewKey;
  labelKey:
    | 'navigation.overview'
    | 'navigation.activity'
    | 'navigation.limits'
    | 'navigation.settings';
  icon: typeof Gauge;
}> = [
  { key: 'overview', labelKey: 'navigation.overview', icon: Gauge },
  { key: 'activity', labelKey: 'navigation.activity', icon: BarChart3 },
  { key: 'limits', labelKey: 'navigation.limits', icon: Clock3 },
  { key: 'settings', labelKey: 'navigation.settings', icon: Settings2 },
];

interface SidebarProps {
  view: ViewKey;
  onChange: (view: ViewKey) => void;
  trackingEnabled: boolean;
  currentApp?: string | null;
}

export function Sidebar({
  view,
  onChange,
  trackingEnabled,
  currentApp,
}: SidebarProps) {
  const { t } = useTranslation('components');
  return (
    <aside className="sidebar flex h-full w-[248px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--sidebar)] px-4 pb-5 pt-8">
      <div className="app-drag mb-8 flex items-center gap-3 px-3">
        <div className="grid h-10 w-10 place-items-center rounded-[14px] bg-[var(--accent)] text-white shadow-[0_8px_22px_rgba(78,91,210,.22)]">
          <Clock3 size={21} strokeWidth={2.3} />
        </div>
        <div>
          <div className="text-[17px] font-bold tracking-[-0.03em] text-[var(--text)]">
            Limit
          </div>
          <div className="text-[11px] font-medium text-[var(--muted)]">
            {t('sidebar.tagline')}
          </div>
        </div>
      </div>

      <nav className="space-y-1" aria-label={t('navigation.label')}>
        {navigation.map(({ key, labelKey, icon: Icon }) => (
          <Button
            variant="nav"
            size="none"
            key={key}
            onClick={() => onChange(key)}
            active={view === key}
          >
            <Icon size={18} strokeWidth={view === key ? 2.3 : 1.9} />
            {t(labelKey)}
          </Button>
        ))}
      </nav>

      <div className="mt-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3.5">
        <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-[var(--text)]">
          <span
            className={`relative flex h-2.5 w-2.5 ${trackingEnabled ? '' : 'opacity-60'}`}
          >
            {trackingEnabled && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
            )}
            <span
              className={`relative inline-flex h-2.5 w-2.5 rounded-full ${trackingEnabled ? 'bg-emerald-500' : 'bg-slate-400'}`}
            />
          </span>
          {t(trackingEnabled ? 'sidebar.active' : 'sidebar.paused')}
        </div>
        <p className="truncate text-[11px] leading-4 text-[var(--muted)]">
          {trackingEnabled && currentApp
            ? t('sidebar.current', { app: currentApp })
            : t('sidebar.local')}
        </p>
      </div>
    </aside>
  );
}
