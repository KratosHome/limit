import { Bell, CalendarRange, LoaderCircle, Moon, Pause, Play, RefreshCw, Sun } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { limitApi } from './api';
import { Activity } from './components/Activity';
import { LimitModal } from './components/LimitModal';
import { Limits } from './components/Limits';
import { Overview } from './components/Overview';
import { PeriodPicker } from './components/PeriodPicker';
import { Settings } from './components/Settings';
import { Sidebar } from './components/Sidebar';
import { offsetDay, rangeForPeriod, toDayKey } from './lib/format';
import type { AppLimit, AppUsage, DashboardData, DateRange, LimitInput, LimitNotification, PeriodKey, Settings as SettingsType, ViewKey } from './types';

interface ModalState {
  existing?: AppLimit | null;
  initialAppId?: string | null;
}

function initialTheme(): 'light' | 'dark' {
  const saved = localStorage.getItem('limit-theme');
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function App() {
  const [view, setView] = useState<ViewKey>('overview');
  const [period, setPeriod] = useState<PeriodKey>('today');
  const [customRange, setCustomRange] = useState<DateRange>({ from: toDayKey(offsetDay(new Date(), -6)), to: toDayKey(new Date()) });
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>(initialTheme);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [toast, setToast] = useState<LimitNotification | null>(null);
  const range = useMemo(() => rangeForPeriod(period, customRange), [customRange, period]);

  const loadDashboard = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true);
    try {
      const next = await limitApi.getDashboard(range);
      setData(next);
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не вдалося завантажити статистику');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { void loadDashboard(true); }, [loadDashboard]);
  useEffect(() => {
    const unsubscribeData = limitApi.onDataUpdated(() => void loadDashboard());
    const unsubscribeNotifications = limitApi.onLimitNotification((notification) => {
      setToast(notification);
      window.setTimeout(() => setToast((current) => current === notification ? null : current), 6500);
      void loadDashboard();
    });
    return () => { unsubscribeData(); unsubscribeNotifications(); };
  }, [loadDashboard]);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('limit-theme', theme);
  }, [theme]);

  async function toggleTracking() {
    if (!data) return;
    await limitApi.setTrackingEnabled(!data.settings.trackingEnabled);
    await loadDashboard();
  }

  async function updateSettings(patch: Partial<SettingsType>) {
    await limitApi.updateSettings(patch);
    await loadDashboard();
  }

  function openLimitForApp(app: AppUsage) {
    const existing = data?.limits.find((limit) => limit.appId === app.id) || null;
    setModal(existing ? { existing } : { initialAppId: app.id });
  }

  async function saveLimit(input: LimitInput) {
    await limitApi.saveLimit(input);
    setModal(null);
    await loadDashboard();
  }

  async function deleteLimit(appId: string) {
    await limitApi.deleteLimit(appId);
    setModal(null);
    await loadDashboard();
  }

  async function pauseLimit(appId: string) {
    await limitApi.pauseLimitToday(appId);
    await loadDashboard();
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--background)] text-[var(--text)]">
      <Sidebar view={view} onChange={setView} trackingEnabled={data?.settings.trackingEnabled ?? true} currentApp={data?.tracker.currentApp?.name} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="app-drag flex h-[68px] shrink-0 items-center justify-end gap-3 border-b border-[var(--border)] bg-[var(--background)] px-7">
          {(view === 'overview' || view === 'activity') && <PeriodPicker value={period} onChange={setPeriod} />}
          {period === 'custom' && (view === 'overview' || view === 'activity') && (
            <div className="no-drag flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 shadow-[var(--shadow-xs)]">
              <CalendarRange size={14} className="text-[var(--muted)]" />
              <input type="date" aria-label="Початок періоду" value={customRange.from} min={toDayKey(offsetDay(new Date(), -365))} max={customRange.to} onChange={(event) => setCustomRange((value) => ({ ...value, from: event.target.value }))} className="date-input" />
              <span className="text-[var(--muted)]">—</span>
              <input type="date" aria-label="Кінець періоду" value={customRange.to} min={customRange.from} max={toDayKey(new Date())} onChange={(event) => setCustomRange((value) => ({ ...value, to: event.target.value }))} className="date-input" />
            </div>
          )}
          <div className="no-drag ml-1 flex items-center gap-2">
            <button type="button" onClick={() => setTheme((value) => value === 'light' ? 'dark' : 'light')} className="top-icon-button" aria-label="Змінити тему">{theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}</button>
            <button type="button" onClick={toggleTracking} className={`top-icon-button ${data?.settings.trackingEnabled ? 'text-emerald-600' : 'text-amber-600'}`} aria-label={data?.settings.trackingEnabled ? 'Призупинити трекінг' : 'Відновити трекінг'}>{data?.settings.trackingEnabled ? <Pause size={15} /> : <Play size={15} />}</button>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1240px] px-7 py-7">
            {loading && !data ? (
              <div className="grid min-h-[540px] place-items-center"><div className="flex flex-col items-center gap-3 text-[11px] font-semibold text-[var(--muted)]"><LoaderCircle className="animate-spin text-[var(--accent)]" size={25} /> Завантажуємо ваш день…</div></div>
            ) : error && !data ? (
              <div className="card flex min-h-[420px] flex-col items-center justify-center p-8 text-center"><RefreshCw size={28} className="mb-4 text-rose-500" /><h2 className="text-sm font-bold">Не вдалося відкрити статистику</h2><p className="mt-2 max-w-md text-[11px] text-[var(--muted)]">{error}</p><button type="button" onClick={() => void loadDashboard(true)} className="primary-button mt-5">Спробувати ще</button></div>
            ) : data ? (
              <>
                {data.tracker.permissionState !== 'granted' && data.tracker.lastError && (
                  <div role="alert" className="mb-4 flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[10px] font-semibold text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200"><span>{data.tracker.permissionState === 'unsupported' ? 'Трекінг не підтримується в цьому середовищі' : 'Трекінг тимчасово недоступний'}: {data.tracker.lastError}</span><button type="button" aria-label="Повторити перевірку" onClick={() => void loadDashboard(true)}><RefreshCw size={14} /></button></div>
                )}
                {data.storage.error && (
                  <div role="alert" className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-[10px] font-semibold text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200">{data.storage.error}</div>
                )}
                {view === 'overview' && <Overview data={data} onOpenActivity={() => setView('activity')} onOpenLimits={() => setView('limits')} onEditLimit={(limit) => setModal(limit ? { existing: limit } : {})} />}
                {view === 'activity' && <Activity data={data} onSetLimit={openLimitForApp} />}
                {view === 'limits' && <Limits data={data} onAdd={() => setModal({})} onEdit={(existing) => setModal({ existing })} onPause={(appId) => void pauseLimit(appId)} />}
                {view === 'settings' && <Settings data={data} theme={theme} onThemeChange={setTheme} onSettingsChange={(patch) => void updateSettings(patch)} onOpenPermissions={() => void limitApi.openPermissions()} />}
              </>
            ) : null}
          </div>
        </main>
      </div>

      {modal && data && <LimitModal apps={data.knownApps} existing={modal.existing} initialAppId={modal.initialAppId} onClose={() => setModal(null)} onSave={saveLimit} onDelete={deleteLimit} />}
      {toast && (
        <div role="status" aria-live="assertive" className="fixed bottom-5 right-5 z-[60]">
        <button type="button" onClick={() => { setToast(null); setView('limits'); }} className="flex w-[340px] items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left shadow-[0_18px_50px_rgba(15,23,42,.18)]">
          <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${toast.kind === 'reached' ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/10' : 'bg-amber-50 text-amber-600 dark:bg-amber-500/10'}`}><Bell size={18} /></div>
          <span><strong className="block text-[12px] text-[var(--text)]">{toast.title}</strong><span className="mt-1 block text-[10px] leading-4 text-[var(--muted)]">{toast.message}</span></span>
        </button>
        </div>
      )}
    </div>
  );
}
