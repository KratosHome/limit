import { LoaderCircle, RefreshCw } from 'lucide-react';
import { Button } from '../components/ui/button';
import type { DashboardData } from '../types';

interface DashboardContentProps {
  children: React.ReactNode;
  data: DashboardData | null;
  error: string;
  loading: boolean;
  onReload: () => void;
}

export function DashboardContent({ children, data, error, loading, onReload }: DashboardContentProps) {
  if (loading && !data) {
    return (
      <div className="grid min-h-[540px] place-items-center">
        <div className="flex flex-col items-center gap-3 text-[11px] font-semibold text-[var(--muted)]"><LoaderCircle className="animate-spin text-[var(--accent)]" size={25} /> Завантажуємо ваш день...</div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="card flex min-h-[420px] flex-col items-center justify-center p-8 text-center">
        <RefreshCw size={28} className="mb-4 text-rose-500" />
        <h2 className="text-sm font-bold">Не вдалося відкрити статистику</h2>
        <p className="mt-2 max-w-md text-[11px] text-[var(--muted)]">{error}</p>
        <Button onClick={onReload} className="mt-5">Спробувати ще</Button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <>
      {data.tracker.permissionState !== 'granted' && data.tracker.lastError && (
        <div role="alert" className="mb-4 flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[10px] font-semibold text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
          <span>{data.tracker.permissionState === 'unsupported' ? 'Трекінг не підтримується в цьому середовищі' : 'Трекінг тимчасово недоступний'}: {data.tracker.lastError}</span>
          <Button variant="ghost" size="none" aria-label="Повторити перевірку" onClick={onReload}><RefreshCw size={14} /></Button>
        </div>
      )}
      {data.storage.error && (
        <div role="alert" className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-[10px] font-semibold text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200">{data.storage.error}</div>
      )}
      {children}
    </>
  );
}
