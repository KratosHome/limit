import { useId, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import { limitApi } from '../../api';
import { toDayKey } from '../../lib/format';
import type { KnownApp } from '../../types/usage';
import type {
  TaskInput,
  TaskItem,
  TaskPriority,
  TaskSprint,
  TaskStatus,
} from '../../types/tasks';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Checkbox } from '../ui/checkbox';
import { Textarea } from '../ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '../ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group';
import { TaskDatePicker } from './task-date-picker';

export function TaskEditor({
  task,
  scheduledDate,
  scheduledTime,
  knownApps,
  sprints,
  onClose,
  onSaved,
  onDelete,
  returnFocus,
}: {
  task?: TaskItem;
  scheduledDate?: string;
  scheduledTime?: string;
  knownApps: KnownApp[];
  sprints: TaskSprint[];
  onClose: () => void;
  onSaved: () => Promise<void>;
  onDelete: (task: TaskItem) => void;
  returnFocus: () => void;
}) {
  const { t, i18n } = useTranslation('tasks');
  const id = useId();
  const [input, setInput] = useState<TaskInput>(() => ({
    id: task?.id,
    title: task?.title ?? '',
    description: task?.description ?? '',
    status: task?.status ?? 'todo',
    priority: task?.priority ?? 'none',
    scheduledDate: task?.scheduledDate ?? scheduledDate ?? null,
    scheduledTime: task?.scheduledTime ?? scheduledTime ?? null,
    dueDate: task?.dueDate ?? null,
    estimateMinutes: task?.estimateMinutes ?? null,
    appIds: task?.appIds ?? [],
    sprintId: task?.sprintId ?? null,
  }));
  const [estimate, setEstimate] = useState(
    task?.estimateMinutes?.toString() ?? '',
  );
  const [frequency, setFrequency] = useState<'none' | 'weekly' | 'monthly'>(
    'none',
  );
  const [repeatDays, setRepeatDays] = useState<string[]>([]);
  const [until, setUntil] = useState<string | null>(null);
  const [appSearch, setAppSearch] = useState('');
  const [pending, setPending] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef(false);
  const committedRef = useRef(false);
  const disabled = pending || committed;
  const patch = <K extends keyof TaskInput>(key: K, value: TaskInput[K]) =>
    setInput((current) => ({ ...current, [key]: value }));
  const apps = [
    ...knownApps,
    ...input.appIds
      .filter((id) => !knownApps.some((app) => app.id === id))
      .map((id) => ({ id, name: id })),
  ].filter((app) =>
    app.name.toLocaleLowerCase().includes(appSearch.toLocaleLowerCase()),
  );
  const repeatEnd = new Date(
    `${input.scheduledDate ?? toDayKey(new Date())}T12:00:00`,
  );
  repeatEnd.setFullYear(repeatEnd.getFullYear() + 10);
  const maximumUntil =
    toDayKey(repeatEnd) < '2100-12-31' ? toDayKey(repeatEnd) : '2100-12-31';

  async function save(event: FormEvent) {
    event.preventDefault();
    if (pendingRef.current) return;
    const minutes = estimate.trim() === '' ? null : Number(estimate);
    if (!committedRef.current) {
      if (!input.title.trim()) {
        setError(t('editor.required'));
        return;
      }
      if (
        minutes !== null &&
        (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440)
      ) {
        setError(t('editor.invalidEstimate'));
        return;
      }
      if (
        frequency !== 'none' &&
        (!input.scheduledDate || !repeatDays.length)
      ) {
        setError(t('editor.invalidRepeat'));
        return;
      }
      if (
        frequency !== 'none' &&
        until &&
        (until < input.scheduledDate! || until > maximumUntil)
      ) {
        setError(t('editor.invalidUntil'));
        return;
      }
    }
    pendingRef.current = true;
    setPending(true);
    setError(null);
    try {
      if (!committedRef.current) {
        await limitApi.saveTask({
          ...input,
          title: input.title.trim(),
          estimateMinutes: minutes,
          scheduledTime: input.scheduledDate
            ? input.scheduledTime || null
            : null,
          ...(!task
            ? {
                repeat:
                  frequency === 'none'
                    ? null
                    : { frequency, days: repeatDays.map(Number), until },
              }
            : {}),
        });
        committedRef.current = true;
        setCommitted(true);
      }
      await onSaved();
      onClose();
    } catch {
      setError(t(committedRef.current ? 'refreshFailed' : 'actionFailed'));
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pendingRef.current) onClose();
      }}
    >
      <DialogContent
        className="max-h-[calc(100dvh-3rem)] overflow-y-auto sm:max-w-[650px]"
        showCloseButton={!pending}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocus();
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
            {task
              ? t('editor.edit', { number: task.number })
              : t('editor.create')}
          </DialogTitle>
          <DialogDescription>{t('editor.descriptionHint')}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => void save(event)}
          className="flex flex-col gap-5 text-[12px] font-medium [&_[data-slot=field]]:gap-2 [&_[data-slot=field-set]]:gap-3 [&_[data-slot=field-group]]:gap-4"
        >
          <FieldGroup>
            <Field data-invalid={error === t('editor.required')}>
              <FieldLabel htmlFor={`${id}-title`}>
                {t('editor.title')}
              </FieldLabel>
              <Input
                id={`${id}-title`}
                value={input.title}
                onChange={(event) => patch('title', event.target.value)}
                placeholder={t('editor.titlePlaceholder')}
                maxLength={200}
                disabled={disabled}
                autoFocus
                required
                aria-invalid={error === t('editor.required')}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${id}-description`}>
                {t('editor.description')}
              </FieldLabel>
              <Textarea
                id={`${id}-description`}
                value={input.description}
                onChange={(event) => patch('description', event.target.value)}
                placeholder={t('editor.descriptionPlaceholder')}
                maxLength={10000}
                disabled={disabled}
                rows={3}
                className="max-h-48 min-h-24 resize-y"
              />
            </Field>
            <FieldGroup className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel>{t('editor.status')}</FieldLabel>
                <Select
                  value={input.status}
                  onValueChange={(value) =>
                    patch('status', value as TaskStatus)
                  }
                  disabled={disabled}
                >
                  <SelectTrigger size="compact" aria-label={t('editor.status')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {(
                        [
                          'backlog',
                          'todo',
                          'in-progress',
                          'done',
                          'cancelled',
                        ] as const
                      ).map((status) => (
                        <SelectItem key={status} value={status}>
                          {t(`status.${status}`)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>{t('editor.priority')}</FieldLabel>
                <Select
                  value={input.priority}
                  onValueChange={(value) =>
                    patch('priority', value as TaskPriority)
                  }
                  disabled={disabled}
                >
                  <SelectTrigger
                    size="compact"
                    aria-label={t('editor.priority')}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {(
                        ['none', 'low', 'medium', 'high', 'urgent'] as const
                      ).map((priority) => (
                        <SelectItem key={priority} value={priority}>
                          {t(`priority.${priority}`)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>{t('editor.schedule')}</FieldLabel>
                <TaskDatePicker
                  value={input.scheduledDate}
                  onChange={(date) =>
                    setInput((current) => ({
                      ...current,
                      scheduledDate: date,
                      scheduledTime: date ? current.scheduledTime : null,
                    }))
                  }
                  label={t('editor.schedule')}
                  disabled={disabled}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${id}-time`}>
                  {t('editor.time')}
                </FieldLabel>
                <Input
                  id={`${id}-time`}
                  type="time"
                  value={input.scheduledTime ?? ''}
                  onChange={(event) =>
                    patch('scheduledTime', event.target.value || null)
                  }
                  disabled={disabled || !input.scheduledDate}
                />
              </Field>
              <Field>
                <FieldLabel>{t('editor.due')}</FieldLabel>
                <TaskDatePicker
                  value={input.dueDate}
                  onChange={(date) => patch('dueDate', date)}
                  label={t('editor.due')}
                  disabled={disabled}
                />
              </Field>
              <Field data-invalid={error === t('editor.invalidEstimate')}>
                <FieldLabel htmlFor={`${id}-estimate`}>
                  {t('editor.estimate')}
                </FieldLabel>
                <Input
                  id={`${id}-estimate`}
                  type="number"
                  min={1}
                  max={1440}
                  step={1}
                  value={estimate}
                  onChange={(event) => setEstimate(event.target.value)}
                  placeholder={t('editor.noEstimate')}
                  disabled={disabled}
                  aria-invalid={error === t('editor.invalidEstimate')}
                />
              </Field>
            </FieldGroup>
            <Field>
              <FieldLabel>{t('editor.sprint')}</FieldLabel>
              <Select
                value={input.sprintId ?? 'none'}
                onValueChange={(value) =>
                  patch('sprintId', value === 'none' ? null : value)
                }
                disabled={disabled}
              >
                <SelectTrigger size="compact" aria-label={t('editor.sprint')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="none">{t('editor.noSprint')}</SelectItem>
                    {sprints.map((sprint) => (
                      <SelectItem value={sprint.id} key={sprint.id}>
                        {sprint.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <FieldSet>
              <FieldLegend>{t('editor.apps')}</FieldLegend>
              <FieldDescription>{t('editor.appsHint')}</FieldDescription>
              <Input
                aria-label={t('editor.searchApps')}
                placeholder={t('editor.searchApps')}
                value={appSearch}
                onChange={(event) => setAppSearch(event.target.value)}
                disabled={disabled}
              />
              <div className="grid max-h-36 grid-cols-2 gap-2 overflow-y-auto rounded-lg border border-border p-3">
                {apps.map((app) => (
                  <label
                    key={app.id}
                    className="flex min-w-0 cursor-pointer items-center gap-2 text-[11px]"
                  >
                    <Checkbox
                      checked={input.appIds.includes(app.id)}
                      disabled={
                        disabled ||
                        (input.appIds.length >= 20 &&
                          !input.appIds.includes(app.id))
                      }
                      onCheckedChange={(checked) =>
                        patch(
                          'appIds',
                          checked === true
                            ? [...input.appIds, app.id]
                            : input.appIds.filter((id) => id !== app.id),
                        )
                      }
                    />
                    <span className="truncate" title={app.name}>
                      {app.name}
                    </span>
                  </label>
                ))}
                {!apps.length && (
                  <p className="col-span-2 text-muted-foreground">
                    {t('editor.noKnownApps')}
                  </p>
                )}
              </div>
              <FieldDescription>{t('editor.appLimit')}</FieldDescription>
            </FieldSet>
            {!task ? (
              <FieldSet>
                <FieldLegend>{t('editor.recurrence')}</FieldLegend>
                <Select
                  value={frequency}
                  onValueChange={(value) => {
                    setFrequency(value as typeof frequency);
                    setRepeatDays([]);
                  }}
                  disabled={disabled}
                >
                  <SelectTrigger
                    size="compact"
                    aria-label={t('editor.recurrence')}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="none">{t('editor.never')}</SelectItem>
                      <SelectItem value="weekly">
                        {t('editor.weekly')}
                      </SelectItem>
                      <SelectItem value="monthly">
                        {t('editor.monthly')}
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {frequency === 'weekly' && (
                  <ToggleGroup
                    type="multiple"
                    variant="outline"
                    value={repeatDays}
                    onValueChange={setRepeatDays}
                    disabled={disabled}
                    aria-label={t('editor.weekdays')}
                    className="flex-wrap"
                    spacing={1}
                  >
                    {Array.from({ length: 7 }, (_, index) => (
                      <ToggleGroupItem key={index} value={String(index + 1)}>
                        {new Intl.DateTimeFormat(i18n.language, {
                          weekday: 'short',
                        }).format(new Date(2026, 0, 5 + index))}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                )}
                {frequency === 'monthly' && (
                  <FieldSet>
                    <FieldLegend>{t('editor.monthdays')}</FieldLegend>
                    <div className="grid grid-cols-7 gap-2">
                      {Array.from({ length: 31 }, (_, index) =>
                        String(index + 1),
                      ).map((day) => (
                        <label
                          key={day}
                          className="flex items-center gap-1.5 text-[11px]"
                        >
                          <Checkbox
                            checked={repeatDays.includes(day)}
                            disabled={disabled}
                            onCheckedChange={(checked) =>
                              setRepeatDays((current) =>
                                checked === true
                                  ? [...current, day]
                                  : current.filter((value) => value !== day),
                              )
                            }
                          />
                          {day}
                        </label>
                      ))}
                    </div>
                  </FieldSet>
                )}
                {frequency !== 'none' && (
                  <>
                    <Field>
                      <FieldLabel>{t('editor.until')}</FieldLabel>
                      <TaskDatePicker
                        value={until}
                        onChange={setUntil}
                        label={t('editor.until')}
                        min={input.scheduledDate ?? toDayKey(new Date())}
                        max={maximumUntil}
                        disabled={disabled}
                      />
                    </Field>
                    <FieldDescription>
                      {t('editor.repeatHint')}
                    </FieldDescription>
                  </>
                )}
              </FieldSet>
            ) : (
              task.recurrenceId && (
                <FieldDescription>
                  {t('editor.occurrenceHint')}
                </FieldDescription>
              )
            )}
          </FieldGroup>
          {error && (
            <p role="alert" className="text-[12px] text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            {task && (
              <Button
                variant="ghost"
                className="gap-2 sm:mr-auto"
                disabled={disabled}
                onClick={() => onDelete(task)}
              >
                <Trash2 size={14} aria-hidden="true" />
                {t('editor.delete')}
              </Button>
            )}
            <Button variant="secondary" disabled={pending} onClick={onClose}>
              {t(committed ? 'close' : 'editor.cancel')}
            </Button>
            <Button type="submit" disabled={pending}>
              {t(
                pending
                  ? 'editor.saving'
                  : committed
                    ? 'refresh'
                    : 'editor.save',
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
