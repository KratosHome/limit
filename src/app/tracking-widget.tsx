import { ExternalLink, GripHorizontal, Pause, Play, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/button';
import type { TrackingWidgetState } from '../types/tracking-widget';

function elapsedPause(startedAt: number | null, now: number) {
  const seconds = Math.max(0, Math.floor((now - (startedAt ?? now)) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function TrackingWidget() {
  const { t, i18n } = useTranslation('components');
  const [state, setState] = useState<TrackingWidgetState | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(Date.now);
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
    });
    void api?.getState().then(
      (next) => {
        if (active && !receivedEvent) setState(next);
      },
      () => {
        if (active) setFailed(true);
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
    if (!state?.pauseStartedAt || state.trackingEnabled) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [state?.pauseStartedAt, state?.trackingEnabled]);

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
  return (
    <main className="flex h-screen flex-col gap-3 overflow-hidden border border-[var(--border)] bg-[var(--surface)] p-3.5 text-[12px] text-[var(--text)]">
      <div className="app-drag flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] font-bold">
          <span
            className={`size-2 rounded-full ${paused || locked ? 'bg-amber-500' : 'bg-emerald-500'}`}
          />
          Limit
        </div>
        <GripHorizontal
          size={15}
          className="text-[var(--muted)]"
          aria-hidden="true"
        />
        <Button
          variant="icon"
          size="none"
          className="size-6"
          aria-label={t('tracking.closeWidget')}
          onClick={() => void windowAction('close')}
        >
          <X size={13} aria-hidden="true" />
        </Button>
      </div>
      <div className="min-w-0 flex-1" role="status">
        <p className="text-[14px] font-bold">
          {!state
            ? t(failed || !api ? 'tracking.loadFailed' : 'tracking.loading')
            : t(
                paused
                  ? 'tracking.paused'
                  : locked
                    ? 'tracking.locked'
                    : 'tracking.active',
              )}
        </p>
        <p className="mt-1 truncate text-[10px] leading-4 text-[var(--muted)]">
          {failed && state
            ? t('tracking.failed')
            : paused
              ? state.pauseStartedAt
                ? t('tracking.elapsed', {
                    time: elapsedPause(state.pauseStartedAt, now),
                  })
                : t('tracking.pausedDetail')
              : locked
                ? t('tracking.lockedDetail')
                : state?.currentApp
                  ? t('tracking.current', { app: state.currentApp })
                  : t('tracking.ready')}
        </p>
      </div>
      <div className="no-drag flex items-center gap-2">
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
