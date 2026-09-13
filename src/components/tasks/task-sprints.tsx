import { useRef, useState, type FormEvent } from 'react';
import { Check, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { limitApi } from '../../api';
import { formatDuration, offsetDay, toDayKey } from '../../lib/format';
import type {
  SprintInput,
  TaskItem,
  TaskSprint,
  TaskWorkspace,
} from '../../types/tasks';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Field, FieldError, FieldGroup, FieldLabel } from '../ui/field';
import { Input } from '../ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Textarea } from '../ui/textarea';
import { TaskDatePicker } from './task-date-picker';

function validDates(from: string, to: string) {
  const days =
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000 +
    1;
  return (
    Number.isFinite(days) &&
    days >= 1 &&
    days <= 366 &&
    from >= '1900-01-01' &&
    to <= '2100-12-31'
  );
}

function SprintEditor({
  initial,
  onChanged,
  onClose,
  returnFocus,
}: {
  initial: SprintInput;
  onChanged: () => Promise<void>;
  onClose: () => void;
  returnFocus: () => void;
}) {
  const { t } = useTranslation('tasksPlanning');
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [written, setWritten] = useState(false);
  const [error, setError] = useState('');
  const [attempted, setAttempted] = useState(false);
  const nameInvalid = !draft.name.trim();
  const datesInvalid = !validDates(draft.startDate, draft.endDate);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setAttempted(true);
    if (!written && (nameInvalid || datesInvalid)) return;
    setBusy(true);
    setError('');
    let saved = written;
    try {
      if (!saved) {
        await limitApi.saveTaskSprint({
          ...draft,
          name: draft.name.trim(),
          goal: draft.goal.trim(),
        });
        saved = true;
        setWritten(true);
      }
      await onChanged();
      onClose();
    } catch {
      setError(t(saved ? 'refreshFailed' : 'saveFailed'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        className="max-h-[90vh] overflow-y-auto text-xs font-medium"
        showCloseButton={!busy}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocus();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {t(initial.id ? 'sprints.edit' : 'sprints.create')}
          </DialogTitle>
          <DialogDescription>
            {t('sprints.editorDescription')}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => void save(event)}
          className="flex flex-col gap-5"
          noValidate
        >
          <FieldGroup>
            <Field
              data-invalid={attempted && nameInvalid}
              data-disabled={busy || written}
            >
              <FieldLabel htmlFor="sprint-name">{t('sprints.name')}</FieldLabel>
              <Input
                id="sprint-name"
                value={draft.name}
                maxLength={160}
                required
                disabled={busy || written}
                aria-invalid={attempted && nameInvalid}
                onChange={(event) =>
                  setDraft({ ...draft, name: event.target.value })
                }
              />
              {attempted && nameInvalid && (
                <FieldError>{t('sprints.invalidName')}</FieldError>
              )}
            </Field>
            <Field data-disabled={busy || written}>
              <FieldLabel htmlFor="sprint-goal">{t('sprints.goal')}</FieldLabel>
              <Textarea
                id="sprint-goal"
                rows={3}
                value={draft.goal}
                maxLength={5000}
                disabled={busy || written}
                onChange={(event) =>
                  setDraft({ ...draft, goal: event.target.value })
                }
              />
            </Field>
            <FieldGroup className="grid gap-4 sm:grid-cols-2">
              <Field
                data-invalid={attempted && datesInvalid}
                data-disabled={busy || written}
              >
                <FieldLabel>{t('sprints.start')}</FieldLabel>
                <TaskDatePicker
                  label={t('sprints.start')}
                  required
                  value={draft.startDate}
                  disabled={busy || written}
                  onChange={(date) => {
                    if (date) setDraft({ ...draft, startDate: date });
                  }}
                />
              </Field>
              <Field
                data-invalid={attempted && datesInvalid}
                data-disabled={busy || written}
              >
                <FieldLabel>{t('sprints.end')}</FieldLabel>
                <TaskDatePicker
                  label={t('sprints.end')}
                  required
                  value={draft.endDate}
                  min={draft.startDate}
                  disabled={busy || written}
                  onChange={(date) => {
                    if (date) setDraft({ ...draft, endDate: date });
                  }}
                />
              </Field>
            </FieldGroup>
            {attempted && datesInvalid && (
              <FieldError>{t('sprints.invalidDates')}</FieldError>
            )}
            <Field data-disabled={busy || written}>
              <FieldLabel htmlFor="sprint-status">
                {t('sprints.status')}
              </FieldLabel>
              <Select
                value={draft.status}
                disabled={busy || written}
                onValueChange={(status) =>
                  setDraft({
                    ...draft,
                    status: status as SprintInput['status'],
                  })
                }
              >
                <SelectTrigger id="sprint-status" size="compact">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {(['planned', 'active', 'completed'] as const).map(
                      (status) => (
                        <SelectItem key={status} value={status}>
                          {t(`sprints.${status}`)}
                        </SelectItem>
                      ),
                    )}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          {error && <FieldError>{error}</FieldError>}
          <DialogFooter>
            <Button variant="secondary" disabled={busy} onClick={onClose}>
              {t(written ? 'close' : 'cancel')}
            </Button>
            <Button type="submit" disabled={busy}>
              {t(busy ? 'working' : written ? 'retryRefresh' : 'sprints.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TaskSprints({
  workspace,
  onChanged,
  onEditTask,
}: {
  workspace: TaskWorkspace;
  onChanged: () => Promise<void>;
  onEditTask?: (task: TaskItem) => void;
}) {
  const { t, i18n } = useTranslation('tasksPlanning');
  const [editing, setEditing] = useState<SprintInput | null>(null);
  const [deleting, setDeleting] = useState<TaskSprint | null>(null);
  const [busy, setBusy] = useState(false);
  const [written, setWritten] = useState(false);
  const [error, setError] = useState('');
  const opener = useRef<HTMLElement | null>(null);
  const [expandedSprints, setExpandedSprints] = useState<Set<string>>(
    () => new Set(),
  );
  const [visibleTasks, setVisibleTasks] = useState<Record<string, number>>({});
  const createButton = useRef<HTMLButtonElement>(null);
  const dateFormat = new Intl.DateTimeFormat(i18n.language, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const formatDate = (day: string) =>
    dateFormat.format(new Date(`${day}T12:00:00`));
  const focusOpener = () =>
    (opener.current?.isConnected
      ? opener.current
      : createButton.current
    )?.focus();
  async function remove() {
    if (!deleting || busy) return;
    setBusy(true);
    setError('');
    let saved = written;
    try {
      if (!saved) {
        await limitApi.deleteTaskSprint(deleting.id);
        saved = true;
        setWritten(true);
      }
      await onChanged();
      setDeleting(null);
    } catch {
      setError(t(saved ? 'refreshFailed' : 'saveFailed'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-4 [&_svg]:size-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="section-title">{t('sprints.title')}</h2>
          <p className="section-subtitle">{t('sprints.subtitle')}</p>
        </div>
        <Button
          ref={createButton}
          onClick={(event) => {
            opener.current = event.currentTarget;
            setEditing({
              name: '',
              goal: '',
              startDate: toDayKey(new Date()),
              endDate: toDayKey(offsetDay(new Date(), 13)),
              status: 'planned',
            });
          }}
        >
          <Plus data-icon="inline-start" aria-hidden="true" />
          {t('sprints.create')}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t('sprints.allTime')}</p>
      {!workspace.sprints.length && (
        <p className="empty-mini">{t('sprints.empty')}</p>
      )}
      {workspace.sprints.map((sprint) => {
        const tasks = workspace.tasks
          .filter((task) => task.sprintId === sprint.id)
          .sort((a, b) => a.number - b.number);
        return (
          <section key={sprint.id} className="card overflow-hidden">
            <div className="flex items-start justify-between gap-4 p-4">
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-sm font-semibold text-foreground">
                    {sprint.name}
                  </h3>
                  <Badge
                    variant={sprint.status === 'active' ? 'default' : 'outline'}
                  >
                    {t(`sprints.${sprint.status}`)}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatDate(sprint.startDate)} — {formatDate(sprint.endDate)}
                </p>
                {sprint.goal && (
                  <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground">
                    {sprint.goal}
                  </p>
                )}
              </div>
              <div className="flex gap-1">
                <Button
                  variant="icon"
                  size="icon"
                  aria-label={`${t('sprints.edit')}: ${sprint.name}`}
                  onClick={(event) => {
                    opener.current = event.currentTarget;
                    setEditing({
                      id: sprint.id,
                      name: sprint.name,
                      goal: sprint.goal,
                      startDate: sprint.startDate,
                      endDate: sprint.endDate,
                      status: sprint.status,
                    });
                  }}
                >
                  <Pencil aria-hidden="true" data-icon="inline-start" />
                </Button>
                <Button
                  variant="icon"
                  size="icon"
                  aria-label={`${t('sprints.delete')}: ${sprint.name}`}
                  onClick={(event) => {
                    opener.current = event.currentTarget;
                    setDeleting(sprint);
                    setWritten(false);
                    setError('');
                  }}
                >
                  <Trash2 aria-hidden="true" data-icon="inline-start" />
                </Button>
              </div>
            </div>
            <div className="grid gap-4 px-4 pb-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <span className="text-xs text-muted-foreground">
                  {t('sprints.progress', {
                    completed: sprint.completedTasks,
                    total: sprint.totalTasks,
                  })}
                </span>
                <progress
                  className="h-1.5 w-full appearance-none overflow-hidden rounded-full bg-muted [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary"
                  value={sprint.completedTasks}
                  max={Math.max(1, sprint.totalTasks)}
                  aria-label={t('sprints.progress', {
                    completed: sprint.completedTasks,
                    total: sprint.totalTasks,
                  })}
                />
              </div>
              <div className="flex flex-col gap-1 sm:items-end">
                <span className="text-[11px] text-muted-foreground">
                  {t('sprints.time')}
                </span>
                <span className="text-sm font-medium tabular-nums text-foreground">
                  {formatDuration(sprint.trackedSeconds)} /{' '}
                  {sprint.estimatedMinutes
                    ? formatDuration(sprint.estimatedMinutes * 60)
                    : t('sprints.noEstimate')}
                </span>
              </div>
            </div>
            <details
              className="border-t border-border"
              open={expandedSprints.has(sprint.id)}
              onToggle={(event) => {
                const open = event.currentTarget.open;
                setExpandedSprints((current) => {
                  if (current.has(sprint.id) === open) return current;
                  const next = new Set(current);
                  if (open) next.add(sprint.id);
                  else next.delete(sprint.id);
                  return next;
                });
              }}
            >
              <summary className="cursor-pointer px-4 py-3 text-xs font-medium text-muted-foreground">
                {t('sprints.tasks', { count: tasks.length })}
              </summary>
              {!tasks.length && (
                <p className="px-4 pb-4 text-xs text-muted-foreground">
                  {t('sprints.noTasks')}
                </p>
              )}
              {expandedSprints.has(sprint.id) &&
                tasks.slice(0, visibleTasks[sprint.id] ?? 50).map((task) => (
                  <Button
                    key={task.id}
                    variant="ghost"
                    size="none"
                    disabled={!onEditTask}
                    onClick={() => onEditTask?.(task)}
                    className="flex w-full justify-start gap-2 rounded-none px-4 py-2.5 text-left"
                  >
                    {task.status === 'done' ? (
                      <Check data-icon="inline-start" aria-hidden="true" />
                    ) : (
                      <ChevronRight
                        data-icon="inline-start"
                        aria-hidden="true"
                      />
                    )}
                    <span className="text-[10px] text-muted-foreground">
                      #{task.number}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs">
                      {task.title}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {t(`status.${task.status}`)}
                    </span>
                    <span className="text-xs tabular-nums">
                      {formatDuration(task.trackedSeconds)}
                    </span>
                  </Button>
                ))}
              {expandedSprints.has(sprint.id) &&
                tasks.length > (visibleTasks[sprint.id] ?? 50) && (
                  <div className="px-4 py-3">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        setVisibleTasks((current) => ({
                          ...current,
                          [sprint.id]: (current[sprint.id] ?? 50) + 50,
                        }))
                      }
                    >
                      {t('sprints.showMore')}
                    </Button>
                  </div>
                )}
            </details>
          </section>
        );
      })}
      {editing && (
        <SprintEditor
          key={editing.id ?? 'new'}
          initial={editing}
          onChanged={onChanged}
          onClose={() => setEditing(null)}
          returnFocus={focusOpener}
        />
      )}
      <Dialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open && !busy) setDeleting(null);
        }}
      >
        <DialogContent
          className="text-xs font-medium"
          showCloseButton={!busy}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            focusOpener();
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('sprints.deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t('sprints.deleteDescription', { name: deleting?.name })}
            </DialogDescription>
          </DialogHeader>
          {error && <FieldError>{error}</FieldError>}
          <DialogFooter>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setDeleting(null)}
            >
              {t(written ? 'close' : 'cancel')}
            </Button>
            <Button disabled={busy} onClick={() => void remove()}>
              {t(
                busy ? 'working' : written ? 'retryRefresh' : 'sprints.delete',
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
