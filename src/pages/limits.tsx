import {
  BellRing,
  Clock3,
  MoreHorizontal,
  PauseCircle,
  Plus,
  ShieldCheck,
  TimerReset,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AppIcon } from '../components/app-icon';
import { Button } from '../components/ui/button';
import { formatDuration, formatMinutes } from '../lib/format';
import type { AppLimit } from '../types/limits';
import type { DashboardData } from '../types/usage';

interface LimitsProps {
  data: DashboardData;
  onAdd: () => void;
  onEdit: (limit: AppLimit) => void;
  onPause: (appId: string) => void;
}

export function Limits({ data, onAdd, onEdit, onPause }: LimitsProps) {
  const { t } = useTranslation('limits');
  const active = data.limits.filter(
    (limit) => limit.enabled && limit.pausedDate !== data.today,
  ).length;
  const paused = data.limits.filter(
    (limit) => limit.pausedDate === data.today || !limit.enabled,
  ).length;
  const exceeded = data.limits.filter(
    (limit) =>
      limit.enabled &&
      limit.pausedDate !== data.today &&
      (data.todayUsage[limit.appId] || 0) >= limit.dailyLimitMinutes * 60,
  ).length;

  return (
    <div>
      <div className="mb-7 flex items-end justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--accent-strong)]">
            <ShieldCheck size={13} /> {t('eyebrow')}
          </div>
          <h1 className="page-title">{t('title')}</h1>
          <p className="page-subtitle">{t('subtitle')}</p>
        </div>
        <Button onClick={onAdd}>
          <Plus size={16} /> {t('newLimit')}
        </Button>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-4">
        <div className="card flex items-center gap-4 p-4">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10">
            <ShieldCheck size={20} />
          </div>
          <div>
            <div className="text-[22px] font-bold tracking-tight text-[var(--text)]">
              {active}
            </div>
            <div className="text-[10px] font-semibold text-[var(--muted)]">
              {t('summary.active')}
            </div>
          </div>
        </div>
        <div className="card flex items-center gap-4 p-4">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-500/10">
            <PauseCircle size={20} />
          </div>
          <div>
            <div className="text-[22px] font-bold tracking-tight text-[var(--text)]">
              {paused}
            </div>
            <div className="text-[10px] font-semibold text-[var(--muted)]">
              {t('summary.paused')}
            </div>
          </div>
        </div>
        <div className="card flex items-center gap-4 p-4">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-rose-50 text-rose-600 dark:bg-rose-500/10">
            <BellRing size={20} />
          </div>
          <div>
            <div className="text-[22px] font-bold tracking-tight text-[var(--text)]">
              {exceeded}
            </div>
            <div className="text-[10px] font-semibold text-[var(--muted)]">
              {t('summary.reached')}
            </div>
          </div>
        </div>
      </div>

      {data.limits.length ? (
        <div className="grid grid-cols-2 gap-4">
          {data.limits.map((limit) => {
            const used = data.todayUsage[limit.appId] || 0;
            const percentage = Math.min(
              100,
              (used / (limit.dailyLimitMinutes * 60)) * 100,
            );
            const pausedToday = limit.pausedDate === data.today;
            const state =
              !limit.enabled || pausedToday
                ? 'paused'
                : percentage >= 100
                  ? 'exceeded'
                  : percentage >= 80
                    ? 'close'
                    : 'ok';
            const labels = {
              paused: t('status.paused'),
              exceeded: t('status.exceeded'),
              close: t('status.close'),
              ok: t('status.ok'),
            };
            const colors = {
              paused: 'text-slate-500 bg-slate-100 dark:bg-slate-500/10',
              exceeded: 'text-rose-600 bg-rose-50 dark:bg-rose-500/10',
              close: 'text-amber-600 bg-amber-50 dark:bg-amber-500/10',
              ok: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10',
            };
            return (
              <article key={limit.appId} className="card p-5">
                <div className="flex items-start gap-3">
                  <AppIcon id={limit.appId} name={limit.appName} size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="truncate text-[14px] font-bold text-[var(--text)]">
                        {limit.appName}
                      </h2>
                      <Button
                        variant="icon"
                        size="icon"
                        onClick={() => onEdit(limit)}
                        aria-label={t('editLabel', { app: limit.appName })}
                      >
                        <MoreHorizontal size={17} />
                      </Button>
                    </div>
                    <span
                      className={`mt-1 inline-flex rounded-lg px-2 py-1 text-[9px] font-bold ${colors[state]}`}
                    >
                      {labels[state]}
                    </span>
                  </div>
                </div>

                <div className="mt-5 flex items-end justify-between">
                  <div>
                    <span className="text-[24px] font-bold tracking-[-0.04em] text-[var(--text)]">
                      {formatDuration(used)}
                    </span>
                    <span className="ml-1.5 text-[10px] font-semibold text-[var(--muted)]">
                      {t('usedOf', {
                        limit: formatMinutes(limit.dailyLimitMinutes),
                      })}
                    </span>
                  </div>
                  <span className="text-[11px] font-bold text-[var(--muted-strong)]">
                    {Math.round(percentage)}%
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--progress-track)]">
                  <div
                    className={`h-full rounded-full transition-all ${state === 'exceeded' ? 'bg-rose-500' : state === 'close' ? 'bg-amber-500' : state === 'paused' ? 'bg-slate-400' : 'bg-[var(--accent)]'}`}
                    style={{ width: `${Math.max(2, percentage)}%` }}
                  />
                </div>

                <div className="mt-5 flex items-center justify-between border-t border-[var(--border)] pt-4">
                  <div className="flex items-center gap-4 text-[10px] font-semibold text-[var(--muted)]">
                    <span className="inline-flex items-center gap-1.5">
                      <TimerReset size={13} /> {t('daily')}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <BellRing size={13} />{' '}
                      {t('warning', { count: limit.warningMinutes || 0 })}
                    </span>
                  </div>
                  {!pausedToday && limit.enabled ? (
                    <Button
                      variant="link"
                      size="none"
                      onClick={() => onPause(limit.appId)}
                    >
                      {t('pauseToday')}
                    </Button>
                  ) : (
                    <Button
                      variant="link"
                      size="none"
                      onClick={() => onEdit(limit)}
                    >
                      {t('change')}
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <section className="card flex flex-col items-center px-8 py-20 text-center">
          <div className="mb-4 grid h-16 w-16 place-items-center rounded-[22px] bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
            <Clock3 size={27} />
          </div>
          <h2 className="text-[16px] font-bold text-[var(--text)]">
            {t('emptyTitle')}
          </h2>
          <p className="mt-2 max-w-md text-[11px] leading-5 text-[var(--muted)]">
            {t('emptyDescription')}
          </p>
          <Button onClick={onAdd} className="mt-5">
            <Plus size={16} /> {t('addLimit')}
          </Button>
        </section>
      )}
    </div>
  );
}
