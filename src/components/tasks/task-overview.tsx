import { ArrowUpRight, ListTodo, Timer } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDuration } from '../../lib/format';
import { cn } from '../../lib/utils';
import type { TaskWorkspace } from '../../types/tasks';
import { Button } from '../ui/button';
import { Separator } from '../ui/separator';

export function TaskOverview({
  workspace,
  onOpenTasks,
}: {
  workspace: TaskWorkspace;
  onOpenTasks: () => void;
}) {
  const { t, i18n } = useTranslation('overview');
  const titleId = useId();
  const stats = workspace.statistics;
  const numbers = new Intl.NumberFormat(i18n.language);
  const dates = new Intl.DateTimeFormat(i18n.language, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const from = dates.format(new Date(`${stats.range.from}T12:00:00`));
  const to = dates.format(new Date(`${stats.range.to}T12:00:00`));
  const trackedTasks = stats.byTask
    .filter((task) => task.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds);
  const topTask = trackedTasks[0];
  const metrics = [
    { key: 'completed', value: numbers.format(stats.completedCount) },
    { key: 'time', value: formatDuration(stats.totalSeconds) },
    { key: 'workedOn', value: numbers.format(trackedTasks.length) },
    { key: 'overdue', value: numbers.format(stats.overdueCount) },
  ] as const;

  return (
    <section className="card mt-4 overflow-hidden" aria-labelledby={titleId}>
      <div className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-primary">
            <ListTodo size={18} aria-hidden="true" />
          </div>
          <div>
            <h2 id={titleId} className="section-title">
              {t('tasks.title')}
            </h2>
            <p className="section-subtitle">
              {stats.range.from === stats.range.to ? from : `${from} — ${to}`}
            </p>
          </div>
        </div>
        <Button variant="link" size="none" onClick={onOpenTasks}>
          {t('tasks.open')}
          <ArrowUpRight size={14} data-icon="inline-end" aria-hidden="true" />
        </Button>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 px-5 pb-5 lg:grid-cols-4">
        {metrics.map(({ key, value }) => (
          <div key={key} className="min-w-0">
            <dt className="text-[11px] font-medium text-muted-foreground">
              {t(`tasks.${key}`)}
            </dt>
            <dd className="mt-1.5">
              <p
                className={cn(
                  'text-[24px] font-bold leading-tight tabular-nums tracking-tight',
                  key === 'overdue' && stats.overdueCount > 0
                    ? 'text-destructive'
                    : 'text-foreground',
                )}
              >
                {value}
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {t(key === 'overdue' ? 'tasks.current' : 'tasks.inPeriod')}
              </p>
            </dd>
          </div>
        ))}
      </dl>

      <Separator />
      <div className="flex min-w-0 items-center gap-3 px-5 py-3">
        <Timer
          size={15}
          className="shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        {topTask ? (
          <>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-muted-foreground">
                {t('tasks.topTask')}
              </p>
              <p
                className="mt-0.5 truncate text-[12px] font-medium"
                title={topTask.title}
              >
                {topTask.title}
              </p>
            </div>
            <span className="shrink-0 text-[12px] font-semibold tabular-nums">
              {formatDuration(topTask.seconds)}
            </span>
          </>
        ) : (
          <p className="text-[11px] leading-5 text-muted-foreground">
            {t(workspace.tasks.length ? 'tasks.noTime' : 'tasks.empty')}
          </p>
        )}
      </div>
    </section>
  );
}
