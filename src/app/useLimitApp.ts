import { useCallback, useEffect, useMemo, useState } from 'react';
import { limitApi } from '../api';
import { offsetDay, rangeForPeriod, toDayKey } from '../lib/format';
import type { AppLimit, AppUsage, DashboardData, DateRange, LimitInput, LimitNotification, PeriodKey, Settings as SettingsType, ViewKey } from '../types';

export interface ModalState {
  existing?: AppLimit | null;
  initialAppId?: string | null;
}

function initialTheme(): 'light' | 'dark' {
  const saved = localStorage.getItem('limit-theme');
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useLimitApp() {
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

  return {
    customRange,
    data,
    deleteLimit,
    error,
    loading,
    loadDashboard,
    modal,
    openLimitForApp,
    pauseLimit,
    period,
    saveLimit,
    setCustomRange,
    setModal,
    setPeriod,
    setTheme,
    setToast,
    setView,
    theme,
    toast,
    toggleTracking,
    updateSettings,
    view,
  };
}
