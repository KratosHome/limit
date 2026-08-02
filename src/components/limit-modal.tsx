import { BellRing, Check, Clock3, Info, Trash2, X } from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { AppIcon } from './app-icon';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { formatMinutes } from '../lib/format';
import type { AppLimit, LimitInput } from '../types/limits';
import type { KnownApp } from '../types/usage';

interface LimitModalProps {
  apps: KnownApp[];
  existing?: AppLimit | null;
  initialAppId?: string | null;
  onClose: () => void;
  onSave: (input: LimitInput) => Promise<void>;
  onDelete: (appId: string) => Promise<void>;
}

const presets = [30, 60, 120, 180];

export function LimitModal({
  apps,
  existing,
  initialAppId,
  onClose,
  onSave,
  onDelete,
}: LimitModalProps) {
  const defaultAppId = existing?.appId || initialAppId || apps[0]?.id || '';
  const [appId, setAppId] = useState(defaultAppId);
  const [minutes, setMinutes] = useState(existing?.dailyLimitMinutes || 60);
  const [warningMinutes, setWarningMinutes] = useState(
    existing?.warningMinutes ?? 10,
  );
  const [enabled, setEnabled] = useState(existing?.enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useRef<HTMLFormElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const selectedApp = useMemo(
    () => apps.find((app) => app.id === appId),
    [appId, apps],
  );

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const frame = window.requestAnimationFrame(() => {
      const firstControl =
        dialogRef.current?.querySelector<HTMLElement>(
          '#limit-app:not(:disabled)',
        ) ||
        dialogRef.current?.querySelector<HTMLElement>('#limit-duration') ||
        dialogRef.current?.querySelector<HTMLElement>('button:not(:disabled)');
      firstControl?.focus();
    });
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [
        ...dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), select:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      ];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
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

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selectedApp) {
      setError('Оберіть застосунок');
      return;
    }
    if (minutes < 1 || minutes > 1440) {
      setError('Вкажіть час від 1 хвилини до 24 годин');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({
        appId: selectedApp.id,
        appName: selectedApp.name,
        dailyLimitMinutes: minutes,
        warningMinutes: Math.min(warningMinutes, Math.max(0, minutes - 1)),
        enabled,
      });
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Не вдалося зберегти ліміт',
      );
      setSaving(false);
    }
  }

  async function remove() {
    if (!existing || saving) return;
    setSaving(true);
    await onDelete(existing.appId);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-5 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        ref={dialogRef}
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="limit-modal-title"
        aria-busy={saving}
        className="modal-panel w-full max-w-[510px] overflow-hidden rounded-[24px] border border-[var(--border)] bg-[var(--surface)] shadow-[0_28px_80px_rgba(15,23,42,.22)]"
      >
        <div className="flex items-start justify-between border-b border-[var(--border)] px-6 py-5">
          <div>
            <div className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--accent-strong)]">
              <Clock3 size={13} /> Щоденна межа
            </div>
            <h2
              id="limit-modal-title"
              className="text-[18px] font-bold tracking-[-0.03em] text-[var(--text)]"
            >
              {existing ? 'Редагувати ліміт' : 'Новий ліміт'}
            </h2>
          </div>
          <Button
            variant="icon"
            size="icon"
            onClick={onClose}
            aria-label="Закрити"
          >
            <X size={18} />
          </Button>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div>
            <label htmlFor="limit-app" className="field-label">
              Застосунок
            </label>
            <div className="relative mt-2">
              {selectedApp && (
                <div className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2">
                  <AppIcon
                    id={selectedApp.id}
                    name={selectedApp.name}
                    size="sm"
                  />
                </div>
              )}
              <select
                id="limit-app"
                disabled={Boolean(existing)}
                value={appId}
                onChange={(event) => setAppId(event.target.value)}
                className="field-input h-14 w-full pl-14 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {!apps.length && (
                  <option value="">
                    Спочатку відкрийте потрібний застосунок
                  </option>
                )}
                {apps.map((app) => (
                  <option key={app.id} value={app.id}>
                    {app.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="limit-duration" className="field-label">
              Час на день
            </label>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {presets.map((preset) => (
                <Button
                  key={preset}
                  variant="secondary"
                  size="none"
                  onClick={() => setMinutes(preset)}
                  className={`rounded-xl px-2 py-2.5 text-[11px] ${minutes === preset ? 'border-[var(--accent)] bg-[var(--nav-active)] text-[var(--accent-strong)]' : 'bg-transparent'}`}
                >
                  {formatMinutes(preset)}
                </Button>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-3">
              <input
                id="limit-duration"
                aria-valuetext={formatMinutes(minutes)}
                type="range"
                min="5"
                max="480"
                step="5"
                value={Math.min(minutes, 480)}
                onChange={(event) => setMinutes(Number(event.target.value))}
                className="limit-range min-w-0 flex-1"
              />
              <div className="flex items-center rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2">
                <Input
                  variant="number"
                  aria-label="Ліміт у хвилинах"
                  type="number"
                  min="1"
                  max="1440"
                  value={minutes}
                  onChange={(event) => setMinutes(Number(event.target.value))}
                />
                <span className="ml-1 text-[10px] font-semibold text-[var(--muted)]">
                  хв
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-4">
              <span className="mb-2 flex items-center gap-2 text-[11px] font-bold text-[var(--text)]">
                <BellRing size={15} className="text-[var(--accent-strong)]" />{' '}
                Попередити
              </span>
              <select
                value={warningMinutes}
                onChange={(event) =>
                  setWarningMinutes(Number(event.target.value))
                }
                className="w-full bg-transparent text-[11px] font-semibold text-[var(--muted-strong)] outline-none"
              >
                <option value={0}>Без попередження</option>
                <option value={5}>За 5 хвилин</option>
                <option value={10}>За 10 хвилин</option>
                <option value={15}>За 15 хвилин</option>
              </select>
            </label>
            <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-4">
              <span>
                <span className="block text-[11px] font-bold text-[var(--text)]">
                  Ліміт активний
                </span>
                <span className="mt-1 block text-[9px] font-medium text-[var(--muted)]">
                  Сповіщати щодня
                </span>
              </span>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => setEnabled(event.target.checked)}
                className="peer sr-only"
              />
              <span className="relative h-6 w-11 rounded-full bg-[var(--toggle-off)] transition peer-checked:bg-[var(--accent)] after:absolute after:left-1 after:top-1 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-sm after:transition peer-checked:after:translate-x-5" />
            </label>
          </div>

          <div className="flex items-start gap-2.5 rounded-xl bg-indigo-50/70 px-3.5 py-3 text-[10px] leading-4 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-200">
            <Info size={14} className="mt-0.5 shrink-0" />
            <span>
              Limit покаже системне сповіщення, але не закриватиме застосунок
              автоматично.
            </span>
          </div>
          {error && (
            <p role="alert" className="text-[10px] font-semibold text-rose-500">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-[var(--border)] bg-[var(--surface-muted)] px-6 py-4">
          <div>
            {existing && (
              <Button
                variant="link"
                size="none"
                onClick={remove}
                disabled={saving}
                className="text-rose-500 hover:text-rose-600"
              >
                <Trash2 size={14} /> Видалити
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Скасувати
            </Button>
            <Button type="submit" disabled={saving || !apps.length}>
              {saving ? (
                'Зберігаю…'
              ) : (
                <>
                  <Check size={15} /> Зберегти
                </>
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
