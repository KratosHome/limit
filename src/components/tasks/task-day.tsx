import { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  Play,
  Plus,
  Search,
  Sun,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTaskDay } from '../../hooks/use-task-day';
import { buildTaskDayModel } from '../../lib/task-day';
import { formatDuration, toDayKey } from '../../lib/format';
import { cn } from '../../lib/utils';
import type { TaskItem, TaskStatus, TaskWorkspace } from '../../types/tasks';
import type { KnownApp } from '../../types/usage';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Separator } from '../ui/separator';
import { TaskDatePicker } from './task-date-picker';
import { TaskPriorityIcon, TaskStatusIcon } from './task-list';

function clockTime(minutes: number) {
  if (minutes === 1440) return '24:00';
  const minute = Math.floor(minutes) % 1440;
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

export function TaskDay({
  workspace,
  knownApps,
  onEdit,
  onCreate,
  onPlan,
  onStart,
  onStatus,
  pending,
}: {
  workspace: TaskWorkspace;
  knownApps: KnownApp[];
  onEdit: (task: TaskItem) => void;
  onCreate: (date: string, time?: string) => void;
  onPlan: (task: TaskItem, day: string) => void;
  onStart: (task: TaskItem) => void;
  onStatus: (task: TaskItem, status: TaskStatus) => void;
  pending: boolean;
}) {
  const { t, i18n } = useTranslation('tasksDay');
  const { t: taskText } = useTranslation('tasks');
  const [day, setDay] = useState(() => toDayKey(new Date()));
  const [now, setNow] = useState(() => new Date());
  const [search, setSearch] = useState('');
  const [shown, setShown] = useState(8);
  const [scheduleShown, setScheduleShown] = useState(50);
  const data = useTaskDay(workspace, day);
  const model = buildTaskDayModel(
    data.workspace.tasks,
    data.statistics ?? workspace.statistics,
    day,
  );
  const conflicts = new Set(model.conflictTaskIds);
  const names = new Map(knownApps.map((app) => [app.id, app.name]));
  const today = toDayKey(now);
  const backlog = model.unplannedBacklog.filter((task) =>
    `${task.title} TASK-${task.number}`
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase()),
  );
  const missingEstimates = model.plannedTasks.filter(
    (task) => task.estimateMinutes === null,
  ).length;
  const completion = model.plannedTasks.length
    ? model.completedCount / model.plannedTasks.length
    : 0;
  const completeEstimate =
    missingEstimates === 0 && model.totalEstimatedSeconds > 0;
  const budget = completeEstimate
    ? (model.plannedTrackedSeconds ?? 0) / model.totalEstimatedSeconds
    : 0;
  const aboveEstimate =
    completeEstimate &&
    (model.plannedTrackedSeconds ?? 0) > model.totalEstimatedSeconds;
  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(interval);
  }, []);
  function chooseDay(next: string | null) {
    if (!next) return;
    setDay(next);
    setScheduleShown(50);
  }
  function offsetDay(offset: number) {
    const date = new Date(`${day}T12:00:00`);
    date.setDate(date.getDate() + offset);
    chooseDay(toDayKey(date));
  }
  const dateLabel = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${day}T12:00:00`));

  function taskRow(task: TaskItem) {
    const done = task.status === 'done';
    const actual = model.dayTimeKnown
      ? (model.actualByTask[task.id] ?? 0)
      : null;
    return (
      <div
        className={cn(
          'flex min-w-0 items-start gap-2 rounded-xl border border-border bg-popover p-3',
          workspace.timer.taskId === task.id && 'border-primary',
        )}
      >
        <Button
          variant="icon"
          size="icon"
          disabled={pending}
          aria-label={taskText(done ? 'reopen' : 'complete', {
            number: task.number,
          })}
          onClick={() => onStatus(task, done ? 'todo' : 'done')}
        >
          <TaskStatusIcon status={task.status} />
        </Button>
        <div className="min-w-0 flex-1">
          <Button
            variant="ghost"
            size="none"
            className="w-full justify-start! text-left"
            disabled={pending}
            onClick={() => onEdit(task)}
            aria-label={`${taskText('editTask', { number: task.number })}: ${task.title}`}
          >
            <span
              className={cn(
                'break-words text-xs leading-5',
                done && 'text-muted-foreground line-through',
              )}
            >
              {task.title}
            </span>
          </Button>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
            <span className="tabular-nums">TASK-{task.number}</span>
            <span title={taskText(`priority.${task.priority}`)}>
              <TaskPriorityIcon priority={task.priority} />
            </span>
            <span>
              {task.estimateMinutes === null
                ? t('estimateUnknown')
                : t('planned', {
                    time: formatDuration(task.estimateMinutes * 60),
                  })}
            </span>
            <span>
              {actual === null
                ? t('actualUnknown')
                : t('actual', { time: formatDuration(actual) })}
            </span>
            {!!task.appIds.length && (
              <span
                className="max-w-40 truncate"
                title={task.appIds.map((id) => names.get(id) ?? id).join(', ')}
              >
                {names.get(task.appIds[0]) ?? task.appIds[0]}
                {task.appIds.length > 1 && ` +${task.appIds.length - 1}`}
              </span>
            )}
          </div>
        </div>
        <Button
          variant="icon"
          size="icon"
          disabled={pending || done || workspace.timer.taskId === task.id}
          aria-label={taskText('startTask', { number: task.number })}
          title={taskText('startTask', { number: task.number })}
          onClick={() => onStart(task)}
        >
          <Play size={14} aria-hidden="true" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-5 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="icon"
            size="icon"
            aria-label={t('previous')}
            disabled={day <= '1900-01-01'}
            onClick={() => offsetDay(-1)}
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </Button>
          <div className="w-48">
            <TaskDatePicker
              value={day}
              required
              onChange={chooseDay}
              label={t('date')}
            />
          </div>
          <Button
            variant="icon"
            size="icon"
            aria-label={t('next')}
            disabled={day >= '2100-12-31'}
            onClick={() => offsetDay(1)}
          >
            <ChevronRight size={16} aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => chooseDay(today)}>
            {t('today')}
          </Button>
        </div>
        <Button disabled={pending} onClick={() => onCreate(day)}>
          <Plus size={14} aria-hidden="true" />
          {t('add')}
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground">{t('scope')}</p>
      {data.error && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 text-destructive"
        >
          <p className="flex-1">{t('loadFailed')}</p>
          <Button variant="secondary" size="sm" onClick={data.retry}>
            {t('retry')}
          </Button>
        </div>
      )}
      {data.loading && (
        <p role="status" className="text-[10px] text-muted-foreground">
          {t('loading')}
        </p>
      )}
      {data.workspace.generationLimited && (
        <p role="status" className="text-[10px] text-muted-foreground">
          {t('capacity')}
        </p>
      )}
      <section
        className="flex flex-col gap-5 rounded-xl border border-border bg-popover p-5"
        aria-label={t('title')}
      >
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="flex min-w-0 flex-col gap-2">
            <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Sun size={14} aria-hidden="true" />
              {t('title')}
            </span>
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              {dateLabel}
            </h2>
            <p className="text-[11px] text-muted-foreground">
              {t('estimated')} · {formatDuration(model.totalEstimatedSeconds)}
            </p>
            {missingEstimates > 0 && (
              <p className="text-[10px] text-muted-foreground">
                {t('unestimated', { count: missingEstimates })}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-5">
            <DayRing
              label={t('completed')}
              value={
                model.dayTimeKnown
                  ? t('completedValue', {
                      done: model.completedCount,
                      total: model.plannedTasks.length,
                    })
                  : '—'
              }
              ratio={model.dayTimeKnown ? completion : 0}
              center={
                model.dayTimeKnown ? `${Math.round(completion * 100)}%` : '—'
              }
              hint={t(model.plannedTasks.length ? 'completionHint' : 'noPlan')}
            />
            <DayRing
              label={t('budget')}
              value={
                model.dayTimeKnown
                  ? completeEstimate
                    ? t('budgetValue', {
                        spent: formatDuration(model.plannedTrackedSeconds ?? 0),
                        estimate: formatDuration(model.totalEstimatedSeconds),
                      })
                    : formatDuration(model.plannedTrackedSeconds ?? 0)
                  : '—'
              }
              ratio={budget}
              center={
                model.dayTimeKnown && completeEstimate
                  ? `${Math.round(budget * 100)}%`
                  : '—'
              }
              hint={
                aboveEstimate
                  ? t('aboveEstimate', {
                      time: formatDuration(
                        (model.plannedTrackedSeconds ?? 0) -
                          model.totalEstimatedSeconds,
                      ),
                    })
                  : t(
                      completeEstimate
                        ? 'budgetHint'
                        : model.totalEstimatedSeconds > 0
                          ? 'partialEstimate'
                          : 'noEstimate',
                    )
              }
              over={aboveEstimate}
            />
          </div>
        </div>
        <Separator />
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[11px] font-semibold">
              {t('overview')}
              {day === today && (
                <span className="ml-3 font-normal tabular-nums text-muted-foreground">
                  {t('now')} ·{' '}
                  {clockTime(now.getHours() * 60 + now.getMinutes())}
                </span>
              )}
            </h3>
            <span className="text-[10px] text-muted-foreground">
              {t('occupied')} ·{' '}
              {formatDuration(model.unionScheduledMinutes * 60)}
            </span>
          </div>
          <div
            className="relative h-8 overflow-hidden rounded-md bg-muted"
            aria-hidden="true"
          >
            {[0, 6, 12, 18].map((hour) => (
              <span
                key={hour}
                className="absolute inset-y-0 border-l border-border"
                style={{ left: `${(hour / 24) * 100}%` }}
              />
            ))}
            {model.scheduledBlocks.map((block) => (
              <span
                key={block.task.id}
                className={cn(
                  'absolute inset-y-1 rounded-sm',
                  conflicts.has(block.task.id)
                    ? 'bg-destructive/60'
                    : 'bg-primary/60',
                )}
                style={{
                  left: `${(block.startMinutes / 1440) * 100}%`,
                  width: block.estimated
                    ? `${((block.visibleEndMinutes - block.startMinutes) / 1440) * 100}%`
                    : '2px',
                }}
              />
            ))}
            {day === today && (
              <span
                className="absolute inset-y-0 border-l-2 border-foreground"
                style={{
                  left: `${((now.getHours() * 60 + now.getMinutes()) / 1440) * 100}%`,
                }}
                title={t('now')}
              />
            )}
          </div>
          <div
            className="mt-2 flex justify-between text-[9px] tabular-nums text-muted-foreground"
            aria-hidden="true"
          >
            {['00:00', '06:00', '12:00', '18:00', '24:00'].map((hour) => (
              <span key={hour}>{hour}</span>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            {t('overviewHint')}
          </p>
          {(model.outsidePlanSeconds ?? 0) > 0 && (
            <p
              className="mt-2 text-[11px] text-muted-foreground"
              title={t('outsideHint')}
            >
              {t('outside', {
                time: formatDuration(model.outsidePlanSeconds ?? 0),
              })}
            </p>
          )}
        </div>
      </section>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
        <section className="min-w-0" aria-label={t('timeline')}>
          <div className="mb-4 flex flex-col gap-1">
            <h3 className="text-sm font-semibold">{t('timeline')}</h3>
            <p className="text-[10px] text-muted-foreground">
              {t('timelineHint')}
            </p>
          </div>
          {!!model.conflictTaskIds.length && (
            <p className="mb-3 text-[11px] text-destructive">
              {t('conflictCount', { count: model.conflictTaskIds.length })}
            </p>
          )}
          <ol className="flex flex-col gap-3">
            {model.scheduledBlocks.slice(0, scheduleShown).map((block) => (
              <li
                key={block.task.id}
                className="grid min-w-0 grid-cols-[60px_minmax(0,1fr)] gap-3"
              >
                <div className="flex flex-col gap-1 border-r border-border pr-3 pt-3 text-right text-[11px] tabular-nums">
                  <time>{clockTime(block.startMinutes)}</time>
                  {block.estimated && (
                    <>
                      <time className="text-[10px] text-muted-foreground">
                        {clockTime(block.endMinutes)}
                      </time>
                      {block.endMinutes > 1440 && (
                        <span className="text-[9px] text-muted-foreground">
                          {t('nextDay')}
                        </span>
                      )}
                    </>
                  )}
                </div>
                <div className="min-w-0">
                  {taskRow(block.task)}
                  {(conflicts.has(block.task.id) ||
                    block.endMinutes > 1440) && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {conflicts.has(block.task.id) && (
                        <Badge variant="outline">{t('conflict')}</Badge>
                      )}
                      {block.endMinutes > 1440 && (
                        <Badge variant="outline">{t('crossesMidnight')}</Badge>
                      )}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
          {model.scheduledBlocks.length > scheduleShown && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-3"
              onClick={() => setScheduleShown((value) => value + 50)}
            >
              {t('showMore', {
                count: model.scheduledBlocks.length - scheduleShown,
              })}
            </Button>
          )}
          {!model.scheduledBlocks.length && !data.loading && !data.error && (
            <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border p-5">
              <Clock3 size={22} className="text-primary" aria-hidden="true" />
              <h4 className="font-semibold">{t('noSchedule')}</h4>
              <p className="text-[11px] text-muted-foreground">
                {t('noScheduleHint')}
              </p>
              <Button
                variant="secondary"
                size="sm"
                disabled={pending}
                onClick={() => onCreate(day, '09:00')}
              >
                {t('createMorning')}
              </Button>
            </div>
          )}
          {!!model.unscheduledTasks.length && (
            <div className="mt-5 flex flex-col gap-3">
              <h3 className="text-sm font-semibold">{t('untimed')}</h3>
              <p className="text-[10px] text-muted-foreground">
                {t('untimedHint')}
              </p>
              {model.unscheduledTasks.slice(0, scheduleShown).map((task) => (
                <div key={task.id}>{taskRow(task)}</div>
              ))}
              {model.unscheduledTasks.length > scheduleShown && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setScheduleShown((value) => value + 50)}
                >
                  {t('showMore', {
                    count: model.unscheduledTasks.length - scheduleShown,
                  })}
                </Button>
              )}
            </div>
          )}
        </section>
        <aside
          className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-popover p-4"
          aria-label={t('backlog')}
        >
          <h3 className="text-[12px] font-semibold">{t('backlog')}</h3>
          <p className="text-[10px] leading-4 text-muted-foreground">
            {t('backlogHint')}
          </p>
          <div className="flex items-center gap-2 rounded-lg border border-border px-2 py-2">
            <Search
              size={13}
              className="shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              variant="ghost"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setShown(8);
              }}
              aria-label={t('search')}
              placeholder={t('search')}
            />
          </div>
          <ul className="flex flex-col gap-3">
            {backlog.slice(0, shown).map((task) => (
              <li key={task.id} className="flex min-w-0 items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-[11px] leading-4">
                    {task.title}
                  </p>
                  <p className="mt-1 text-[9px] tabular-nums text-muted-foreground">
                    TASK-{task.number}
                    {task.estimateMinutes &&
                      ` · ${formatDuration(task.estimateMinutes * 60)}`}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={pending}
                  onClick={() => onPlan(task, day)}
                  aria-label={t('planTask', { number: task.number })}
                >
                  {t('plan')}
                </Button>
              </li>
            ))}
          </ul>
          {!backlog.length && (
            <p className="py-2 text-[11px] text-muted-foreground">
              {t(search.trim() ? 'noResults' : 'emptyBacklog')}
            </p>
          )}
          {backlog.length > shown && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShown((value) => value + 8)}
            >
              {t('showMore', { count: backlog.length - shown })}
            </Button>
          )}
        </aside>
      </div>
    </div>
  );
}

function DayRing({
  label,
  value,
  center,
  ratio,
  hint,
  over = false,
}: {
  label: string;
  value: string;
  center: string;
  ratio: number;
  hint: string;
  over?: boolean;
}) {
  return (
    <div className="flex w-40 flex-col items-center gap-1.5 text-center">
      <div className="relative size-20">
        <svg
          viewBox="0 0 100 100"
          className={cn(
            'size-full -rotate-90',
            over ? 'text-destructive' : 'text-primary',
          )}
          role="img"
          aria-label={`${label}: ${value}`}
        >
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            strokeWidth="7"
            className="stroke-border"
          />
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            strokeWidth="7"
            stroke="currentColor"
            strokeLinecap="round"
            pathLength="100"
            strokeDasharray="100"
            strokeDashoffset={100 - Math.min(1, Math.max(0, ratio)) * 100}
          />
        </svg>
        <span
          className="absolute inset-0 grid place-items-center text-[15px] font-semibold tabular-nums"
          aria-hidden="true"
        >
          {center}
        </span>
      </div>
      <p className="text-[11px] font-semibold">{label}</p>
      <p className="text-[11px] tabular-nums">{value}</p>
      <p className="text-[9px] leading-3 text-muted-foreground">{hint}</p>
    </div>
  );
}
