import { ChevronDown, ArrowDownRight, ArrowUpRight, Clock3, Gauge, ShieldCheck, Sparkles } from 'lucide-react';
import { useId, useState } from 'react';
import { ActivityChart } from '../components/ActivityChart';
import { AppIcon } from '../components/AppIcon';
import { SiteUsagePanel } from '../components/SiteUsagePanel';
import { Button } from '../components/ui/button';
import { formatChange, formatDuration, formatFullDate, formatMinutes } from '../lib/format';
import type { AppLimit, AppUsage, DashboardData } from '../types';

interface OverviewProps {
  data: DashboardData;
  onOpenActivity: () => void;
  onOpenLimits: () => void;
  onOpenSettings: () => void;
  onEditLimit: (limit?: AppLimit) => void;
}

function StatCard({ label, value, hint, icon: Icon, tone = 'indigo' }: { label: string; value: string; hint: React.ReactNode; icon: typeof Clock3; tone?: 'indigo' | 'teal' | 'amber' | 'rose' }) {
  const tones = {
    indigo: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300',
    teal: 'bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-300',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300',
    rose: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300',
  };
  return (
    <article className="card p-5">
      <div className="mb-5 flex items-center justify-between">
        <span className="text-[12px] font-semibold text-[var(--muted)]">{label}</span>
        <div className={`grid h-9 w-9 place-items-center rounded-xl ${tones[tone]}`}><Icon size={17} /></div>
      </div>
      <div className="text-[26px] font-bold tracking-[-0.045em] text-[var(--text)]">{value}</div>
      <div className="mt-1.5 min-h-4 text-[11px] font-medium text-[var(--muted)]">{hint}</div>
    </article>
  );
}

function TopAppRow({ app, onOpenSettings, totalSeconds, websiteTrackingEnabled }: { app: AppUsage; onOpenSettings: () => void; totalSeconds: number; websiteTrackingEnabled: boolean }) {
  const [expanded, setExpanded] = useState(true);
  const sitesPanelId = useId();
  const sites = app.sites ?? [];
  const isBrowser = app.isBrowser || sites.length > 0 || app.category === 'Браузер';
  const share = totalSeconds ? Math.min(100, (app.seconds / totalSeconds) * 100) : 0;

  return (
    <div className="rounded-xl transition-colors hover:bg-[var(--surface-hover)]">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <AppIcon id={app.id} name={app.name} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-1">
              <span className="truncate text-[12px] font-semibold text-[var(--text)]">{app.name}</span>
              {isBrowser && (
                <Button
                  variant="icon"
                  size="none"
                  className="h-8 w-8 shrink-0"
                  aria-expanded={expanded}
                  aria-controls={sitesPanelId}
                  aria-label={`${expanded ? 'Згорнути' : 'Розгорнути'} сайти для ${app.name}`}
                  onClick={() => setExpanded((value) => !value)}
                >
                  <ChevronDown size={14} aria-hidden="true" className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
                </Button>
              )}
            </div>
            <span className="shrink-0 text-[11px] font-bold tabular-nums text-[var(--text)]">{formatDuration(app.seconds)}</span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--progress-track)]" aria-hidden="true">
            <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.max(3, share)}%` }} />
          </div>
        </div>
      </div>

      {isBrowser && (
        <div id={sitesPanelId} hidden={!expanded}>
          <SiteUsagePanel app={app} websiteTrackingEnabled={websiteTrackingEnabled} onOpenSettings={onOpenSettings} className="mb-2 ml-14 mr-3" />
        </div>
      )}
    </div>
  );
}

export function Overview({ data, onOpenActivity, onOpenLimits, onOpenSettings, onEditLimit }: OverviewProps) {
  const topApp = data.apps[0];
  const change = formatChange(data.totalSeconds, data.previousTotalSeconds);
  const enabledLimits = data.limits.filter((limit) => limit.enabled && limit.pausedDate !== data.today);

  return (
    <div>
      <div className="mb-7">
        <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--accent-strong)]">
          <Sparkles size={13} /> Щоденний фокус
        </div>
        <h1 className="text-[28px] font-bold tracking-[-0.045em] text-[var(--text)]">Ваш цифровий день</h1>
        <p className="mt-1 text-[12px] font-medium text-[var(--muted)]">{formatFullDate()}</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="Активний час"
          value={formatDuration(data.totalSeconds)}
          hint={change === null ? 'Перші дані для порівняння' : (
            <span className={`inline-flex items-center gap-1 ${change <= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
              {change <= 0 ? <ArrowDownRight size={13} /> : <ArrowUpRight size={13} />}
              {Math.abs(change)}% проти минулого періоду
            </span>
          )}
          icon={Clock3}
        />
        <StatCard label="Топ застосунок" value={topApp?.name || '—'} hint={topApp ? formatDuration(topApp.seconds) : 'Поки немає даних'} icon={Gauge} tone="teal" />
        <StatCard label="Активні ліміти" value={String(enabledLimits.length)} hint={enabledLimits.length ? 'Допомагають тримати баланс' : 'Додайте перший ліміт'} icon={ShieldCheck} tone="amber" />
        <StatCard label="Запусків" value={String(data.apps.reduce((sum, app) => sum + app.launches, 0))} hint="Перемикань між застосунками" icon={ArrowUpRight} tone="rose" />
      </div>

      <div className="mt-4 grid grid-cols-[minmax(0,1.58fr)_minmax(300px,.82fr)] items-start gap-4">
        <section className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="section-title">Ритм активності</h2>
              <p className="section-subtitle">Коли ви проводите найбільше часу за екраном</p>
            </div>
            <div className="rounded-lg bg-[var(--surface-muted)] px-2.5 py-1 text-[10px] font-bold text-[var(--muted-strong)]">
              {data.days.length <= 1 ? 'По годинах' : 'По днях'}
            </div>
          </div>
          <ActivityChart data={data.timeline} isHourly={data.days.length <= 1} />
        </section>

        <section className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 pb-3 pt-5">
            <div>
              <h2 className="section-title">Топ застосунків</h2>
              <p className="section-subtitle">За обраний період</p>
            </div>
            <Button variant="link" size="none" onClick={onOpenActivity}>Усі</Button>
          </div>
          <div className="px-2 pb-2">
            {data.apps.slice(0, 5).map((app) => <TopAppRow key={app.id} app={app} totalSeconds={data.totalSeconds} websiteTrackingEnabled={data.settings.websiteTrackingEnabled} onOpenSettings={onOpenSettings} />)}
            {!data.apps.length && <div className="empty-mini">Відкрийте кілька застосунків — статистика зʼявиться тут.</div>}
          </div>
        </section>
      </div>

      <section className="card mt-4 p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="section-title">Ліміти сьогодні</h2>
            <p className="section-subtitle">Прогрес до ваших щоденних цілей</p>
          </div>
          <Button variant="link" size="none" onClick={onOpenLimits}>Керувати</Button>
        </div>
        {enabledLimits.length ? (
          <div className="grid grid-cols-3 gap-3">
            {enabledLimits.slice(0, 3).map((limit) => {
              const used = data.todayUsage[limit.appId] || 0;
              const percentage = Math.min(100, (used / (limit.dailyLimitMinutes * 60)) * 100);
              const exceeded = percentage >= 100;
              const close = percentage >= 80 && !exceeded;
              return (
                <Button variant="card" size="none" key={limit.appId} onClick={() => onEditLimit(limit)} className="p-4">
                  <div className="flex items-center gap-3">
                    <AppIcon id={limit.appId} name={limit.appName} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] font-bold text-[var(--text)]">{limit.appName}</div>
                      <div className={`mt-0.5 text-[10px] font-semibold ${exceeded ? 'text-rose-500' : close ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {exceeded ? 'Ліміт досягнуто' : close ? 'Наближається ліміт' : 'У межах ліміту'}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[10px] font-semibold text-[var(--muted)]">
                    <span>{formatDuration(used)}</span><span>{formatMinutes(limit.dailyLimitMinutes)}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--progress-track)]">
                    <div className={`h-full rounded-full ${exceeded ? 'bg-rose-500' : close ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.max(2, percentage)}%` }} />
                  </div>
                </Button>
              );
            })}
          </div>
        ) : (
          <Button variant="secondary" size="none" onClick={() => onEditLimit()} className="flex w-full items-center justify-center gap-2 rounded-2xl border-dashed border-[var(--border-strong)] bg-[var(--surface-muted)] py-6 text-[12px] text-[var(--muted-strong)] hover:border-[var(--accent)] hover:text-[var(--accent-strong)]">
            <Clock3 size={16} /> Додати перший щоденний ліміт
          </Button>
        )}
      </section>
    </div>
  );
}
