import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { limitApi } from '../api';
import { offsetDay, rangeForPeriod, toDayKey } from '../lib/format';
import i18n, { normalizeLanguage, type AppLanguage } from '../i18n';
import { translateError } from '../i18n/helpers';
import type { AppLimit, LimitInput, LimitNotification } from '../types/limits';
import type { DateRange, PeriodKey, ViewKey } from '../types/navigation';
import type { Settings as SettingsType } from '../types/settings';
import type { AppUsage, DashboardData } from '../types/usage';

export interface ModalState {
  existing?: AppLimit | null;
  initialAppId?: string | null;
}

function initialTheme(): 'light' | 'dark' {
  const saved = localStorage.getItem('limit-theme');
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export function useLimitApp() {
  const [view, setView] = useState<ViewKey>('overview');
  const [period, setPeriod] = useState<PeriodKey>('today');
  const [customRange, setCustomRange] = useState<DateRange>({
    from: toDayKey(offsetDay(new Date(), -6)),
    to: toDayKey(new Date()),
  });
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [language, setLanguage] = useState<AppLanguage>(() =>
    normalizeLanguage(i18n.resolvedLanguage),
  );
  const [error, setError] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>(initialTheme);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [toast, setToast] = useState<LimitNotification | null>(null);
  const dashboardRequestId = useRef(0);
  const range = useMemo(
    () => rangeForPeriod(period, customRange),
    [customRange, period],
  );
  const rangeRef = useRef(range);
  rangeRef.current = range;

  const loadDashboard = useCallback(async (showLoader = false) => {
    const requestedRange = rangeRef.current;
    const requestId = ++dashboardRequestId.current;
    const isCurrentRequest = () =>
      requestId === dashboardRequestId.current &&
      requestedRange.from === rangeRef.current.from &&
      requestedRange.to === rangeRef.current.to;
    if (showLoader) setLoading(true);
    try {
      const next = await limitApi.getDashboard(requestedRange);
      if (!isCurrentRequest()) return;
      setData({
        ...next,
        notificationPermission: next.notificationPermission ?? {
          authorizationStatus: 'unknown',
          canPresent: false,
        },
        knownApps: next.knownApps.map((app) => ({
          ...app,
          sites: Array.isArray(app.sites) ? app.sites : [],
        })),
        limits: next.limits.map((limit) => ({
          ...limit,
          id: limit.id || limit.appId,
          siteDomain: limit.siteDomain || null,
        })),
      });
      setError('');
    } catch (reason) {
      if (!isCurrentRequest()) return;
      setError(
        reason instanceof Error
          ? translateError(reason.message, 'dashboardLoad')
          : i18n.t('errors:dashboardLoad'),
      );
    } finally {
      if (isCurrentRequest()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard(true);
  }, [loadDashboard, range]);
  useEffect(() => {
    const unsubscribeData = limitApi.onDataUpdated(() => void loadDashboard());
    const unsubscribeNotifications = limitApi.onLimitNotification(
      (notification) => {
        setToast(notification);
        window.setTimeout(
          () =>
            setToast((current) => (current === notification ? null : current)),
          6500,
        );
        void loadDashboard();
      },
    );
    return () => {
      unsubscribeData();
      unsubscribeNotifications();
    };
  }, [loadDashboard]);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('limit-theme', theme);
  }, [theme]);
  useEffect(() => {
    const language = data?.settings.language;
    if (!language) return;
    document.documentElement.lang = language;
    setLanguage(language);
    localStorage.setItem('limit-language', language);
    if (i18n.resolvedLanguage !== language) void i18n.changeLanguage(language);
  }, [data?.settings.language]);

  async function toggleTracking() {
    if (!data) return;
    await limitApi.setTrackingEnabled(!data.settings.trackingEnabled);
    await loadDashboard();
  }

  async function updateSettings(patch: Partial<SettingsType>) {
    await limitApi.updateSettings(patch);
    await loadDashboard();
  }

  async function changeLanguage(language: AppLanguage) {
    document.documentElement.lang = language;
    setLanguage(language);
    localStorage.setItem('limit-language', language);
    await i18n.changeLanguage(language);
    setData((current) =>
      current
        ? {
            ...current,
            settings: { ...current.settings, language },
          }
        : current,
    );
    await updateSettings({ language });
  }

  function openLimitForApp(app: AppUsage) {
    const existing =
      data?.limits.find(
        (limit) => limit.appId === app.id && !limit.siteDomain,
      ) || null;
    setModal(existing ? { existing } : { initialAppId: app.id });
  }

  async function saveLimit(input: LimitInput) {
    await limitApi.saveLimit(input);
    setModal(null);
    await loadDashboard();
  }

  async function deleteLimit(limitId: string) {
    await limitApi.deleteLimit(limitId);
    setModal(null);
    await loadDashboard();
  }

  async function pauseLimit(limitId: string) {
    await limitApi.pauseLimitToday(limitId);
    await loadDashboard();
  }

  return {
    customRange,
    changeLanguage,
    data,
    deleteLimit,
    error,
    loading,
    language,
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
