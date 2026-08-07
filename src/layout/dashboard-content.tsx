import { LoaderCircle, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/button';
import { translateError } from '../i18n/helpers';
import type { DashboardData } from '../types/usage';

interface DashboardContentProps {
  children: ReactNode;
  data: DashboardData | null;
  error: string;
  loading: boolean;
  onReload: () => void;
}

export function DashboardContent({
  children,
  data,
  error,
  loading,
  onReload,
}: DashboardContentProps) {
  const { t } = useTranslation(['errors', 'common']);
  if (loading && !data) {
    return (
      <div className="grid min-h-[540px] place-items-center">
        <div className="flex flex-col items-center gap-3 text-[11px] font-semibold text-[var(--muted)]">
          <LoaderCircle
            className="animate-spin text-[var(--accent)]"
            size={25}
          />{' '}
          {t('errors:dashboard.loading')}
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="card flex min-h-[420px] flex-col items-center justify-center p-8 text-center">
        <RefreshCw size={28} className="mb-4 text-rose-500" />
        <h2 className="text-sm font-bold">{t('errors:dashboard.title')}</h2>
        <p className="mt-2 max-w-md text-[11px] text-[var(--muted)]">
          {translateError(error, 'dashboardLoad')}
        </p>
        <Button onClick={onReload} className="mt-5">
          {t('common:actions.retry')}
        </Button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <>
      {data.tracker.permissionState !== 'granted' && data.tracker.lastError && (
        <div
          role="alert"
          className="mb-4 flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[10px] font-semibold text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200"
        >
          <span>
            {data.tracker.permissionState === 'unsupported'
              ? t('errors:dashboard.unsupported')
              : t('errors:dashboard.unavailable')}
            : {translateError(data.tracker.lastError)}
          </span>
          <Button
            variant="ghost"
            size="none"
            aria-label={t('errors:dashboard.retryLabel')}
            onClick={onReload}
          >
            <RefreshCw size={14} />
          </Button>
        </div>
      )}
      {data.storage.error && (
        <div
          role="alert"
          className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-[10px] font-semibold text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200"
        >
          {translateError(data.storage.error)}
        </div>
      )}
      {children}
    </>
  );
}
