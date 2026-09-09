import { Check, Clock3, Info, RotateCcw, Trash2, X } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { limitApi } from '../api';
import { translateError } from '../i18n/helpers';
import { formatDuration } from '../lib/format';
import type { ActivityDay, AppUsage } from '../types/usage';
import { AppIcon } from './app-icon';
import { Button } from './ui/button';
import { Input } from './ui/input';

interface ActivityEditorProps {
  app: AppUsage;
  range: { from: string; to: string };
  onClose: () => void;
  onSaved: () => Promise<void>;
}

type DurationFields = { hours: string; minutes: string; seconds: string };

function durationFields(seconds: number): DurationFields {
  const total = Math.round(seconds);
  return {
    hours: String(Math.floor(total / 3600)),
    minutes: String(Math.floor((total % 3600) / 60)),
    seconds: String(total % 60),
  };
}

function localDaySeconds(day: string): number {
  const start = new Date(`${day}T00:00:00`);
  const next = new Date(start);
  next.setDate(next.getDate() + 1);
  return (next.getTime() - start.getTime()) / 1000;
}

export function ActivityEditor({
  app,
  range,
  onClose,
  onSaved,
}: ActivityEditorProps) {
  const { i18n, t } = useTranslation(['activity', 'common']);
  const [days, setDays] = useState<ActivityDay[]>([]);
  const [record, setRecord] = useState<ActivityDay | null>(null);
  const [duration, setDuration] = useState(() => durationFields(0));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [needsReload, setNeedsReload] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [committed, setCommitted] = useState(false);
  const dialogRef = useRef<HTMLFormElement>(null);
  const requestRef = useRef({ id: 0 });
  const onCloseRef = useRef(onClose);
  const savingRef = useRef(saving);
  onCloseRef.current = onClose;
  savingRef.current = saving;
  const maximumSeconds = record ? localDaySeconds(record.day) : 0;
  const maximumHours = Math.floor(maximumSeconds / 3600);

  useEffect(() => {
    const requests = requestRef.current;
    const request = ++requests.id;
    void limitApi
      .getActivityDays(app.id, { from: range.from, to: range.to })
      .then((rows) => {
        if (request !== requests.id) return;
        const sorted = [...rows].sort((a, b) => b.day.localeCompare(a.day));
        const selected = sorted[0] ?? null;
        setDays(sorted);
        setRecord(selected);
        setDuration(durationFields(selected?.seconds ?? 0));
        setLoading(false);
      })
      .catch((reason: unknown) => {
        if (request !== requests.id) return;
        setError(
          reason instanceof Error
            ? translateError(reason.message)
            : t('editor.loadError'),
        );
        setNeedsReload(true);
        setLoading(false);
      });
    return () => {
      requests.id++;
    };
  }, [app.id, range.from, range.to, t]);

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const frame = window.requestAnimationFrame(() => {
      dialogRef.current
        ?.querySelector<HTMLElement>(
          'select:not(:disabled), button:not(:disabled)',
        )
        ?.focus();
    });
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (event.defaultPrevented || savingRef.current) return;
        event.preventDefault();
        onCloseRef.current();
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [
        ...dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), select:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      ];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKeyDown);
      previousFocus?.focus();
    };
  }, []);

  function selectRecord(next: ActivityDay | null) {
    setRecord(next);
    setDuration(durationFields(next?.seconds ?? 0));
    setConfirmDelete(false);
    setError('');
    setNeedsReload(false);
  }

  async function reload() {
    if (loading || saving) return;
    const requests = requestRef.current;
    const request = ++requests.id;
    setLoading(true);
    setError('');
    setConfirmDelete(false);
    try {
      const rows = await limitApi.getActivityDays(app.id, range);
      if (request !== requests.id) return;
      const sorted = [...rows].sort((a, b) => b.day.localeCompare(a.day));
      setDays(sorted);
      selectRecord(
        sorted.find((row) => row.day === record?.day) ?? sorted[0] ?? null,
      );
    } catch (reason) {
      if (request !== requests.id) return;
      setError(
        reason instanceof Error
          ? translateError(reason.message)
          : t('editor.loadError'),
      );
      setNeedsReload(true);
    } finally {
      if (request === requests.id) setLoading(false);
    }
  }

  async function finishSave() {
    setSaving(true);
    try {
      await onSaved();
      onClose();
    } catch {
      setError(t('editor.refreshError'));
      setSaving(false);
    }
  }

  async function mutate(remove: boolean) {
    if (!record || saving || loading || needsReload || committed) return;
    const values = [duration.hours, duration.minutes, duration.seconds];
    const [hours, minutes, seconds] = values.map(Number);
    const total = hours * 3600 + minutes * 60 + seconds;
    if (
      !remove &&
      (values.some((value) => !/^\d+$/.test(value)) ||
        hours > maximumHours ||
        minutes > 59 ||
        seconds > 59 ||
        total > maximumSeconds)
    ) {
      setError(
        t('editor.invalidDuration', { max: formatDuration(maximumSeconds) }),
      );
      return;
    }
    setSaving(true);
    setError('');
    try {
      const input = {
        appId: app.id,
        day: record.day,
        expectedRevision: record.revision,
      };
      if (remove) await limitApi.deleteActivity(input);
      else await limitApi.updateActivity({ ...input, seconds: total });
      setCommitted(true);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : '';
      setError(message ? translateError(message) : t('editor.saveError'));
      setNeedsReload(
        message === 'activityConflict' || message === 'activityNotFound',
      );
      setConfirmDelete(false);
      setSaving(false);
      return;
    }
    await finishSave();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!confirmDelete) void mutate(false);
  }

  function formatDay(day: string) {
    return new Intl.DateTimeFormat(
      i18n.resolvedLanguage === 'uk' ? 'uk-UA' : 'en-US',
      { day: 'numeric', month: 'long', year: 'numeric' },
    ).format(new Date(`${day}T12:00:00`));
  }

  const disabled = saving || loading || needsReload || committed;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-5 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <form
        ref={dialogRef}
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="activity-editor-title"
        aria-busy={loading || saving}
        className="modal-panel flex max-h-[calc(100vh-2.5rem)] w-full max-w-[460px] flex-col overflow-hidden rounded-[24px] border border-[var(--border)] bg-[var(--surface)] shadow-[0_28px_80px_rgba(15,23,42,.22)]"
      >
        <div className="flex shrink-0 items-start justify-between border-b border-[var(--border)] px-6 py-5">
          <div>
            <div className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--accent-strong)]">
              <Clock3 size={13} aria-hidden="true" /> {t('title')}
            </div>
            <h2
              id="activity-editor-title"
              className="text-[18px] font-bold tracking-[-0.03em] text-[var(--text)]"
            >
              {t('editor.title')}
            </h2>
          </div>
          <Button
            variant="icon"
            size="icon"
            onClick={onClose}
            disabled={saving}
            aria-label={t('common:actions.close')}
          >
            <X size={18} aria-hidden="true" />
          </Button>
        </div>

        <div className="flex min-h-0 flex-col gap-5 overflow-y-auto px-6 py-5">
          <div className="flex items-center gap-3">
            <AppIcon id={app.id} name={app.name} />
            <div className="min-w-0">
              <div className="truncate text-[13px] font-bold text-[var(--text)]">
                {app.name}
              </div>
              <p className="mt-0.5 text-[10px] text-[var(--muted)]">
                {t('editor.subtitle')}
              </p>
            </div>
          </div>

          {loading ? (
            <p role="status" className="py-4 text-[11px] text-[var(--muted)]">
              {t('editor.loading')}
            </p>
          ) : !record ? (
            !error && (
              <p role="status" className="py-4 text-[11px] text-[var(--muted)]">
                {t('editor.empty')}
              </p>
            )
          ) : (
            <>
              <div>
                <label htmlFor="activity-editor-day" className="field-label">
                  {t('editor.day')}
                </label>
                <select
                  id="activity-editor-day"
                  className="mt-2 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 text-[12px] font-semibold text-[var(--text)] outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-50"
                  value={record.day}
                  disabled={disabled}
                  onChange={(event) =>
                    selectRecord(
                      days.find((row) => row.day === event.target.value) ??
                        null,
                    )
                  }
                >
                  {days.map((day) => (
                    <option key={day.day} value={day.day}>
                      {formatDay(day.day)}
                    </option>
                  ))}
                </select>
              </div>
              <fieldset
                disabled={disabled}
                aria-describedby="activity-editor-notice"
              >
                <legend className="field-label">
                  {t('columns.activeTime')}
                </legend>
                <div className="mt-2 grid grid-cols-3 gap-3">
                  {(['hours', 'minutes', 'seconds'] as const).map((unit) => (
                    <label key={unit} className="min-w-0">
                      <Input
                        type="number"
                        min={0}
                        max={unit === 'hours' ? maximumHours : 59}
                        step={1}
                        required
                        value={duration[unit]}
                        onChange={(event) => {
                          setDuration((current) => ({
                            ...current,
                            [unit]: event.target.value,
                          }));
                          setError('');
                          setConfirmDelete(false);
                        }}
                        className="h-14 rounded-xl bg-[var(--surface-muted)] text-center text-[22px] font-bold tabular-nums"
                        aria-label={t(`editor.${unit}`)}
                      />
                      <span className="mt-1.5 block text-center text-[10px] font-semibold text-[var(--muted)]">
                        {t(`editor.${unit}`)}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div
                id="activity-editor-notice"
                className="flex items-start gap-2.5 rounded-xl bg-[var(--surface-muted)] px-3.5 py-3 text-[10px] leading-4 text-[var(--muted)]"
              >
                <Info
                  size={14}
                  className="mt-0.5 shrink-0 text-[var(--accent-strong)]"
                  aria-hidden="true"
                />
                <span>{t('editor.notice')}</span>
              </div>
              {confirmDelete && (
                <div
                  role="alert"
                  className="rounded-xl border border-rose-500/25 bg-rose-500/5 px-3.5 py-3 text-[10px] leading-4 text-[var(--text)]"
                >
                  <p>
                    {t('editor.deleteConfirmation', {
                      app: app.name,
                      day: formatDay(record.day),
                    })}
                  </p>
                  <Button
                    variant="link"
                    size="none"
                    className="mt-2"
                    disabled={saving}
                    onClick={() => setConfirmDelete(false)}
                  >
                    {t('editor.keepActivity')}
                  </Button>
                </div>
              )}
            </>
          )}

          {error && (
            <div role="alert" className="space-y-2">
              <p className="text-[10px] font-semibold leading-4 text-rose-500">
                {error}
              </p>
              {(needsReload || committed) && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={saving || loading}
                  className="gap-1.5"
                  onClick={() => void (committed ? finishSave() : reload())}
                >
                  <RotateCcw size={12} aria-hidden="true" />{' '}
                  {t(committed ? 'editor.refresh' : 'editor.reload')}
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] bg-[var(--surface-muted)] px-6 py-4">
          <div>
            {record && (
              <Button
                variant="link"
                size="none"
                disabled={disabled}
                onClick={() => {
                  if (confirmDelete) void mutate(true);
                  else setConfirmDelete(true);
                }}
                className="text-rose-500 hover:text-rose-600"
              >
                <Trash2 size={14} aria-hidden="true" />{' '}
                {t(confirmDelete ? 'editor.confirmDelete' : 'editor.deleteDay')}
              </Button>
            )}
          </div>
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              {t('common:actions.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={disabled || !record || confirmDelete}
            >
              {saving ? (
                t('common:actions.saving')
              ) : (
                <>
                  <Check size={15} aria-hidden="true" />{' '}
                  {t('common:actions.save')}
                </>
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
