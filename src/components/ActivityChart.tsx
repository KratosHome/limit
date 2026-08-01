import { formatDuration, formatShortDate } from '../lib/format';
import type { TimelinePoint } from '../types';

interface ActivityChartProps {
  data: TimelinePoint[];
  isHourly: boolean;
}

export function ActivityChart({ data, isHourly }: ActivityChartProps) {
  const max = Math.max(...data.map((point) => point.seconds), 1);
  const visible = data;
  return (
    <div className="mt-6">
      <div className="flex h-[190px] items-end gap-1.5" role="group" aria-label="Графік активності">
        {visible.map((point, index) => {
          const height = Math.max(point.seconds ? 8 : 2, (point.seconds / max) * 100);
          const label = isHourly ? `${point.key}:00` : formatShortDate(point.key);
          const showLabel = isHourly
            ? index % 2 === 0 || index === visible.length - 1
            : visible.length <= 10 || index % Math.ceil(visible.length / 8) === 0 || index === visible.length - 1;
          return (
            <div key={point.key} className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
              <div className="relative flex h-[150px] w-full items-end justify-center" style={{ '--bar-height': `${height}%` } as React.CSSProperties}>
                <div className="chart-tooltip pointer-events-none absolute bottom-[calc(var(--bar-height)+8px)] z-10 hidden whitespace-nowrap rounded-lg bg-[var(--text)] px-2 py-1 text-[10px] font-semibold text-[var(--surface)] shadow-lg group-hover:block">
                  {formatDuration(point.seconds)}
                </div>
                <div
                  className="w-full max-w-[25px] rounded-[6px_6px_3px_3px] bg-[var(--chart)] transition-all duration-500 group-hover:bg-[var(--accent)]"
                  style={{ height: `${height}%` }}
                />
              </div>
              <span className="h-4 truncate text-center text-[9px] font-medium text-[var(--muted)]">{showLabel ? label : ''}</span>
            </div>
          );
        })}
      </div>
      <p className="sr-only">
        {visible.map((point) => `${isHourly ? `${point.key}:00` : formatShortDate(point.key)} — ${formatDuration(point.seconds)}`).join('; ')}
      </p>
    </div>
  );
}
