import { useTranslation } from 'react-i18next';
import { formatDuration, toDayKey } from '../../lib/format';
import type { TaskWorkspace } from '../../types/tasks';
import type { KnownApp } from '../../types/usage';

type Day = TaskWorkspace['statistics']['days'][number];
type Bucket = Day & { end: string };

function groupDays(days: Day[], scale: 'daily' | 'weekly' | 'monthly') {
  const buckets = new Map<string, Bucket>();
  for (const day of [...days].sort((a, b) => a.day.localeCompare(b.day))) {
    const date = new Date(`${day.day}T12:00:00`);
    if (scale === 'weekly')
      date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    const key = scale === 'monthly' ? day.day.slice(0, 7) : toDayKey(date);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.end = day.day;
      bucket.seconds += day.seconds;
      bucket.completed += day.completed;
    } else {
      buckets.set(key, { ...day, end: day.day });
    }
  }
  return [...buckets.values()];
}

export function TaskStatistics({
  workspace,
  knownApps,
}: {
  workspace: TaskWorkspace;
  knownApps: KnownApp[];
}) {
  const { t, i18n } = useTranslation('tasksStats');
  const stats = workspace.statistics;
  const dates = new Intl.DateTimeFormat(i18n.language, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const shortDates = new Intl.DateTimeFormat(i18n.language, {
    day: 'numeric',
    month: 'short',
  });
  const numbers = new Intl.NumberFormat(i18n.language, {
    maximumFractionDigits: 1,
  });
  const scale =
    stats.days.length > 120
      ? 'monthly'
      : stats.days.length > 45
        ? 'weekly'
        : 'daily';
  const buckets = groupDays(stats.days, scale);
  const maxSeconds = Math.max(0, ...buckets.map((day) => day.seconds));
  const timeDivisor = maxSeconds >= 7200 ? 3600 : 60;
  const label = (bucket: Bucket) => {
    const start = shortDates.format(new Date(`${bucket.day}T12:00:00`));
    return bucket.day === bucket.end
      ? start
      : `${start}–${shortDates.format(new Date(`${bucket.end}T12:00:00`))}`;
  };
  const appNames = new Map(knownApps.map((app) => [app.id, app.name]));
  const topTasks = [...stats.byTask]
    .filter((row) => row.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 8);
  const topApps = [...stats.byApp]
    .filter((row) => row.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 8);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[11px] text-muted-foreground">
        {t('period')} · {dates.format(new Date(`${stats.range.from}T12:00:00`))}
        {stats.range.from !== stats.range.to &&
          ` — ${dates.format(new Date(`${stats.range.to}T12:00:00`))}`}
      </p>
      <dl className="grid grid-cols-2 overflow-hidden rounded-xl border border-border bg-popover lg:grid-cols-4">
        {[
          {
            key: 'tracked',
            value: formatDuration(stats.totalSeconds),
            hint: 'inPeriod',
          },
          {
            key: 'completed',
            value: numbers.format(stats.completedCount),
            hint: 'inPeriod',
          },
          {
            key: 'open',
            value: numbers.format(stats.openCount),
            hint: 'current',
          },
          {
            key: 'overdue',
            value: numbers.format(stats.overdueCount),
            hint: 'current',
          },
        ].map(({ key, value, hint }) => (
          <div
            key={key}
            className="border-border p-4 odd:border-r [&:nth-child(-n+2)]:border-b lg:border-b-0 lg:[&:not(:last-child)]:border-r lg:[&:nth-child(-n+2)]:border-b-0"
          >
            <dt className="text-[11px] text-muted-foreground">
              {t(key as 'tracked' | 'completed' | 'open' | 'overdue')}
            </dt>
            <dd>
              <p className="mt-2 text-[24px] font-semibold tabular-nums tracking-tight">
                {value}
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {t(hint as 'inPeriod' | 'current')}
              </p>
            </dd>
          </div>
        ))}
      </dl>
      <div className="grid gap-4 xl:grid-cols-2">
        <DailyBars
          title={t('timeChart')}
          subtitle={`${t(timeDivisor === 3600 ? 'hours' : 'minutes')} · ${t(scale)}`}
          points={buckets.map((bucket) => ({
            key: bucket.day,
            label: label(bucket),
            value: bucket.seconds / timeDivisor,
            detail: formatDuration(bucket.seconds),
          }))}
          formatValue={(value) => numbers.format(value)}
          empty={t('noTime')}
        />
        <DailyBars
          title={t('completedChart')}
          subtitle={`${t('tasks')} · ${t(scale)}`}
          points={buckets.map((bucket) => ({
            key: bucket.day,
            label: label(bucket),
            value: bucket.completed,
            detail: numbers.format(bucket.completed),
          }))}
          formatValue={(value) => numbers.format(value)}
          empty={t('noCompleted')}
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <TimeRanking
          title={t('topTasks')}
          rows={topTasks.map((row) => ({
            key: row.taskId,
            name: row.title,
            seconds: row.seconds,
          }))}
          total={stats.totalSeconds}
          empty={t('noTasks')}
        />
        <TimeRanking
          title={t('topApps')}
          rows={topApps.map((row) => ({
            key: row.appId ?? 'manual',
            name: row.appId
              ? (appNames.get(row.appId) ?? row.appId)
              : t('manual'),
            seconds: row.seconds,
          }))}
          total={stats.totalSeconds}
          empty={t('noApps')}
          hint={t('appHint')}
        />
      </div>
    </div>
  );
}

function DailyBars({
  title,
  subtitle,
  points,
  formatValue,
  empty,
}: {
  title: string;
  subtitle: string;
  points: { key: string; label: string; value: number; detail: string }[];
  formatValue: (value: number) => string;
  empty: string;
}) {
  const max = Math.max(1, ...points.map((point) => point.value));
  const hasData = points.some((point) => point.value > 0);
  return (
    <section className="min-w-0 rounded-xl border border-border bg-popover p-4">
      <h3 className="text-[12px] font-semibold">{title}</h3>
      <p className="mt-1 text-[10px] text-muted-foreground">{subtitle}</p>
      {hasData ? (
        <div className="mt-5 flex gap-2">
          <div
            aria-hidden="true"
            className="flex h-36 min-w-6 shrink-0 flex-col justify-between text-right text-[9px] tabular-nums text-muted-foreground"
          >
            <span>{formatValue(max)}</span>
            <span>0</span>
          </div>
          <div className="min-w-0 flex-1">
            <div
              className="flex h-36 items-end gap-1 border-y border-border"
              role="group"
              aria-label={`${title} · ${subtitle}`}
            >
              {points.map((point) => (
                <div
                  key={point.key}
                  className="group relative flex h-full min-w-0 flex-1 items-end justify-center rounded-sm focus-visible:outline-2 focus-visible:outline-primary"
                  role="img"
                  aria-label={`${point.label}: ${point.detail}`}
                  tabIndex={point.value > 0 ? 0 : -1}
                >
                  <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-[10px] shadow-md group-hover:block group-focus-visible:block">
                    {point.label} · {point.detail}
                  </span>
                  <div
                    aria-hidden="true"
                    className="w-full max-w-8 rounded-t-sm bg-primary/75 group-hover:bg-primary group-focus-visible:bg-primary"
                    style={{ height: `${(point.value / max) * 100}%` }}
                  />
                </div>
              ))}
            </div>
            <div
              aria-hidden="true"
              className="mt-2 flex justify-between gap-3 text-[9px] text-muted-foreground"
            >
              <span>{points[0]?.label}</span>
              {points.length > 1 && (
                <span className="text-right">{points.at(-1)?.label}</span>
              )}
            </div>
          </div>
        </div>
      ) : (
        <p className="flex min-h-44 items-center text-[11px] leading-5 text-muted-foreground">
          {empty}
        </p>
      )}
    </section>
  );
}

function TimeRanking({
  title,
  rows,
  total,
  empty,
  hint,
}: {
  title: string;
  rows: { key: string; name: string; seconds: number }[];
  total: number;
  empty: string;
  hint?: string;
}) {
  return (
    <section className="min-w-0 rounded-xl border border-border bg-popover p-4">
      <h3 className="text-[12px] font-semibold">{title}</h3>
      {hint && (
        <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
          {hint}
        </p>
      )}
      {rows.length ? (
        <ol className="mt-3 divide-y divide-border">
          {rows.map((row) => (
            <li key={row.key} className="py-3">
              <div className="flex items-baseline justify-between gap-3 text-[11px]">
                <span className="min-w-0 truncate" title={row.name}>
                  {row.name}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {formatDuration(row.seconds)}
                </span>
              </div>
              <div
                aria-hidden="true"
                className="mt-2 h-1 rounded-full bg-muted"
              >
                <div
                  className="h-full rounded-full bg-primary/70"
                  style={{
                    width: `${total > 0 ? Math.min(100, (row.seconds / total) * 100) : 0}%`,
                  }}
                />
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="py-8 text-[11px] leading-5 text-muted-foreground">
          {empty}
        </p>
      )}
    </section>
  );
}
