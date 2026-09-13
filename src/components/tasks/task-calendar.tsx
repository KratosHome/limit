import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from 'react';
import { CalendarDays, Check, Circle, Plus, Repeat2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { enUS, uk } from 'react-day-picker/locale';
import type { DayButton } from 'react-day-picker';
import { limitApi } from '../../api';
import { toDayKey } from '../../lib/format';
import { cn } from '../../lib/utils';
import type { DateRange } from '../../types/navigation';
import type {
  TaskItem,
  TaskRecurrence,
  TaskWorkspace,
} from '../../types/tasks';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Calendar, CalendarDayButton } from '../ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { FieldError } from '../ui/field';

const ScheduledTasks = createContext<Map<string, TaskItem[]>>(new Map());

function TaskDayButton({
  children,
  ...props
}: ComponentProps<typeof DayButton>) {
  const tasks = useContext(ScheduledTasks).get(toDayKey(props.day.date)) ?? [];
  const { t } = useTranslation('tasksPlanning');
  return (
    <CalendarDayButton
      {...props}
      aria-label={[
        props['aria-label'],
        tasks.length ? t('calendar.taskCount', { count: tasks.length }) : null,
      ]
        .filter(Boolean)
        .join(', ')}
      className="h-24! min-h-24! min-w-0! max-w-full aspect-auto! items-start! justify-start gap-1 overflow-hidden px-2 py-2"
    >
      <span>{children}</span>
      <span
        className="flex w-full min-w-0 max-w-full flex-col gap-1 overflow-hidden text-left"
        aria-hidden="true"
      >
        {tasks.slice(0, 2).map((task) => (
          <span
            key={task.id}
            className={cn(
              'block w-full min-w-0 max-w-full truncate text-[10px]',
              task.status === 'done' && 'line-through opacity-60',
            )}
          >
            {task.scheduledTime ? `${task.scheduledTime} ` : ''}
            {task.title}
          </span>
        ))}
        {tasks.length > 2 && (
          <span className="text-[10px]">+{tasks.length - 2}</span>
        )}
      </span>
      {!!tasks.length && (
        <span className="sr-only">
          {t('calendar.taskCount', { count: tasks.length })}
        </span>
      )}
    </CalendarDayButton>
  );
}

function sortTasks(a: TaskItem, b: TaskItem) {
  return (
    (a.scheduledDate ?? '').localeCompare(b.scheduledDate ?? '') ||
    (a.scheduledTime ?? '99:99').localeCompare(b.scheduledTime ?? '99:99') ||
    a.number - b.number
  );
}

export function TaskCalendar({
  workspace,
  onEdit,
  onCreate,
  onChanged,
  onRangeChange,
}: {
  workspace: TaskWorkspace;
  onEdit: (task: TaskItem) => void;
  onCreate: (day?: string) => void;
  onChanged: () => Promise<void>;
  onRangeChange?: (range: DateRange) => Promise<void>;
}) {
  const { t, i18n } = useTranslation('tasksPlanning');
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [selected, setSelected] = useState(() => new Date());
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);
  const [stopping, setStopping] = useState<TaskRecurrence | null>(null);
  const [busy, setBusy] = useState(false);
  const [written, setWritten] = useState(false);
  const [error, setError] = useState('');
  const rangeCallback = useRef(onRangeChange);
  const stopOpener = useRef<HTMLElement | null>(null);
  const todayButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    rangeCallback.current = onRangeChange;
  }, [onRangeChange]);
  const monthKey = toDayKey(month).slice(0, 7);
  useEffect(() => {
    const callback = rangeCallback.current;
    if (!callback) return;
    let active = true;
    const [year, index] = monthKey.split('-').map(Number);
    setLoading(true);
    setLoadError(false);
    void callback({
      from: `${monthKey}-01`,
      to: toDayKey(new Date(year, index, 0)),
    })
      .catch(() => {
        if (active) setLoadError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [monthKey, reload]);
  const byDay = useMemo(() => {
    const result = new Map<string, TaskItem[]>();
    for (const task of [...workspace.tasks].sort(sortTasks)) {
      if (!task.scheduledDate) continue;
      const day = result.get(task.scheduledDate) ?? [];
      day.push(task);
      result.set(task.scheduledDate, day);
    }
    return result;
  }, [workspace.tasks]);
  const dayKey = toDayKey(selected);
  const dayTasks = byDay.get(dayKey) ?? [];
  const today = toDayKey(new Date());
  const upcoming = workspace.tasks
    .filter(
      (task) =>
        task.scheduledDate &&
        task.scheduledDate >= today &&
        !['done', 'cancelled'].includes(task.status),
    )
    .sort(sortTasks)
    .slice(0, 8);
  const dateFormat = new Intl.DateTimeFormat(i18n.language, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const weekdayFormat = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'short',
  });
  function rule(recurrence: TaskRecurrence) {
    const days = [...recurrence.days]
      .sort((a, b) => a - b)
      .map((day) =>
        recurrence.frequency === 'weekly'
          ? weekdayFormat.format(new Date(2026, 0, 4 + day))
          : String(day),
      )
      .join(', ');
    return t(`calendar.${recurrence.frequency}`, { days });
  }
  async function stop() {
    if (!stopping || busy) return;
    setBusy(true);
    setError('');
    let saved = written;
    try {
      if (!saved) {
        await limitApi.disableTaskRecurrence(stopping.id);
        saved = true;
        setWritten(true);
      }
      await onChanged();
      setStopping(null);
    } catch {
      setError(t(saved ? 'refreshFailed' : 'saveFailed'));
    } finally {
      setBusy(false);
    }
  }
  const row = (task: TaskItem, showDate = false) => (
    <Button
      key={task.id}
      variant="ghost"
      size="none"
      onClick={() => onEdit(task)}
      className="w-full justify-start gap-2 rounded-none px-3 py-2.5 text-left"
    >
      {task.status === 'done' ? (
        <Check aria-hidden="true" data-icon="inline-start" />
      ) : (
        <Circle aria-hidden="true" data-icon="inline-start" />
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span
          className={cn(
            'truncate text-xs',
            task.status === 'done' && 'line-through',
          )}
        >
          {task.title}
        </span>
        <span className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
          <span>#{task.number}</span>
          {showDate && (
            <span>
              {dateFormat.format(new Date(`${task.scheduledDate}T12:00:00`))}
            </span>
          )}
          {task.scheduledTime && <span>{task.scheduledTime}</span>}
          <span>{t(`status.${task.status}`)}</span>
        </span>
      </span>
      {task.recurrenceId && (
        <Repeat2 aria-label={t('calendar.recurring')} data-icon="inline-end" />
      )}
    </Button>
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="section-title">{t('calendar.title')}</h2>
          <p className="section-subtitle">{t('calendar.subtitle')}</p>
        </div>
        <Button
          ref={todayButton}
          variant="secondary"
          size="sm"
          onClick={() => {
            const now = new Date();
            setSelected(now);
            setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
          }}
        >
          {t('calendar.today')}
        </Button>
      </div>
      {loadError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 text-sm text-muted-foreground"
        >
          <span>{t('calendar.loadFailed')}</span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setReload((value) => value + 1)}
          >
            {t('retry')}
          </Button>
        </div>
      )}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <section
          className="card min-w-0 overflow-hidden"
          aria-busy={loading}
          aria-label={t('calendar.title')}
        >
          <ScheduledTasks.Provider value={byDay}>
            <Calendar
              mode="single"
              required
              selected={selected}
              onSelect={setSelected}
              month={month}
              onMonthChange={(next) => {
                setMonth(next);
                setSelected(new Date(next.getFullYear(), next.getMonth(), 1));
              }}
              locale={i18n.language.startsWith('uk') ? uk : enUS}
              weekStartsOn={1}
              showOutsideDays={false}
              startMonth={new Date(1900, 0, 1)}
              endMonth={new Date(2100, 11, 1)}
              className="w-full min-w-0 p-4 [&_thead]:block [&_tbody]:block"
              classNames={{
                root: 'w-full min-w-0',
                months: 'relative flex w-full min-w-0 flex-col gap-4',
                month: 'flex w-full min-w-0 flex-col gap-4',
                month_grid: 'block w-full min-w-0',
                weekdays: 'grid! w-full min-w-0 grid-cols-7!',
                week: 'mt-2 grid! w-full min-w-0 grid-cols-7!',
                day: 'h-24 w-full min-w-0 p-0 align-top',
              }}
              components={{ DayButton: TaskDayButton }}
            />
          </ScheduledTasks.Provider>
          {loading && (
            <p
              role="status"
              className="px-4 pb-3 text-xs text-muted-foreground"
            >
              {t('calendar.loading')}
            </p>
          )}
        </section>
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-border p-3">
            <h3 className="text-xs font-semibold text-foreground">
              {dateFormat.format(selected)}
            </h3>
            <Button
              variant="icon"
              size="icon"
              aria-label={t('calendar.addTask')}
              onClick={() => onCreate(dayKey)}
            >
              <Plus data-icon="inline-start" aria-hidden="true" />
            </Button>
          </div>
          {dayTasks.length ? (
            dayTasks.map((task) => row(task))
          ) : (
            <p className="empty-mini">{t('calendar.emptyDay')}</p>
          )}
        </section>
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section className="card overflow-hidden">
          <h3 className="flex items-center gap-2 border-b border-border p-4 text-xs font-semibold text-foreground">
            <CalendarDays className="size-4" aria-hidden="true" />
            {t('calendar.upcoming')}
          </h3>
          {upcoming.length ? (
            upcoming.map((task) => row(task, true))
          ) : (
            <p className="empty-mini">{t('calendar.emptyUpcoming')}</p>
          )}
        </section>
        <section className="card overflow-hidden">
          <h3 className="flex items-center gap-2 border-b border-border p-4 text-xs font-semibold text-foreground">
            <Repeat2 className="size-4" aria-hidden="true" />
            {t('calendar.repeats')}
          </h3>
          {!workspace.recurrences.length && (
            <p className="empty-mini">{t('calendar.emptyRepeats')}</p>
          )}
          {workspace.recurrences.map((recurrence) => (
            <div
              key={recurrence.id}
              className="flex items-center justify-between gap-3 border-b border-border p-3 last:border-0"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <p className="truncate text-xs font-medium text-foreground">
                  {recurrence.title}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {rule(recurrence)}
                </p>
                {recurrence.until && (
                  <p className="text-[10px] text-muted-foreground">
                    {t('calendar.until', {
                      date: dateFormat.format(
                        new Date(`${recurrence.until}T12:00:00`),
                      ),
                    })}
                  </p>
                )}
              </div>
              {recurrence.enabled ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={(event) => {
                    stopOpener.current = event.currentTarget;
                    setStopping(recurrence);
                    setWritten(false);
                    setError('');
                  }}
                >
                  {t('calendar.stop')}
                </Button>
              ) : (
                <Badge variant="outline">{t('calendar.stopped')}</Badge>
              )}
            </div>
          ))}
          {!!workspace.recurrences.length && (
            <p className="p-3 text-[10px] text-muted-foreground">
              {t('calendar.skipMissingDays')}
            </p>
          )}
        </section>
      </div>
      <Dialog
        open={!!stopping}
        onOpenChange={(open) => {
          if (!open && !busy) setStopping(null);
        }}
      >
        <DialogContent
          className="text-xs font-medium"
          showCloseButton={!busy}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            (stopOpener.current?.isConnected
              ? stopOpener.current
              : todayButton.current
            )?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('calendar.stopTitle')}</DialogTitle>
            <DialogDescription>
              {t('calendar.stopDescription', { title: stopping?.title })}
            </DialogDescription>
          </DialogHeader>
          {error && <FieldError>{error}</FieldError>}
          <DialogFooter>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setStopping(null)}
            >
              {t(written ? 'close' : 'cancel')}
            </Button>
            <Button disabled={busy} onClick={() => void stop()}>
              {t(busy ? 'working' : written ? 'retryRefresh' : 'calendar.stop')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
