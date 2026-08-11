import { BellRing, Check, Clock3, Globe2, Info, Trash2, X } from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppIcon } from './app-icon';
import { Button } from './ui/button';
import { Input } from './ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { formatMinutes } from '../lib/format';
import { translateError } from '../i18n/helpers';
import type { AppLimit, LimitInput } from '../types/limits';
import type { KnownApp } from '../types/usage';

interface LimitModalProps {
  apps: KnownApp[];
  existing?: AppLimit | null;
  initialAppId?: string | null;
  onClose: () => void;
  onSave: (input: LimitInput) => Promise<void>;
  onDelete: (limitId: string) => Promise<void>;
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
  const { t } = useTranslation(['modals', 'common', 'errors']);
  const defaultAppId = existing?.appId || initialAppId || apps[0]?.id || '';
  const [appId, setAppId] = useState(defaultAppId);
  const [siteDomain, setSiteDomain] = useState(existing?.siteDomain || '');
  const [minutes, setMinutes] = useState(existing?.dailyLimitMinutes || 60);
  const [warningMinutes, setWarningMinutes] = useState(
    existing?.warningMinutes ?? 10,
  );
  const [enabled, setEnabled] = useState(existing?.enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useRef<HTMLFormElement>(null);
  const onCloseRef = useRef(onClose);
  const savingRef = useRef(saving);
  onCloseRef.current = onClose;
  savingRef.current = saving;
  const selectedApp = useMemo(
    () => apps.find((app) => app.id === appId),
    [appId, apps],
  );
  const selectedSites = selectedApp?.sites ?? [];
  const canSelectSite = Boolean(
    selectedApp && (selectedApp.category === 'browser' || selectedSites.length),
  );
  const safeMinutes = Number.isFinite(minutes) ? Math.round(minutes) : 0;
  const effectiveWarningMinutes = Math.min(
    Math.max(0, warningMinutes),
    Math.max(0, safeMinutes - 1),
  );
  const warningOptions = [
    ...new Set([
      0,
      ...[5, 10, 15].filter((value) => value < safeMinutes),
      effectiveWarningMinutes,
    ]),
  ].sort((left, right) => left - right);

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
    if (saving) return;
    if (!selectedApp) {
      setError(t('errors:selectApp'));
      return;
    }
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440) {
      setError(t('errors:invalidDuration'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({
        appId: selectedApp.id,
        appName: selectedApp.name,
        siteDomain: siteDomain || null,
        dailyLimitMinutes: minutes,
        warningMinutes: effectiveWarningMinutes,
        enabled,
      });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? translateError(reason.message, 'saveLimit')
          : t('errors:saveLimit'),
      );
      setSaving(false);
    }
  }

  async function remove() {
    if (!existing || saving) return;
    setSaving(true);
    try {
      await onDelete(existing.id || existing.appId);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? translateError(reason.message)
          : t('errors:unknown'),
      );
      setSaving(false);
    }
  }

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
        aria-labelledby="limit-modal-title"
        aria-busy={saving}
        className="modal-panel flex max-h-[calc(100vh-2.5rem)] w-full max-w-[510px] flex-col overflow-hidden rounded-[24px] border border-[var(--border)] bg-[var(--surface)] shadow-[0_28px_80px_rgba(15,23,42,.22)]"
      >
        <div className="flex shrink-0 items-start justify-between border-b border-[var(--border)] px-6 py-5">
          <div>
            <div className="mb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--accent-strong)]">
              <Clock3 size={13} /> {t('modals:limit.eyebrow')}
            </div>
            <h2
              id="limit-modal-title"
              className="text-[18px] font-bold tracking-[-0.03em] text-[var(--text)]"
            >
              {t(existing ? 'modals:limit.editTitle' : 'modals:limit.newTitle')}
            </h2>
          </div>
          <Button
            variant="icon"
            size="icon"
            onClick={onClose}
            disabled={saving}
            aria-label={t('common:actions.close')}
          >
            <X size={18} />
          </Button>
        </div>

        <div className="flex min-h-0 flex-col gap-5 overflow-y-auto px-6 py-5">
          <div>
            <label htmlFor="limit-app" className="field-label">
              {t('modals:limit.app')}
            </label>
            <Select
              disabled={saving || Boolean(existing) || !apps.length}
              value={appId || undefined}
              onValueChange={(value) => {
                setAppId(value);
                setSiteDomain('');
              }}
            >
              <SelectTrigger id="limit-app" className="mt-2">
                <span className="flex min-w-0 items-center gap-2.5">
                  {selectedApp && (
                    <AppIcon
                      id={selectedApp.id}
                      name={selectedApp.name}
                      size="sm"
                    />
                  )}
                  <SelectValue placeholder={t('modals:limit.noApps')} />
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel className="sr-only">
                    {t('modals:limit.app')}
                  </SelectLabel>
                  {apps.map((app) => (
                    <SelectItem
                      key={app.id}
                      value={app.id}
                      textValue={app.name}
                    >
                      <span className="truncate">{app.name}</span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          {canSelectSite && (
            <div>
              <label htmlFor="limit-site" className="field-label">
                {t('modals:limit.site')}
              </label>
              <Select
                disabled={saving || Boolean(existing)}
                value={siteDomain || '__browser__'}
                onValueChange={(value) =>
                  setSiteDomain(value === '__browser__' ? '' : value)
                }
              >
                <SelectTrigger id="limit-site" className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel className="sr-only">
                      {t('modals:limit.site')}
                    </SelectLabel>
                    <SelectItem
                      value="__browser__"
                      textValue={t('modals:limit.wholeBrowser')}
                    >
                      <span className="flex items-center gap-2.5">
                        {selectedApp && (
                          <AppIcon
                            id={selectedApp.id}
                            name={selectedApp.name}
                            size="sm"
                          />
                        )}
                        {t('modals:limit.wholeBrowser')}
                      </span>
                    </SelectItem>
                    {selectedSites.map((domain) => (
                      <SelectItem
                        key={domain}
                        value={domain}
                        textValue={domain}
                      >
                        <span className="flex items-center gap-2.5">
                          <Globe2 aria-hidden="true" />
                          <span className="truncate">{domain}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <p className="mt-1.5 text-[9px] leading-4 text-[var(--muted)]">
                {selectedSites.length
                  ? t('modals:limit.siteHint')
                  : t('modals:limit.noTrackedSites')}
              </p>
            </div>
          )}

          <div>
            <label htmlFor="limit-duration" className="field-label">
              {t('modals:limit.dailyTime')}
            </label>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {presets.map((preset) => (
                <Button
                  key={preset}
                  variant="secondary"
                  size="none"
                  onClick={() => setMinutes(preset)}
                  aria-pressed={minutes === preset}
                  disabled={saving}
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
                disabled={saving}
                onChange={(event) => setMinutes(Number(event.target.value))}
                className="limit-range min-w-0 flex-1"
              />
              <div className="flex items-center rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2">
                <Input
                  variant="number"
                  aria-label={t('modals:limit.minutesLabel')}
                  type="number"
                  min="1"
                  max="1440"
                  value={minutes}
                  disabled={saving}
                  onChange={(event) => setMinutes(Number(event.target.value))}
                />
                <span className="ml-1 text-[10px] font-semibold text-[var(--muted)]">
                  {t('modals:limit.minuteUnit')}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-4">
              <span className="mb-2 flex items-center gap-2 text-[11px] font-bold text-[var(--text)]">
                <BellRing size={15} className="text-[var(--accent-strong)]" />{' '}
                {t('modals:limit.warning')}
              </span>
              <Select
                disabled={saving}
                value={String(effectiveWarningMinutes)}
                onValueChange={(value) => setWarningMinutes(Number(value))}
              >
                <SelectTrigger className="h-7 border-0 bg-transparent px-0 shadow-none focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel className="sr-only">
                      {t('modals:limit.warning')}
                    </SelectLabel>
                    {warningOptions.map((value) => (
                      <SelectItem key={value} value={String(value)}>
                        {value === 0
                          ? t('modals:limit.noWarning')
                          : t('modals:limit.warningBefore', { count: value })}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </label>
            <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-4">
              <span>
                <span className="block text-[11px] font-bold text-[var(--text)]">
                  {t('modals:limit.enabled')}
                </span>
                <span className="mt-1 block text-[9px] font-medium text-[var(--muted)]">
                  {t('modals:limit.notifyDaily')}
                </span>
              </span>
              <input
                type="checkbox"
                checked={enabled}
                disabled={saving}
                onChange={(event) => setEnabled(event.target.checked)}
                className="peer sr-only"
              />
              <span className="relative h-6 w-11 rounded-full bg-[var(--toggle-off)] transition peer-checked:bg-[var(--accent)] peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--accent)] peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[var(--surface)] after:absolute after:left-1 after:top-1 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-sm after:transition peer-checked:after:translate-x-5" />
            </label>
          </div>

          <div className="flex items-start gap-2.5 rounded-xl bg-indigo-50/70 px-3.5 py-3 text-[10px] leading-4 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-200">
            <Info size={14} className="mt-0.5 shrink-0" />
            <span>{t('modals:limit.systemNotice')}</span>
          </div>
          {error && (
            <p role="alert" className="text-[10px] font-semibold text-rose-500">
              {error}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between border-t border-[var(--border)] bg-[var(--surface-muted)] px-6 py-4">
          <div>
            {existing && (
              <Button
                variant="link"
                size="none"
                onClick={remove}
                disabled={saving}
                className="text-rose-500 hover:text-rose-600"
              >
                <Trash2 size={14} /> {t('common:actions.delete')}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              {t('common:actions.cancel')}
            </Button>
            <Button type="submit" disabled={saving || !apps.length}>
              {saving ? (
                t('common:actions.saving')
              ) : (
                <>
                  <Check size={15} /> {t('common:actions.save')}
                </>
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
