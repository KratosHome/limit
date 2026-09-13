import { ExternalLink, GripHorizontal, Pause, Play, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/button';
import type { TrackingWidgetState } from '../types/tracking-widget';

export function TrackingWidget() {
  const { t, i18n } = useTranslation('components');
  const [state, setState] = useState<TrackingWidgetState | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const api = window.trackingWidgetApi;

  useEffect(() => {
    let active = true;
    let receivedEvent = false;
    const syncTheme = () =>
      document.documentElement.classList.toggle(
        'dark',
        localStorage.getItem('limit-theme') === 'dark',
      );
    syncTheme();
    window.addEventListener('storage', syncTheme);
    const unsubscribe = api?.onState((next) => {
      if (!active) return;
      receivedEvent = true;
      setState(next);
      setLoadFailed(false);
    });
    void api?.getState().then(
      (next) => {
        if (active && !receivedEvent) setState(next);
      },
      () => {
        if (active && !receivedEvent) setLoadFailed(true);
      },
    );
    return () => {
      active = false;
      unsubscribe?.();
      window.removeEventListener('storage', syncTheme);
    };
  }, [api]);

  useEffect(() => {
    if (state?.language && state.language !== i18n.resolvedLanguage)
      void i18n.changeLanguage(state.language);
  }, [state?.language, i18n]);

  useEffect(() => {
    if (state?.presentation !== 'menu-bar' || !api) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      void api!.close().then(
        (closed) => {
          if (!closed) setFailed(true);
        },
        () => setFailed(true),
      );
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [api, state?.presentation]);

  async function toggleTracking() {
    if (!api || !state || pending) return;
    setPending(true);
    setFailed(false);
    try {
      setState(await api.setTrackingEnabled(!state.trackingEnabled));
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  async function windowAction(action: 'close' | 'openMainWindow') {
    try {
      if (!(await api?.[action]())) setFailed(true);
    } catch {
      setFailed(true);
    }
  }

  const paused = state && !state.trackingEnabled;
  const locked = state?.activityState === 'locked';
  const menuBar = state?.presentation === 'menu-bar';
  const hasError = failed || loadFailed || !api;
  const status = !state
    ? t(hasError ? 'tracking.loadFailed' : 'tracking.loading')
    : failed
      ? t('tracking.failed')
      : paused
        ? t('tracking.paused')
        : locked
          ? t('tracking.locked')
          : state.currentApp || t('tracking.active');
  const statusLabel =
    state?.currentApp && !paused && !locked && !failed
      ? t('tracking.current', { app: state.currentApp })
      : status;
  return (
    <main className="flex h-screen flex-col justify-between gap-3 overflow-hidden border border-[var(--border)] bg-[var(--surface)] p-3.5 text-[12px] text-[var(--text)]">
      <div
        className={`flex shrink-0 items-center justify-between gap-2 ${menuBar ? '' : 'app-drag'}`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2 text-[11px]">
          <span
            className={`size-2 shrink-0 rounded-full ${hasError ? 'bg-rose-500' : paused || locked ? 'bg-amber-500' : state ? 'bg-emerald-500' : 'bg-slate-400'}`}
            aria-hidden="true"
          />
          <span className="shrink-0 font-bold">Limit</span>
          <span className="text-[var(--muted)]" aria-hidden="true">
            ·
          </span>
          <span
            className={`min-w-0 truncate font-medium ${hasError ? 'text-rose-500' : 'text-[var(--muted-strong)]'}`}
            role="status"
            aria-label={statusLabel}
            title={statusLabel}
          >
            {status}
          </span>
        </div>
        {!menuBar && (
          <GripHorizontal
            size={15}
            className="shrink-0 text-[var(--muted)]"
            aria-hidden="true"
          />
        )}
        <Button
          variant="icon"
          size="none"
          className="size-6 shrink-0"
          aria-label={t('tracking.closeWidget')}
          onClick={() => void windowAction('close')}
        >
          <X size={13} aria-hidden="true" />
        </Button>
      </div>
      <div className="no-drag flex shrink-0 items-center gap-2">
        <Button
          size="sm"
          className="flex-1"
          disabled={!state || pending}
          onClick={() => void toggleTracking()}
        >
          {paused ? (
            <Play size={13} aria-hidden="true" />
          ) : (
            <Pause size={13} aria-hidden="true" />
          )}
          {t(paused ? 'tracking.resume' : 'tracking.pause')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          className="gap-1.5"
          onClick={() => void windowAction('openMainWindow')}
        >
          {t('tracking.openApp')} <ExternalLink size={12} aria-hidden="true" />
        </Button>
      </div>
    </main>
  );
}
