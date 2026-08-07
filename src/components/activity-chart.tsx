import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDuration, formatShortDate } from '../lib/format';
import type { TimelinePoint } from '../types/usage';

interface ActivityChartProps {
  data: TimelinePoint[];
  isHourly: boolean;
}

export function ActivityChart({ data, isHourly }: ActivityChartProps) {
  const { t } = useTranslation('components');
  const max = Math.max(...data.map((point) => point.seconds), 1);
  const visible = data;
  return (
    <div className="mt-6">
      <div
        className="flex h-[190px] items-end gap-1.5"
        role="group"
        aria-label={t('chart.label')}
      >
        {visible.map((point, index) => {
          const height = Math.max(
            point.seconds ? 8 : 2,
            (point.seconds / max) * 100,
          );
          const label = isHourly
            ? `${point.key}:00`
            : formatShortDate(point.key);
          const showLabel = isHourly
            ? index % 2 === 0 || index === visible.length - 1
            : visible.length <= 10 ||
              index % Math.ceil(visible.length / 8) === 0 ||
              index === visible.length - 1;
          const hasAppBreakdown = Array.isArray(point.apps);
          const apps = point.apps ?? [];
          const visibleApps = apps.slice(0, 5);
          const otherSeconds = apps
            .slice(5)
            .reduce((sum, app) => sum + app.seconds, 0);
          const tooltipId = `activity-tooltip-${point.key.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
          const tooltipPosition =
            index < 3
              ? 'left-0'
              : index > visible.length - 4
                ? 'right-0'
                : 'left-1/2 -translate-x-1/2';
          const accessibleBreakdown = apps.length
            ? `. ${apps.map((app) => `${app.name}: ${formatDuration(app.seconds)}`).join(', ')}`
            : '';
          return (
            <div
              key={point.key}
              className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2 focus:outline-none"
            >
              <div
                className="relative flex h-[150px] w-full items-end justify-center rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]"
                style={{ '--bar-height': `${height}%` } as CSSProperties}
                tabIndex={point.seconds > 0 ? 0 : -1}
                role="img"
                aria-label={`${label}: ${formatDuration(point.seconds)}${accessibleBreakdown}`}
                aria-describedby={point.seconds > 0 ? tooltipId : undefined}
              >
                {point.seconds > 0 && (
                  <div
                    id={tooltipId}
                    role="tooltip"
                    className={`chart-tooltip pointer-events-none absolute bottom-[calc(var(--bar-height)+10px)] z-20 hidden w-[230px] rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-left shadow-xl group-hover:block group-focus-within:block ${tooltipPosition}`}
                  >
                    <div className="flex items-baseline justify-between gap-3 border-b border-[var(--border)] pb-2">
                      <span className="text-[11px] font-bold text-[var(--text)]">
                        {isHourly
                          ? `${point.key.padStart(2, '0')}:00–${String(Number(point.key) + 1).padStart(2, '0')}:00`
                          : label}
                      </span>
                      <span className="text-[10px] font-semibold tabular-nums text-[var(--accent-strong)]">
                        {formatDuration(point.seconds)}
                      </span>
                    </div>
                    {isHourly && (
                      <div className="mt-2.5 text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">
                        {t('chart.appsThisHour')}
                      </div>
                    )}
                    {isHourly && visibleApps.length > 0 && (
                      <ul className="mt-2 space-y-2">
                        {visibleApps.map((app) => (
                          <li key={app.id} className="text-[10px]">
                            <div className="flex items-center justify-between gap-3">
                              <span className="truncate font-semibold text-[var(--text)]">
                                {app.name}
                              </span>
                              <span className="shrink-0 font-semibold tabular-nums text-[var(--muted-strong)]">
                                {formatDuration(app.seconds)}
                              </span>
                            </div>
                            <div className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--progress-track)]">
                              <div
                                className="h-full rounded-full bg-[var(--accent)]"
                                style={{
                                  width: `${Math.max(2, (app.seconds / point.seconds) * 100)}%`,
                                }}
                              />
                            </div>
                          </li>
                        ))}
                        {otherSeconds > 0 && (
                          <li className="flex items-center justify-between gap-3 border-t border-[var(--border)] pt-1.5 text-[10px]">
                            <span className="font-medium text-[var(--muted)]">
                              {t('chart.others', {
                                count: apps.length - visibleApps.length,
                              })}
                            </span>
                            <span className="font-semibold tabular-nums text-[var(--text)]">
                              {formatDuration(otherSeconds)}
                            </span>
                          </li>
                        )}
                      </ul>
                    )}
                    {isHourly && point.seconds > 0 && !visibleApps.length && (
                      <p className="mt-2 text-[10px] leading-4 text-[var(--muted-strong)]">
                        {hasAppBreakdown
                          ? t('chart.noBreakdown')
                          : t('chart.restartForBreakdown')}
                      </p>
                    )}
                  </div>
                )}
                <div
                  className="w-full max-w-[25px] rounded-[6px_6px_3px_3px] bg-[var(--chart)] transition-all duration-500 group-hover:bg-[var(--accent)]"
                  style={{ height: `${height}%` }}
                />
              </div>
              <span className="h-4 truncate text-center text-[9px] font-medium text-[var(--muted)]">
                {showLabel ? label : ''}
              </span>
            </div>
          );
        })}
      </div>
      <p className="sr-only">
        {visible
          .map(
            (point) =>
              `${isHourly ? `${point.key}:00` : formatShortDate(point.key)} — ${formatDuration(point.seconds)}`,
          )
          .join('; ')}
      </p>
    </div>
  );
}
