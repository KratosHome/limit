import {
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from 'react';
import {
  ArrowUpRight,
  Check,
  GitPullRequest,
  HeartHandshake,
  LoaderCircle,
  MessageSquare,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { limitApi } from '../api';
import { useSupportConfig } from '../hooks/use-support-config';
import type {
  FeedbackInput,
  SupportLink as SupportLinkKind,
} from '../types/support';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from './ui/field';

type Source = FeedbackInput['source'];
type FeedbackError =
  'feedbackInvalid' | 'feedbackRateLimited' | 'feedbackUnavailable';
type Draft = {
  message: string;
  contact: string;
  pending: boolean;
  sent: boolean;
  error: FeedbackError | null;
};
const emptyDraft = (): Draft => ({
  message: '',
  contact: '',
  pending: false,
  sent: false,
  error: null,
});
// Session memory keeps a failed draft and in-flight submission across navigation.
// Nothing is persisted to disk or sent until the user submits the form.
const drafts: Record<Source, Draft> = {
  health: emptyDraft(),
  settings: emptyDraft(),
};
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function patchDraft(source: Source, patch: Partial<Draft>) {
  drafts[source] = { ...drafts[source], ...patch };
  listeners.forEach((listener) => listener());
}

export function FeedbackForm({
  source,
  available,
  checking,
  onRetry,
}: {
  source: Source;
  available: boolean;
  checking: boolean;
  onRetry: () => void;
}) {
  const { t } = useTranslation('support');
  const id = useId();
  const messageInput = useRef<HTMLTextAreaElement>(null);
  const draft = useSyncExternalStore(
    subscribe,
    () => drafts[source],
    () => drafts[source],
  );
  const [invalid, setInvalid] = useState<'message' | 'contact' | null>(null);
  async function send(event: FormEvent) {
    event.preventDefault();
    if (drafts[source].pending || !available || checking) return;
    const message = drafts[source].message.trim();
    const contact = drafts[source].contact.trim();
    if (message.length < 10 || message.length > 3000) {
      setInvalid('message');
      messageInput.current?.focus();
      return;
    }
    if (contact.length > 200) {
      setInvalid('contact');
      document.getElementById(`${id}-contact`)?.focus();
      return;
    }
    setInvalid(null);
    patchDraft(source, { pending: true, sent: false, error: null });
    try {
      const sent = await limitApi.sendFeedback({
        message,
        ...(contact ? { contact } : {}),
        source,
      });
      if (!sent) throw new Error('feedbackUnavailable');
      patchDraft(source, { ...emptyDraft(), sent: true });
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      patchDraft(source, {
        pending: false,
        error:
          code === 'feedbackInvalid' || code === 'feedbackRateLimited'
            ? code
            : 'feedbackUnavailable',
      });
    }
  }
  return (
    <section
      className="card min-w-0 p-5 text-[12px] font-medium"
      aria-labelledby={`${id}-title`}
    >
      <div className="mb-5 flex items-start gap-3">
        <MessageSquare
          size={19}
          className="mt-0.5 shrink-0 text-primary"
          aria-hidden="true"
        />
        <div>
          <h2 id={`${id}-title`} className="section-title">
            {t(source === 'health' ? 'feedback.healthTitle' : 'feedback.title')}
          </h2>
          <p className="section-subtitle">
            {t(
              source === 'health'
                ? 'feedback.healthDescription'
                : 'feedback.description',
            )}
          </p>
        </div>
      </div>
      <form
        onSubmit={(event) => void send(event)}
        noValidate
        className="flex flex-col gap-4"
      >
        <FieldGroup className="gap-4">
          <Field
            data-invalid={invalid === 'message'}
            data-disabled={draft.pending}
            className="gap-2"
          >
            <FieldLabel htmlFor={`${id}-message`}>
              {t('feedback.message')}
            </FieldLabel>
            <Textarea
              ref={messageInput}
              id={`${id}-message`}
              value={draft.message}
              maxLength={3000}
              required
              rows={5}
              disabled={draft.pending}
              aria-invalid={invalid === 'message'}
              aria-describedby={`${id}-message-help`}
              className="max-h-64 min-h-36 resize-y"
              placeholder={t('feedback.placeholder')}
              onChange={(event) => {
                patchDraft(source, {
                  message: event.target.value,
                  sent: false,
                  error: null,
                });
                if (invalid === 'message') setInvalid(null);
              }}
            />
            <div
              id={`${id}-message-help`}
              className="flex flex-wrap items-start justify-between gap-2"
            >
              <FieldDescription>{t('feedback.draft')}</FieldDescription>
              <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                {t('feedback.characters', { count: draft.message.length })}
              </span>
            </div>
            {invalid === 'message' && (
              <FieldError>{t('feedback.invalidMessage')}</FieldError>
            )}
          </Field>
          <Field
            data-invalid={invalid === 'contact'}
            data-disabled={draft.pending}
            className="gap-2"
          >
            <FieldLabel htmlFor={`${id}-contact`}>
              {t('feedback.contact')}
            </FieldLabel>
            <Input
              id={`${id}-contact`}
              value={draft.contact}
              maxLength={200}
              autoComplete="off"
              disabled={draft.pending}
              aria-invalid={invalid === 'contact'}
              aria-describedby={`${id}-contact-help`}
              placeholder={t('feedback.contactPlaceholder')}
              onChange={(event) => {
                patchDraft(source, {
                  contact: event.target.value,
                  sent: false,
                  error: null,
                });
                if (invalid === 'contact') setInvalid(null);
              }}
            />
            <FieldDescription id={`${id}-contact-help`}>
              {t('feedback.contactHint')}
            </FieldDescription>
            {invalid === 'contact' && (
              <FieldError>{t('feedback.invalidContact')}</FieldError>
            )}
          </Field>
        </FieldGroup>
        <p className="text-[10px] leading-4 text-muted-foreground">
          {t('feedback.privacy')}
        </p>
        {draft.error && <FieldError>{t(`errors.${draft.error}`)}</FieldError>}
        {draft.sent && (
          <p
            role="status"
            className="flex items-center gap-2 text-[12px] text-primary"
          >
            <Check size={15} aria-hidden="true" />
            {t('feedback.sent')}
          </p>
        )}
        {!available && !checking && (
          <div className="flex flex-col items-start gap-2">
            <p
              role="status"
              className="text-[11px] leading-5 text-muted-foreground"
            >
              {t('feedback.unavailable')}
            </p>
            <Button variant="link" size="none" onClick={onRetry}>
              {t('feedback.retry')}
            </Button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            disabled={draft.pending || !available || checking}
            aria-busy={draft.pending}
          >
            {draft.pending && (
              <LoaderCircle
                size={14}
                className="motion-safe:animate-spin"
                aria-hidden="true"
              />
            )}
            {t(draft.pending ? 'feedback.sending' : 'feedback.send')}
          </Button>
          {checking && (
            <p role="status" className="text-[10px] text-muted-foreground">
              {t('feedback.checking')}
            </p>
          )}
        </div>
      </form>
    </section>
  );
}

function SupportLink({ kind }: { kind: SupportLinkKind }) {
  const { t } = useTranslation('support');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const pendingRef = useRef(false);
  async function open() {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError(false);
    try {
      if (!(await limitApi.openSupportLink(kind))) setError(true);
    } catch {
      setError(true);
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }
  return (
    <div className="flex flex-col items-start gap-2 text-[12px] font-medium">
      <Button
        variant="secondary"
        className="gap-2"
        onClick={() => void open()}
        disabled={pending}
      >
        {t(kind === 'github' ? 'github.action' : 'donation.action')}
        <ArrowUpRight size={14} aria-hidden="true" />
      </Button>
      {error && <FieldError>{t('errors.supportLinkUnavailable')}</FieldError>}
    </div>
  );
}

export function SupportSection({ source }: { source: Source }) {
  const { t } = useTranslation('support');
  const { config, loading, retry } = useSupportConfig();
  return (
    <div className="flex flex-col gap-4">
      {source === 'settings' && (
        <header>
          <h2 className="section-title">{t('title')}</h2>
          <p className="section-subtitle">{t('description')}</p>
        </header>
      )}
      <div className="grid items-start gap-4 min-[1000px]:grid-cols-[minmax(0,1.4fr)_minmax(240px,.8fr)]">
        <FeedbackForm
          source={source}
          available={config?.feedbackAvailable ?? false}
          checking={loading}
          onRetry={retry}
        />
        <div className="flex flex-col gap-4">
          <section className="card flex flex-col items-start gap-4 p-5">
            <HeartHandshake
              size={23}
              className="text-primary"
              aria-hidden="true"
            />
            <div>
              <h2 className="section-title">{t('donation.title')}</h2>
              <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                {t('donation.description')}
              </p>
            </div>
            {config?.donationAvailable ? (
              <SupportLink kind="donate" />
            ) : (
              <p className="text-[10px] leading-4 text-muted-foreground">
                {t('donation.unavailable')}
              </p>
            )}
          </section>
          <section className="card flex flex-col items-start gap-4 p-5">
            <GitPullRequest
              size={23}
              className="text-muted-foreground"
              aria-hidden="true"
            />
            <div>
              <h2 className="section-title">{t('github.title')}</h2>
              <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                {t('github.description')}
              </p>
            </div>
            <SupportLink kind="github" />
          </section>
        </div>
      </div>
    </div>
  );
}
