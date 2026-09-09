import { Download, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AppUpdates } from '../hooks/use-app-updates';
import { appUpdateAction } from '../types/updates';
import { releaseNotesText } from '../lib/release-notes';
import { Button } from './ui/button';

export function AppUpdateSettings({
  updates,
  platform,
}: {
  updates: AppUpdates;
  platform: string;
}) {
  const { t } = useTranslation('settings');
  const { state, pending, error, run } = updates;
  const status = state?.status;
  const version = state?.version || '—';
  const action = state ? appUpdateAction(state) : 'check';
  const busy = pending || status === 'checking' || status === 'downloading';
  const ready = status === 'installer-ready' || status === 'downloaded';
  const percent = Number.isFinite(state?.percent)
    ? Math.round(Math.min(100, Math.max(0, state!.percent!)))
    : undefined;
  const failure =
    error ||
    (status === 'error'
      ? state?.errorAction || (state?.version ? 'download' : 'check')
      : null);
  const statusText = !state
    ? t('updates.loading')
    : ready
      ? t('updates.ready', { version })
      : status === 'available' || (status === 'error' && state.version)
        ? t('updates.available', { version })
        : status === 'downloading'
          ? t('updates.downloading', { version })
          : status === 'checking'
            ? t('updates.checking')
            : status === 'disabled'
              ? t('updates.disabled')
              : status === 'idle'
                ? t('updates.idle')
                : null;

  return (
    <section className="card p-5" aria-labelledby="app-updates-title">
      <div className="flex items-center gap-2 text-[var(--accent-strong)]">
        <Download size={17} aria-hidden="true" />
        <h2 id="app-updates-title" className="section-title">
          {t('updates.title')}
        </h2>
      </div>
      <p className="mt-2 text-[10px] text-[var(--muted)]">
        {t('updates.currentVersion', { version: state?.currentVersion || '—' })}
      </p>
      <p
        role="status"
        className="mt-4 text-[12px] font-bold leading-5 text-[var(--text)]"
      >
        {statusText}
      </p>
      {(status === 'available' || status === 'downloading' || ready) && (
        <p className="mt-2 text-[10px] leading-5 text-[var(--muted)]">
          {t(
            status === 'installer-ready'
              ? 'updates.installerDetail'
              : status === 'downloaded'
                ? 'updates.restartDetail'
                : platform === 'darwin'
                  ? 'updates.manualDetail'
                  : 'updates.automaticDetail',
          )}
        </p>
      )}
      {status === 'downloading' && (
        <div className="mt-3">
          <progress
            className="h-1.5 w-full accent-[var(--accent)]"
            max={100}
            value={percent}
            aria-label={t('updates.downloading', { version })}
          />
          {percent !== undefined && (
            <p className="mt-1 text-[10px] tabular-nums text-[var(--muted)]">
              {t('updates.progress', { percent })}
            </p>
          )}
        </div>
      )}
      {failure && (
        <p role="alert" className="mt-3 text-[10px] leading-5 text-rose-500">
          {t(`updates.errors.${failure}`)}
        </p>
      )}
      {(state?.releaseName || state?.releaseNotes) && (
        <details className="mt-4 border-t border-[var(--border)] pt-3">
          <summary className="cursor-pointer text-[10px] font-bold text-[var(--muted-strong)]">
            {t('updates.releaseNotes')}
          </summary>
          <div className="mt-2 max-h-44 overflow-y-auto break-words text-[10px] leading-5 text-[var(--muted)]">
            {state.releaseName && (
              <p className="font-semibold">{state.releaseName}</p>
            )}
            {state.releaseNotes && (
              <p className="whitespace-pre-wrap">
                {releaseNotesText(state.releaseNotes)}
              </p>
            )}
          </div>
        </details>
      )}
      {status !== 'disabled' && (
        <Button
          variant={action === 'check' ? 'secondary' : 'default'}
          disabled={busy || (!state && !error)}
          onClick={() => void run(action)}
          className="mt-4 w-full gap-2"
        >
          {busy && (
            <RefreshCw
              size={13}
              className="motion-safe:animate-spin"
              aria-hidden="true"
            />
          )}
          {t(
            busy
              ? 'updates.working'
              : failure
                ? 'updates.retry'
                : `updates.${action}`,
          )}
        </Button>
      )}
    </section>
  );
}
