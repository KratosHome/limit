import { BarChart3, Clock3, Gauge, Settings2 } from 'lucide-react';
import type { ViewKey } from '../types';

const navigation: Array<{ key: ViewKey; label: string; icon: typeof Gauge }> = [
  { key: 'overview', label: 'Огляд', icon: Gauge },
  { key: 'activity', label: 'Активність', icon: BarChart3 },
  { key: 'limits', label: 'Ліміти', icon: Clock3 },
  { key: 'settings', label: 'Налаштування', icon: Settings2 },
];

interface SidebarProps {
  view: ViewKey;
  onChange: (view: ViewKey) => void;
  trackingEnabled: boolean;
  currentApp?: string | null;
}

export function Sidebar({ view, onChange, trackingEnabled, currentApp }: SidebarProps) {
  return (
    <aside className="sidebar flex h-full w-[248px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--sidebar)] px-4 pb-5 pt-8">
      <div className="app-drag mb-8 flex items-center gap-3 px-3">
        <div className="grid h-10 w-10 place-items-center rounded-[14px] bg-[var(--accent)] text-white shadow-[0_8px_22px_rgba(78,91,210,.22)]">
          <Clock3 size={21} strokeWidth={2.3} />
        </div>
        <div>
          <div className="text-[17px] font-bold tracking-[-0.03em] text-[var(--text)]">Limit</div>
          <div className="text-[11px] font-medium text-[var(--muted)]">Свідомий час</div>
        </div>
      </div>

      <nav className="space-y-1" aria-label="Основна навігація">
        {navigation.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={`nav-button flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-[13px] font-semibold transition ${
              view === key ? 'bg-[var(--nav-active)] text-[var(--accent-strong)]' : 'text-[var(--muted-strong)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]'
            }`}
          >
            <Icon size={18} strokeWidth={view === key ? 2.3 : 1.9} />
            {label}
          </button>
        ))}
      </nav>

      <div className="mt-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3.5">
        <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-[var(--text)]">
          <span className={`relative flex h-2.5 w-2.5 ${trackingEnabled ? '' : 'opacity-60'}`}>
            {trackingEnabled && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />}
            <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${trackingEnabled ? 'bg-emerald-500' : 'bg-slate-400'}`} />
          </span>
          {trackingEnabled ? 'Трекінг активний' : 'Трекінг на паузі'}
        </div>
        <p className="truncate text-[11px] leading-4 text-[var(--muted)]">
          {trackingEnabled && currentApp ? `Зараз: ${currentApp}` : 'Дані залишаються на пристрої'}
        </p>
      </div>
    </aside>
  );
}
