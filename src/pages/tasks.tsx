import { useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  CalendarDays,
  Layers,
  List,
  ListTodo,
  Pause,
  Play,
  Plus,
  Search,
  Square,
  Sun,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { limitApi } from '../api';
import type {
  TaskItem,
  TaskPriority,
  TaskStatus,
  TaskWorkspace,
} from '../types/tasks';
import type { KnownApp } from '../types/usage';
import type { DateRange } from '../types/navigation';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '../components/ui/toggle-group';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { TaskEditor } from '../components/tasks/task-editor';
import { TaskList } from '../components/tasks/task-list';
import { TaskCalendar } from '../components/tasks/task-calendar';
import { TaskSprints } from '../components/tasks/task-sprints';
import { TaskStatistics } from '../components/tasks/task-statistics';
import { TaskDay } from '../components/tasks/task-day';

const tabs = [
  { value: 'day', Icon: Sun },
  { value: 'list', Icon: List },
  { value: 'calendar', Icon: CalendarDays },
  { value: 'sprints', Icon: Layers },
  { value: 'statistics', Icon: BarChart3 },
] as const;
type TaskTab = (typeof tabs)[number]['value'];

export function TaskManager({
  workspace,
  knownApps,
  onChanged,
  onRangeChange,
}: {
  workspace: TaskWorkspace;
  knownApps: KnownApp[];
  onChanged: () => Promise<void>;
  onRangeChange: (range: DateRange) => Promise<void>;
}) {
  const { t } = useTranslation('tasks');
  const [tab, setTab] = useState<TaskTab>('day');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<TaskStatus | 'all'>('all');
  const [priority, setPriority] = useState<TaskPriority | 'all'>('all');
  const [editor, setEditor] = useState<{
    task?: TaskItem;
    date?: string;
    time?: string;
  } | null>(null);
  const [deleting, setDeleting] = useState<TaskItem | null>(null);
  const [pending, setPending] = useState(false);
  const [refreshNeeded, setRefreshNeeded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const pendingRef = useRef(false);
  const committedRef = useRef(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const editorOpener = useRef<HTMLElement | null>(null);
  const restoreEditorFocus = useRef(true);
  const createButton = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [timerNow, setTimerNow] = useState(() => performance.now());
  const timerAnchor = useRef({
    timer: workspace.timer,
    receivedAt: performance.now(),
  });
  if (timerAnchor.current.timer !== workspace.timer) {
    timerAnchor.current = {
      timer: workspace.timer,
      receivedAt: performance.now(),
    };
  }
  useEffect(() => {
    if (workspace.timer.state !== 'running') return;
    const interval = window.setInterval(
      () => setTimerNow(performance.now()),
      1000,
    );
    return () => window.clearInterval(interval);
  }, [workspace.timer.state]);
  const busy = pending || refreshNeeded;
  const currentTask = workspace.tasks.find(
    (task) => task.id === workspace.timer.taskId,
  );
  // Only the live display advances between checkpoints; stored totals stay authoritative.
  const interpolated =
    workspace.timer.state === 'running'
      ? Math.max(0, (timerNow - timerAnchor.current.receivedAt) / 1000)
      : 0;
  const seconds = Math.max(
    0,
    Math.floor(workspace.timer.sessionSeconds + interpolated),
  );
  const clock = `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const matching = workspace.tasks
    .filter(
      (task) =>
        (status === 'all' || task.status === status) &&
        (priority === 'all' || task.priority === priority) &&
        `${task.title} ${task.description} TASK-${task.number}`
          .toLocaleLowerCase()
          .includes(search.trim().toLocaleLowerCase()),
    )
    .sort(
      (a, b) =>
        (a.scheduledDate ?? a.dueDate ?? '9999').localeCompare(
          b.scheduledDate ?? b.dueDate ?? '9999',
        ) || b.number - a.number,
    );

  async function mutate(action?: () => Promise<unknown>, success?: string) {
    if (pendingRef.current || (committedRef.current && action)) return;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    try {
      if (!committedRef.current && action) {
        await action();
        committedRef.current = true;
      }
      await onChanged();
      committedRef.current = false;
      setRefreshNeeded(false);
      setDeleting(null);
      if (success) setNotice(success);
    } catch {
      setRefreshNeeded(committedRef.current);
      setError(t(committedRef.current ? 'refreshFailed' : 'actionFailed'));
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  function openEditor(next: { task?: TaskItem; date?: string; time?: string }) {
    if (busy) return;
    editorOpener.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    restoreEditorFocus.current = true;
    setEditor(next);
  }
  function returnTaskFocus() {
    const target = editorOpener.current?.isConnected
      ? editorOpener.current
      : createButton.current;
    target?.focus();
    if (document.activeElement !== target) heading.current?.focus();
  }
  function openTask(task: TaskItem) {
    openEditor({ task });
  }
  function createTask(date?: string, time?: string) {
    openEditor({ date, time });
  }
  return (
    <div className="flex flex-col gap-4 text-[12px] font-medium">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 ref={heading} tabIndex={-1} className="page-title">
            {t('title')}
          </h1>
          <p className="page-subtitle">{t('subtitle')}</p>
        </div>
        <Button ref={createButton} onClick={() => createTask()} disabled={busy}>
          <Plus size={14} aria-hidden="true" />
          {t('newTask')}
        </Button>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <ToggleGroup
          type="single"
          variant="segment"
          spacing={1}
          value={tab}
          onValueChange={(value) => {
            if (value) setTab(value as TaskTab);
          }}
          aria-label={t('title')}
          className="flex-wrap"
        >
          {tabs.map(({ value, Icon }) => (
            <ToggleGroupItem key={value} value={value}>
              <Icon data-icon="inline-start" aria-hidden="true" />
              {t(`tabs.${value}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {workspace.tasks.length}
        </span>
      </div>
      <section
        aria-label={t('timer.session')}
        className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-popover px-4 py-3"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-primary">
          <ClockMark state={workspace.timer.state} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] text-muted-foreground" role="status">
            {t(`timer.${workspace.timer.state}`)}
          </p>
          {currentTask ? (
            <Button
              variant="ghost"
              size="none"
              className="max-w-full justify-start text-left"
              onClick={() => openTask(currentTask)}
              title={t('timer.open')}
            >
              <span className="truncate text-[12px] font-semibold">
                TASK-{currentTask.number} · {currentTask.title}
              </span>
            </Button>
          ) : (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {t('editor.appsHint')}
            </p>
          )}
          {(workspace.timer.state === 'waiting' ||
            workspace.timer.reason === 'error') &&
            workspace.timer.reason && (
              <p className="mt-1 text-[10px] text-muted-foreground">
                {t(`timer.${workspace.timer.reason}`)}
              </p>
            )}
        </div>
        <span className="font-mono text-[19px] font-semibold tabular-nums tracking-tight">
          {clock}
        </span>
        {currentTask && (
          <div className="flex gap-1">
            {workspace.timer.state === 'paused' ? (
              <Button
                variant="icon"
                size="icon"
                disabled={busy}
                onClick={() =>
                  void mutate(() => limitApi.startTaskTimer(currentTask.id))
                }
                aria-label={t('timer.resume')}
                title={t('timer.resume')}
              >
                <Play size={15} aria-hidden="true" />
              </Button>
            ) : (
              <Button
                variant="icon"
                size="icon"
                disabled={busy}
                onClick={() => void mutate(() => limitApi.pauseTaskTimer())}
                aria-label={t('timer.pause')}
                title={t('timer.pause')}
              >
                <Pause size={15} aria-hidden="true" />
              </Button>
            )}
            <Button
              variant="icon"
              size="icon"
              disabled={busy}
              onClick={() => void mutate(() => limitApi.stopTaskTimer())}
              aria-label={t('timer.stop')}
              title={t('timer.stop')}
            >
              <Square size={13} aria-hidden="true" />
            </Button>
          </div>
        )}
      </section>
      {workspace.generationLimited && (
        <p role="status" className="text-[11px] text-muted-foreground">
          {t('capacityNotice')}
        </p>
      )}
      {error && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
          <p role="alert" className="flex-1 text-[12px] text-destructive">
            {error}
          </p>
          {refreshNeeded && (
            <Button
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() => void mutate()}
            >
              {t(pending ? 'working' : 'refresh')}
            </Button>
          )}
        </div>
      )}
      <p role="status" className="sr-only">
        {notice}
      </p>
      {tab === 'day' && (
        <TaskDay
          workspace={workspace}
          knownApps={knownApps}
          onEdit={openTask}
          onCreate={createTask}
          onPlan={(task, day) => openEditor({ task, date: day })}
          onStart={(task) =>
            void mutate(() => limitApi.startTaskTimer(task.id))
          }
          onStatus={(task, next) =>
            void mutate(() => limitApi.setTaskStatus(task.id, next))
          }
          pending={busy}
        />
      )}
      {tab === 'list' && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex min-w-40 flex-1 items-center gap-2 rounded-lg border border-border bg-popover px-3 py-2">
              <Search
                size={14}
                className="text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                variant="ghost"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('search')}
                aria-label={t('search')}
              />
            </div>
            <Select
              value={status}
              onValueChange={(value) => setStatus(value as typeof status)}
            >
              <SelectTrigger
                size="compact"
                className="w-40!"
                aria-label={t('statusFilter')}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">{t('allStatuses')}</SelectItem>
                  {(
                    [
                      'backlog',
                      'todo',
                      'in-progress',
                      'done',
                      'cancelled',
                    ] as const
                  ).map((value) => (
                    <SelectItem value={value} key={value}>
                      {t(`status.${value}`)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select
              value={priority}
              onValueChange={(value) => setPriority(value as typeof priority)}
            >
              <SelectTrigger
                size="compact"
                className="w-40!"
                aria-label={t('priorityFilter')}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">{t('allPriorities')}</SelectItem>
                  {(['none', 'low', 'medium', 'high', 'urgent'] as const).map(
                    (value) => (
                      <SelectItem value={value} key={value}>
                        {t(`priority.${value}`)}
                      </SelectItem>
                    ),
                  )}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <p className="text-[10px] text-muted-foreground">{t('listScope')}</p>
          {matching.length ? (
            <TaskList
              key={`${search}:${status}:${priority}`}
              tasks={matching}
              knownApps={knownApps}
              activeTaskId={workspace.timer.taskId}
              pending={busy}
              onEdit={openTask}
              onStatus={(task, next) =>
                void mutate(() => limitApi.setTaskStatus(task.id, next))
              }
              onStart={(task) =>
                void mutate(() => limitApi.startTaskTimer(task.id))
              }
            />
          ) : (
            <section className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-16 text-center">
              <ListTodo size={28} className="text-primary" aria-hidden="true" />
              <h2 className="text-[15px] font-semibold">
                {t(workspace.tasks.length ? 'noResults' : 'emptyTitle')}
              </h2>
              {workspace.tasks.length ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearch('');
                    setStatus('all');
                    setPriority('all');
                  }}
                >
                  {t('clearFilters')}
                </Button>
              ) : (
                <>
                  <p className="max-w-sm text-[12px] leading-5 text-muted-foreground">
                    {t('emptyDescription')}
                  </p>
                  <Button onClick={() => createTask()} disabled={busy}>
                    <Plus size={14} aria-hidden="true" />
                    {t('newTask')}
                  </Button>
                </>
              )}
            </section>
          )}
        </>
      )}
      {tab === 'calendar' && (
        <TaskCalendar
          workspace={workspace}
          onEdit={openTask}
          onCreate={createTask}
          onChanged={onChanged}
          onRangeChange={onRangeChange}
        />
      )}
      {tab === 'sprints' && (
        <TaskSprints
          workspace={workspace}
          onChanged={onChanged}
          onEditTask={openTask}
        />
      )}
      {tab === 'statistics' && (
        <TaskStatistics workspace={workspace} knownApps={knownApps} />
      )}
      {editor && (
        <TaskEditor
          key={editor.task?.id ?? 'new'}
          task={editor.task}
          scheduledDate={editor.date}
          scheduledTime={editor.time}
          knownApps={knownApps}
          sprints={workspace.sprints}
          onClose={() => setEditor(null)}
          returnFocus={() => {
            if (restoreEditorFocus.current) returnTaskFocus();
          }}
          onSaved={async () => {
            await onChanged();
            setNotice(t('saved'));
          }}
          onDelete={(task) => {
            // The confirmation dialog owns focus until it closes.
            restoreEditorFocus.current = false;
            setEditor(null);
            setDeleting(task);
          }}
        />
      )}
      <Dialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open && !pendingRef.current) setDeleting(null);
        }}
      >
        <DialogContent
          showCloseButton={!pending}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            cancelRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnTaskFocus();
          }}
          onEscapeKeyDown={(event) => {
            if (pendingRef.current) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (pendingRef.current) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {t('deleteTitle', { number: deleting?.number ?? '' })}
            </DialogTitle>
            <DialogDescription>{t('deleteDescription')}</DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-[12px] text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              ref={cancelRef}
              variant="secondary"
              disabled={pending}
              onClick={() => setDeleting(null)}
            >
              {t(refreshNeeded ? 'close' : 'editor.cancel')}
            </Button>
            <Button
              disabled={pending}
              onClick={() => {
                if (deleting)
                  void mutate(
                    refreshNeeded
                      ? undefined
                      : () => limitApi.deleteTask(deleting.id),
                    t('deleted'),
                  );
              }}
            >
              {t(
                pending
                  ? 'working'
                  : refreshNeeded
                    ? 'refresh'
                    : 'deleteConfirm',
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ClockMark({ state }: { state: TaskWorkspace['timer']['state'] }) {
  return state === 'paused' ? (
    <Pause size={14} aria-hidden="true" />
  ) : state === 'running' ? (
    <Play size={14} aria-hidden="true" />
  ) : (
    <Square size={12} aria-hidden="true" />
  );
}
