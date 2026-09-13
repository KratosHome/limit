import { useState } from 'react';
import {
  Circle,
  CircleCheck,
  CircleDashed,
  CircleDot,
  CircleSlash,
  CircleAlert,
  Minus,
  SignalLow,
  SignalMedium,
  SignalHigh,
  Play,
  Repeat2,
  Clock3,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { formatDuration } from '../../lib/format';
import type { TaskItem, TaskPriority, TaskStatus } from '../../types/tasks';
import type { KnownApp } from '../../types/usage';
import { Button } from '../ui/button';

const statuses: TaskStatus[] = [
  'in-progress',
  'todo',
  'backlog',
  'done',
  'cancelled',
];
const statusIcons = {
  backlog: CircleDashed,
  todo: Circle,
  'in-progress': CircleDot,
  done: CircleCheck,
  cancelled: CircleSlash,
};
const priorityIcons = {
  none: Minus,
  low: SignalLow,
  medium: SignalMedium,
  high: SignalHigh,
  urgent: CircleAlert,
};

export function TaskStatusIcon({ status }: { status: TaskStatus }) {
  const Icon = statusIcons[status];
  return (
    <Icon
      size={15}
      aria-hidden="true"
      className={cn(
        'shrink-0',
        status === 'in-progress' || status === 'done'
          ? 'text-primary'
          : 'text-muted-foreground',
      )}
    />
  );
}

export function TaskPriorityIcon({ priority }: { priority: TaskPriority }) {
  const Icon = priorityIcons[priority];
  return (
    <Icon
      size={14}
      aria-hidden="true"
      className={cn(
        'shrink-0',
        priority === 'urgent' ? 'text-primary' : 'text-muted-foreground',
      )}
    />
  );
}

export function TaskList({
  tasks,
  knownApps,
  activeTaskId,
  pending,
  onEdit,
  onStatus,
  onStart,
}: {
  tasks: TaskItem[];
  knownApps: KnownApp[];
  activeTaskId: string | null;
  pending: boolean;
  onEdit: (task: TaskItem) => void;
  onStatus: (task: TaskItem, status: TaskStatus) => void;
  onStart: (task: TaskItem) => void;
}) {
  const { t, i18n } = useTranslation('tasks');
  const [shown, setShown] = useState<Partial<Record<TaskStatus, number>>>({});
  const dates = new Intl.DateTimeFormat(i18n.language, {
    month: 'short',
    day: 'numeric',
  });
  const names = new Map(knownApps.map((app) => [app.id, app.name]));
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-popover">
      {statuses.map((status) => {
        const grouped = tasks.filter((task) => task.status === status);
        if (!grouped.length) return null;
        return (
          <section key={status} aria-label={t(`status.${status}`)}>
            <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-4 py-2.5 text-[11px] font-semibold">
              <TaskStatusIcon status={status} />
              <h2>{t(`status.${status}`)}</h2>
              <span className="ml-1 text-muted-foreground">
                {grouped.length}
              </span>
            </div>
            <ul>
              {grouped.slice(0, shown[status] ?? 50).map((task) => {
                const apps = task.appIds.map((id) => names.get(id) ?? id);
                const dateKey = task.scheduledDate ?? task.dueDate;
                const finished = status === 'done' || status === 'cancelled';
                return (
                  <li
                    key={task.id}
                    className={cn(
                      'group flex min-h-[58px] flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-3 py-2.5 last:border-b-0 hover:bg-muted/40 sm:flex-nowrap',
                      activeTaskId === task.id && 'bg-accent/50',
                    )}
                  >
                    <Button
                      variant="icon"
                      size="icon"
                      disabled={pending}
                      title={t(finished ? 'reopen' : 'complete', {
                        number: task.number,
                      })}
                      aria-label={t(finished ? 'reopen' : 'complete', {
                        number: task.number,
                      })}
                      onClick={() => onStatus(task, finished ? 'todo' : 'done')}
                    >
                      <TaskStatusIcon status={status} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="none"
                      className="min-w-0 flex-1 justify-start gap-3 text-left"
                      onClick={() => onEdit(task)}
                      aria-label={t('editTask', { number: task.number })}
                    >
                      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                        TASK-{task.number}
                      </span>
                      <span
                        className={cn(
                          'truncate text-[12px] font-medium',
                          finished && 'text-muted-foreground',
                        )}
                      >
                        {task.title}
                      </span>
                      {task.recurrenceId && (
                        <Repeat2
                          size={12}
                          className="shrink-0 text-muted-foreground"
                          aria-label={t('recurring')}
                        />
                      )}
                    </Button>
                    <div className="flex shrink-0 items-center gap-3 pl-11 text-[10px] text-muted-foreground sm:pl-0">
                      {!!apps.length && (
                        <span
                          className="hidden max-w-24 truncate md:block"
                          title={t('linkedApps', { apps: apps.join(', ') })}
                        >
                          {apps[0]}
                          {apps.length > 1 && ` +${apps.length - 1}`}
                        </span>
                      )}
                      {dateKey && (
                        <time
                          dateTime={dateKey}
                          className="whitespace-nowrap"
                          title={t(
                            task.scheduledDate
                              ? 'editor.schedule'
                              : 'editor.due',
                          )}
                        >
                          {dates.format(new Date(`${dateKey}T12:00:00`))}
                          {task.scheduledTime && ` · ${task.scheduledTime}`}
                        </time>
                      )}
                      <span
                        title={t(`priority.${task.priority}`)}
                        aria-label={t(`priority.${task.priority}`)}
                      >
                        <TaskPriorityIcon priority={task.priority} />
                      </span>
                      <span
                        className="flex items-center gap-1.5 whitespace-nowrap tabular-nums"
                        title={
                          task.estimateMinutes
                            ? t('estimateSpent', {
                                spent: formatDuration(task.trackedSeconds),
                                estimate: formatDuration(
                                  task.estimateMinutes * 60,
                                ),
                              })
                            : t('tracked', {
                                time: formatDuration(task.trackedSeconds),
                              })
                        }
                      >
                        <Clock3 size={12} aria-hidden="true" />
                        {formatDuration(task.trackedSeconds)}
                        {task.estimateMinutes && (
                          <span>
                            {' '}
                            / {formatDuration(task.estimateMinutes * 60)}
                          </span>
                        )}
                      </span>
                      <Button
                        variant="icon"
                        size="icon"
                        disabled={
                          pending || finished || activeTaskId === task.id
                        }
                        onClick={() => onStart(task)}
                        aria-label={t('startTask', { number: task.number })}
                        title={t('startTask', { number: task.number })}
                      >
                        <Play size={14} aria-hidden="true" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
            {grouped.length > (shown[status] ?? 50) && (
              <Button
                variant="ghost"
                size="sm"
                className="my-2 ml-4"
                onClick={() =>
                  setShown((current) => ({
                    ...current,
                    [status]: (current[status] ?? 50) + 50,
                  }))
                }
              >
                {t('showMore', {
                  count: grouped.length - (shown[status] ?? 50),
                })}
              </Button>
            )}
          </section>
        );
      })}
    </div>
  );
}
