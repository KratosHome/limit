import { Trash2 } from 'lucide-react';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { limitApi } from '../api';
import type { DateRange } from '../types/navigation';
import type { AppUsage } from '../types/usage';
import { Button } from './ui/button';

interface SiteUsageDeleteDialogProps {
  app: Pick<AppUsage, 'id' | 'name'>;
  domain: string;
  range: DateRange;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

export function SiteUsageDeleteDialog({
  app,
  domain,
  range,
  onClose,
  onSaved,
}: SiteUsageDeleteDialogProps) {
  const { t, i18n } = useTranslation(['components', 'common']);
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pendingRef = useRef(false);
  const committedRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [failure, setFailure] = useState<'delete' | 'refresh' | null>(null);
  const dateFormatter = new Intl.DateTimeFormat(i18n.language, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  function formatDay(value: string) {
    const [year, month, day] = value.split('-').map(Number);
    return dateFormatter.format(new Date(year, month - 1, day));
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialog.showModal();
    dialog
      .querySelector<HTMLButtonElement>('[data-cancel-site-delete]')
      ?.focus();
    return () => {
      dialog.close();
      previousFocus?.focus();
    };
  }, []);

  function close() {
    if (!pendingRef.current) onClose();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setFailure(null);
    try {
      if (!committedRef.current) {
        await limitApi.deleteSiteUsage({ appId: app.id, domain, range });
        committedRef.current = true;
        setCommitted(true);
      }
      await onSaved();
      onClose();
    } catch {
      setFailure(committedRef.current ? 'refresh' : 'delete');
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-busy={pending}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      className="m-auto max-h-[calc(100dvh-40px)] w-[440px] max-w-[calc(100vw-40px)] overflow-y-auto rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-0 text-[var(--text)] shadow-[0_28px_80px_rgba(15,23,42,.22)] backdrop:bg-slate-950/35 backdrop:backdrop-blur-[2px]"
    >
      <form onSubmit={(event) => void submit(event)} className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
            <Trash2 size={17} aria-hidden="true" />
          </div>
          <h2
            id={titleId}
            className="pt-1 text-[18px] font-bold leading-6 tracking-[-0.03em]"
          >
            {t('components:sites.deleteTitle')}
          </h2>
        </div>

        <p
          id={descriptionId}
          className="mt-4 text-[11px] leading-5 text-[var(--muted-strong)]"
        >
          {t('components:sites.deleteDescription')}
        </p>
        <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-4">
          <p className="break-all text-[14px] font-bold leading-5">{domain}</p>
          <dl className="mt-3 space-y-2 text-[11px] leading-4">
            <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
              <dt className="text-[var(--muted)]">
                {t('components:sites.deleteBrowser')}
              </dt>
              <dd className="break-words font-semibold">{app.name}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-[var(--muted)]">
                {t('components:sites.deletePeriod')}
              </dt>
              <dd className="font-semibold">
                <time dateTime={range.from}>{formatDay(range.from)}</time>
                {range.from !== range.to && (
                  <>
                    {' — '}
                    <time dateTime={range.to}>{formatDay(range.to)}</time>
                  </>
                )}
              </dd>
            </div>
          </dl>
        </div>
        <p className="mt-3 text-[11px] leading-5 text-[var(--muted)]">
          {t('components:sites.deleteRetention')}
        </p>
        {failure && (
          <p
            role="alert"
            className="mt-3 text-[11px] leading-5 text-rose-600 dark:text-rose-400"
          >
            {t(
              failure === 'refresh'
                ? 'components:sites.deleteRefreshFailed'
                : 'components:sites.deleteFailed',
            )}
          </p>
        )}
        <div className="mt-5 grid grid-cols-2 gap-2 text-[12px] font-semibold leading-4">
          <Button
            variant="secondary"
            disabled={pending}
            onClick={close}
            data-cancel-site-delete
          >
            {t(committed ? 'common:actions.close' : 'common:actions.cancel')}
          </Button>
          <button
            type="submit"
            disabled={pending}
            className={`inline-flex min-h-[38px] items-center justify-center rounded-[11px] px-3 py-2 text-[11px] font-bold leading-4 text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 ${committed ? 'bg-[var(--accent)]' : 'bg-rose-600'}`}
          >
            {t(
              pending
                ? committed
                  ? 'components:sites.refreshing'
                  : 'components:sites.deleting'
                : committed
                  ? 'components:sites.deleteRefresh'
                  : 'common:actions.delete',
            )}
          </button>
        </div>
      </form>
    </dialog>,
    document.body,
  );
}
