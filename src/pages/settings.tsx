import {
  Bell,
  CircleHelp,
  ExternalLink,
  Globe2,
  HardDrive,
  Laptop,
  Moon,
  Power,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { DashboardData } from '../types/usage';
import type {
  PermissionKind,
  Settings as SettingsType,
} from '../types/settings';
import { Button } from '../components/ui/button';
import { LanguageSelect } from '../components/language-select';
import type { AppLanguage } from '../i18n';
import type { AppUpdates } from '../hooks/use-app-updates';
import { AppUpdateSettings } from '../components/app-update-settings';

interface SettingsProps {
  data: DashboardData;
  updates: AppUpdates;
  theme: 'light' | 'dark';
  onThemeChange: (theme: 'light' | 'dark') => void;
  onLanguageChange: (language: AppLanguage) => void;
  onSettingsChange: (patch: Partial<SettingsType>) => Promise<void>;
  onOpenPermissions: (kind?: PermissionKind) => Promise<boolean>;
}

type TrackingStatus = {
  detail: string;
  label: string;
  tone: 'ok' | 'muted' | 'warning';
};

function Toggle({
  checked,
  disabled = false,
  onChange,
  label,
  describedBy,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
  label: string;
  describedBy?: string;
}) {
  return (
    <Button
      variant="ghost"
      size="none"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 rounded-full p-0 transition hover:bg-[var(--toggle-off)] ${checked ? 'bg-[var(--accent)] hover:bg-[var(--accent)]' : 'bg-[var(--toggle-off)]'}`}
    >
      <span
        className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition ${checked ? 'left-6' : 'left-1'}`}
      />
    </Button>
  );
}

function Row({
  icon: Icon,
  title,
  description,
  descriptionId,
  descriptionLive = false,
  children,
}: {
  icon: typeof Bell;
  title: string;
  description: string;
  descriptionId?: string;
  descriptionLive?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 border-b border-[var(--border)] px-5 py-4 last:border-b-0">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--surface-muted)] text-[var(--muted-strong)]">
        <Icon size={17} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-bold text-[var(--text)]">{title}</div>
        <p
          id={descriptionId}
          aria-live={descriptionLive ? 'polite' : undefined}
          className="mt-0.5 text-[10px] leading-4 text-[var(--muted)]"
        >
          {description}
        </p>
      </div>
      {children}
    </div>
  );
}

type SettingsTFunction = TFunction<readonly ['settings', 'common']>;

function notificationDescription(data: DashboardData, t: SettingsTFunction) {
  if (!data.settings.notificationsEnabled)
    return t('notificationsDisabledDescription');
  const permission = data.notificationPermission;
  if (permission.authorizationStatus === 'unsupported')
    return t('notificationsUnsupportedDescription');
  if (data.platform === 'win32') {
    if (permission.authorizationStatus === 'unknown')
      return t('notificationsCheckingWindowsDescription');
    if (
      permission.authorizationStatus === 'suppressed' ||
      permission.authorizationStatus === 'denied' ||
      !permission.canPresent
    )
      return t('notificationsSuppressedWindowsDescription');
    return t('notificationsReadyDescription');
  }
  if (data.platform !== 'darwin') return t('notificationsDescription');

  if (
    permission.authorizationStatus === 'denied' ||
    ((permission.authorizationStatus === 'authorized' ||
      permission.authorizationStatus === 'provisional') &&
      !permission.canPresent)
  ) {
    return t('notificationsPermissionRequiredDescription');
  }
  if (
    (permission.authorizationStatus === 'authorized' ||
      permission.authorizationStatus === 'provisional') &&
    permission.canPresent
  ) {
    return t('notificationsReadyDescription');
  }
  if (permission.authorizationStatus === 'not-determined')
    return t('notificationsPermissionPendingDescription');
  return t('notificationsCheckingDescription');
}

function activityStatus(
  data: DashboardData,
  t: SettingsTFunction,
): TrackingStatus {
  if (!data.settings.trackingEnabled)
    return {
      label: t('status.disabled'),
      detail: t('status.activityDisabledDetail'),
      tone: 'muted',
    };
  if (!data.tracker.running)
    return {
      label: t('status.notRunning'),
      detail: t('status.notRunningDetail'),
      tone: 'warning',
    };
  if (
    data.tracker.permissionState === 'denied' ||
    data.tracker.permissionState === 'error'
  ) {
    return {
      label: t('status.attention'),
      detail: t('status.accessibilityDetail'),
      tone: 'warning',
    };
  }
  if (data.tracker.permissionState === 'granted')
    return {
      label: t('status.working'),
      detail: t('status.activityWorkingDetail'),
      tone: 'ok',
    };
  return {
    label: t('status.checking'),
    detail: t('status.checkingDetail'),
    tone: 'muted',
  };
}

function websiteStatus(
  data: DashboardData,
  t: SettingsTFunction,
): TrackingStatus {
  if (!data.settings.websiteTrackingEnabled) {
    return {
      label: t('status.disabled'),
      detail: t('status.websitesDisabledDetail'),
      tone: 'muted',
    };
  }
  if (
    data.tracker.websitePermissionState === 'denied' ||
    data.tracker.websitePermissionState === 'error'
  ) {
    const details = {
      'app-accessibility-permission': 'status.appAccessibilityDetail',
      'accessibility-permission': 'status.browserAccessibilityDetail',
      'automation-permission': 'status.browserAutomationDetail',
      'url-provider-error': 'status.browserReadErrorDetail',
    } as const;
    const error = data.tracker.lastWebsiteError;
    return {
      label: t('status.attention'),
      detail: t(
        error && error in details
          ? details[error as keyof typeof details]
          : 'status.permissionsDetail',
      ),
      tone: 'warning',
    };
  }
  if (data.tracker.websitePermissionState === 'unavailable') {
    return {
      label: t('status.noDomain'),
      detail: t('status.noDomainDetail'),
      tone: 'warning',
    };
  }
  if (data.tracker.currentApp?.site?.domain) {
    return {
      label: t('status.working'),
      detail: t('status.domainReceived', {
        domain: data.tracker.currentApp.site.domain,
      }),
      tone: 'ok',
    };
  }
  if (data.tracker.websitePermissionState === 'granted') {
    return {
      label: t('status.accessConfirmed'),
      detail: t('status.accessConfirmedDetail'),
      tone: 'ok',
    };
  }
  return {
    label: t('status.waitingBrowser'),
    detail: t('status.waitingBrowserDetail'),
    tone: 'muted',
  };
}

function StatusRow({
  name,
  status,
  children,
}: {
  name: string;
  status: TrackingStatus;
  children?: ReactNode;
}) {
  const toneClass =
    status.tone === 'ok'
      ? 'bg-emerald-500'
      : status.tone === 'warning'
        ? 'bg-amber-500'
        : 'bg-slate-400';
  return (
    <div className="flex items-start gap-3 rounded-xl bg-[var(--surface-muted)] px-3 py-2.5">
      <span
        className={`mt-1 h-2 w-2 shrink-0 rounded-full ${toneClass}`}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div aria-live="polite" aria-atomic="true">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-bold text-[var(--text)]">
            <span>{name}</span>
            <span>{status.label}</span>
          </div>
          <p className="mt-1 text-[9px] leading-4 text-[var(--muted)]">
            {status.detail}
          </p>
        </div>
        {children && (
          <div className="mt-2 flex flex-wrap gap-1.5">{children}</div>
        )}
      </div>
    </div>
  );
}

export function Settings({
  data,
  updates,
  theme,
  onThemeChange,
  onLanguageChange,
  onSettingsChange,
  onOpenPermissions,
}: SettingsProps) {
  const { t } = useTranslation(['settings', 'common']);
  const websiteTrackingSupported = data.platform === 'darwin';
  const appTrackingStatus = activityStatus(data, t);
  const siteTrackingStatus = websiteStatus(data, t);
  const notificationDescriptionId = useId();
  const [settingsPending, setSettingsPending] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [notificationsError, setNotificationsError] = useState('');

  async function changeSetting(patch: Partial<SettingsType>) {
    if (settingsPending) return;
    setSettingsPending(true);
    setSettingsError('');
    try {
      await onSettingsChange(patch);
    } catch {
      setSettingsError(t('settingsUpdateError'));
    } finally {
      setSettingsPending(false);
    }
  }

  async function changeNotifications(notificationsEnabled: boolean) {
    if (settingsPending) return;
    setSettingsPending(true);
    setSettingsError('');
    setNotificationsError('');
    try {
      await onSettingsChange({ notificationsEnabled });
    } catch {
      setNotificationsError(t('notificationsUpdateError'));
    } finally {
      setSettingsPending(false);
    }
  }

  async function openPermissions(kind: PermissionKind) {
    if (settingsPending) return;
    setSettingsPending(true);
    setSettingsError('');
    if (kind === 'notifications') setNotificationsError('');
    try {
      if (!(await onOpenPermissions(kind))) throw new Error('unsupported');
    } catch {
      if (kind === 'notifications') {
        setNotificationsError(t('notificationsOpenSettingsError'));
      } else {
        setSettingsError(t('permissionsOpenError'));
      }
    } finally {
      setSettingsPending(false);
    }
  }

  return (
    <div>
      <div className="mb-7">
        <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--accent-strong)]">
          <Laptop size={13} /> {t('eyebrow')}
        </div>
        <h1 className="page-title">{t('title')}</h1>
        <p className="page-subtitle">{t('subtitle')}</p>
      </div>

      <div className="grid grid-cols-[minmax(0,1.25fr)_minmax(290px,.75fr)] gap-4">
        <div className="space-y-4">
          <section className="card overflow-hidden">
            <div className="border-b border-[var(--border)] px-5 py-4">
              <h2 className="section-title">{t('general')}</h2>
              <p className="section-subtitle">{t('generalSubtitle')}</p>
            </div>
            {settingsError && (
              <p
                role="alert"
                className="border-b border-[var(--border)] px-5 py-3 text-[10px] font-semibold text-rose-500"
              >
                {settingsError}
              </p>
            )}
            <Row
              icon={Power}
              title={t('activityTracking')}
              description={t('activityTrackingDescription')}
            >
              <Toggle
                label={t('activityTracking')}
                checked={data.settings.trackingEnabled}
                disabled={settingsPending}
                onChange={(trackingEnabled) =>
                  void changeSetting({ trackingEnabled })
                }
              />
            </Row>
            <Row
              icon={Globe2}
              title={t('websiteTracking')}
              description={
                websiteTrackingSupported
                  ? t('websiteTrackingMac')
                  : t('websiteTrackingUnsupported')
              }
            >
              <Toggle
                label={t('websiteTracking')}
                checked={
                  websiteTrackingSupported &&
                  Boolean(data.settings.websiteTrackingEnabled)
                }
                disabled={!websiteTrackingSupported || settingsPending}
                onChange={(websiteTrackingEnabled) =>
                  void changeSetting({ websiteTrackingEnabled })
                }
              />
            </Row>
            <Row
              icon={Laptop}
              title={t('launchAtLogin')}
              description={t('launchAtLoginDescription')}
            >
              <Toggle
                label={t('launchAtLogin')}
                checked={data.settings.launchAtLogin}
                disabled={settingsPending}
                onChange={(launchAtLogin) =>
                  void changeSetting({ launchAtLogin })
                }
              />
            </Row>
            <Row
              icon={Bell}
              title={t('notifications')}
              descriptionId={notificationDescriptionId}
              descriptionLive
              description={
                notificationsError || notificationDescription(data, t)
              }
            >
              <div className="flex items-center gap-2">
                {(data.platform === 'darwin' || data.platform === 'win32') &&
                  data.isPackaged && (
                    <Button
                      variant="icon"
                      size="icon"
                      onClick={() => void openPermissions('notifications')}
                      disabled={settingsPending}
                      aria-label={t(
                        data.platform === 'win32'
                          ? 'openWindowsNotificationSettingsLabel'
                          : 'openNotificationSettingsLabel',
                      )}
                      title={t(
                        data.platform === 'win32'
                          ? 'openWindowsNotificationSettings'
                          : 'openNotificationSettings',
                      )}
                    >
                      <ExternalLink size={14} aria-hidden="true" />
                    </Button>
                  )}
                <Toggle
                  label={t('notifications')}
                  describedBy={notificationDescriptionId}
                  checked={data.settings.notificationsEnabled}
                  disabled={settingsPending}
                  onChange={(notificationsEnabled) =>
                    void changeNotifications(notificationsEnabled)
                  }
                />
              </div>
            </Row>
          </section>

          <section className="card overflow-hidden">
            <div className="border-b border-[var(--border)] px-5 py-4">
              <h2 className="section-title">{t('appearance')}</h2>
              <p className="section-subtitle">{t('appearanceSubtitle')}</p>
            </div>
            <Row
              icon={theme === 'dark' ? Moon : Sun}
              title={t('theme')}
              description={t('themeDescription')}
            >
              <div className="flex rounded-xl bg-[var(--surface-muted)] p-1">
                <Button
                  variant="ghost"
                  size="none"
                  onClick={() => onThemeChange('light')}
                  className={`theme-choice ${theme === 'light' ? 'theme-choice-active' : ''}`}
                >
                  <Sun size={13} /> {t('light')}
                </Button>
                <Button
                  variant="ghost"
                  size="none"
                  onClick={() => onThemeChange('dark')}
                  className={`theme-choice ${theme === 'dark' ? 'theme-choice-active' : ''}`}
                >
                  <Moon size={13} /> {t('dark')}
                </Button>
              </div>
            </Row>
            <Row
              icon={Globe2}
              title={t('common:language.label')}
              description={t('common:language.description')}
            >
              <LanguageSelect
                value={data.settings.language}
                onChange={onLanguageChange}
              />
            </Row>
          </section>
        </div>

        <div className="space-y-4">
          <AppUpdateSettings updates={updates} platform={data.platform} />

          <section className="card p-5">
            <div className="mb-4 grid h-11 w-11 place-items-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10">
              <ShieldCheck size={21} />
            </div>
            <h2 className="text-[14px] font-bold text-[var(--text)]">
              {t('privacyTitle')}
            </h2>
            <p className="mt-2 text-[10px] leading-5 text-[var(--muted)]">
              {t('privacyDescription')}
            </p>
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-[var(--surface-muted)] px-3 py-2.5 text-[10px] font-semibold text-[var(--muted-strong)]">
              <HardDrive size={14} /> {t('localStorage')}
            </div>
          </section>

          {websiteTrackingSupported && (
            <section className="card p-5" aria-labelledby="mac-access-title">
              <div className="mb-3 flex items-center gap-2 text-[12px] font-bold text-[var(--text)]">
                <CircleHelp
                  size={17}
                  className="text-[var(--accent-strong)]"
                  aria-hidden="true"
                />
                <h2 id="mac-access-title">{t('macAccess')}</h2>
              </div>
              <p className="text-[10px] leading-5 text-[var(--muted)]">
                {t('macAccessDescription')}
              </p>

              {data.platform === 'darwin' && !data.isPackaged && (
                <div
                  className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-[9px] leading-4 text-[var(--muted-strong)]"
                  role="status"
                >
                  {t('devMode')}
                </div>
              )}

              <div className="mt-4 space-y-2">
                <StatusRow name={t('apps')} status={appTrackingStatus}>
                  <Button
                    variant="secondary"
                    onClick={() => void openPermissions('accessibility')}
                    disabled={settingsPending}
                    aria-label={t('openAccessibilityLabel')}
                    title={t('accessibilityDescription')}
                    className="h-7 gap-1.5 px-2.5 text-[10px]"
                  >
                    {t('openAccessibility')}{' '}
                    <ExternalLink size={12} aria-hidden="true" />
                  </Button>
                </StatusRow>
                <StatusRow name={t('sites')} status={siteTrackingStatus}>
                  <Button
                    variant="secondary"
                    onClick={() => void openPermissions('accessibility')}
                    disabled={settingsPending}
                    aria-label={t('openAccessibilityLabel')}
                    title={t('accessibilityDescription')}
                    className="h-7 gap-1.5 px-2.5 text-[10px]"
                  >
                    {t('accessibility')}{' '}
                    <ExternalLink size={12} aria-hidden="true" />
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => void openPermissions('automation')}
                    disabled={settingsPending}
                    aria-label={t('openAutomationLabel')}
                    title={t('automationDescription')}
                    className="h-7 gap-1.5 px-2.5 text-[10px]"
                  >
                    {t('automation')}{' '}
                    <ExternalLink size={12} aria-hidden="true" />
                  </Button>
                  {!data.settings.websiteTrackingEnabled && (
                    <Button
                      onClick={() =>
                        void changeSetting({ websiteTrackingEnabled: true })
                      }
                      disabled={settingsPending}
                      className="h-7 w-full gap-1.5 px-2.5 text-[10px]"
                    >
                      <Globe2 size={12} aria-hidden="true" /> {t('enableSites')}
                    </Button>
                  )}
                </StatusRow>
              </div>
              <p className="mt-4 text-[9px] leading-4 text-[var(--muted)]">
                {t('permissionsAftercare')}
              </p>
            </section>
          )}

          <section className="card p-5">
            <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--muted)]">
              {t('about')}
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px]">
              <span className="font-semibold text-[var(--muted-strong)]">
                {t('version')}
              </span>
              <span className="font-bold text-[var(--text)]">
                {updates.state?.currentVersion || '—'}
              </span>
            </div>
            <p className="mt-4 border-t border-[var(--border)] pt-4 text-[10px] leading-5 text-[var(--muted)]">
              {t('waylandNotice')}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
