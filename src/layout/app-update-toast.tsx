import { Download, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AppUpdates } from '../hooks/use-app-updates';
import { appUpdateAction } from '../types/updates';
import { Button } from '../components/ui/button';

export function AppUpdateToast({
  updates,
  onOpenSettings,
}: {
  updates: AppUpdates;
  onOpenSettings: () => void;
}) {
  const { t } = useTranslation('settings');
  const { toast, pending, error, run, dismissToast } = updates;
  if (!toast) return null;
  const action = appUpdateAction(toast);
  const failure = error || toast.errorAction;
  const actionLabel = pending
    ? 'updates.working'
    : failure
      ? 'updates.retry'
      : action === 'download'
        ? 'updates.toastDownload'
        : (`updates.${action}` as const);

  return (
    <div className="w-[360px] max-w-[calc(100vw-40px)] rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_18px_50px_rgba(15,23,42,.18)]">
      <div className="flex items-start gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--surface-muted)] text-[var(--accent-strong)]">
          <Download size={18} aria-hidden="true" />
        </div>
        <p
          role="status"
          className="min-w-0 flex-1 text-[12px] font-bold leading-5 text-[var(--text)]"
        >
          {t(
            toast.status === 'error'
              ? 'updates.failed'
              : toast.status === 'available'
                ? 'updates.available'
                : 'updates.ready',
            { version: toast.version || '—' },
          )}
        </p>
        <Button
          variant="icon"
          size="icon"
          onClick={dismissToast}
          aria-label={t('updates.dismiss')}
          className="shrink-0"
        >
          <X size={14} aria-hidden="true" />
        </Button>
      </div>
      {failure && (
        <p role="alert" className="mt-2 text-[10px] leading-4 text-rose-500">
          {t(`updates.errors.${failure}`)}
        </p>
      )}
      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-[12px] font-semibold leading-4">
        <Button
          size="none"
          disabled={pending}
          onClick={() => void run(action)}
          aria-label={t(pending || failure ? actionLabel : `updates.${action}`)}
          className="min-h-8 min-w-0 whitespace-normal py-2"
        >
          {t(actionLabel)}
        </Button>
        <Button
          variant="link"
          size="sm"
          aria-label={t('updates.detailsLabel')}
          className="whitespace-nowrap"
          onClick={() => {
            dismissToast();
            onOpenSettings();
          }}
        >
          {t('updates.details')}
        </Button>
      </div>
    </div>
  );
}
