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
import type { ReactNode } from 'react';
import type { DashboardData } from '../types/usage';
import type {
  PermissionKind,
  Settings as SettingsType,
} from '../types/settings';
import { Button } from '../components/ui/button';

interface SettingsProps {
  data: DashboardData;
  theme: 'light' | 'dark';
  onThemeChange: (theme: 'light' | 'dark') => void;
  onSettingsChange: (patch: Partial<SettingsType>) => void;
  onOpenPermissions: (kind?: PermissionKind) => void;
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
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <Button
      variant="ghost"
      size="none"
      role="switch"
      aria-checked={checked}
      aria-label={label}
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
  children,
}: {
  icon: typeof Bell;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 border-b border-[var(--border)] px-5 py-4 last:border-b-0">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--surface-muted)] text-[var(--muted-strong)]">
        <Icon size={17} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-bold text-[var(--text)]">{title}</div>
        <p className="mt-0.5 text-[10px] leading-4 text-[var(--muted)]">
          {description}
        </p>
      </div>
      {children}
    </div>
  );
}

function activityStatus(data: DashboardData): TrackingStatus {
  if (!data.settings.trackingEnabled)
    return {
      label: 'Вимкнено',
      detail: 'Увімкніть загальне відстеження активності.',
      tone: 'muted',
    };
  if (!data.tracker.running)
    return {
      label: 'Не запущено',
      detail: 'Перезапустіть Limit і перевірте системні дозволи.',
      tone: 'warning',
    };
  if (
    data.tracker.permissionState === 'denied' ||
    data.tracker.permissionState === 'error'
  ) {
    return {
      label: 'Потребує уваги',
      detail: 'Перевірте Accessibility у налаштуваннях macOS.',
      tone: 'warning',
    };
  }
  if (data.tracker.permissionState === 'granted')
    return {
      label: 'Працює',
      detail: 'Активний застосунок визначається.',
      tone: 'ok',
    };
  return {
    label: 'Перевіряється',
    detail: 'Limit очікує наступний активний застосунок.',
    tone: 'muted',
  };
}

function websiteStatus(data: DashboardData): TrackingStatus {
  if (!data.settings.websiteTrackingEnabled) {
    return {
      label: 'Вимкнено',
      detail: 'Увімкніть функцію, щоб почати збирати час за доменами.',
      tone: 'muted',
    };
  }
  if (
    data.tracker.websitePermissionState === 'denied' ||
    data.tracker.websitePermissionState === 'error'
  ) {
    return {
      label: 'Потребує уваги',
      detail: 'Перевірте Accessibility та Automation.',
      tone: 'warning',
    };
  }
  if (data.tracker.websitePermissionState === 'unavailable') {
    return {
      label: 'Домен не отримано',
      detail: 'Відкрийте Arc і перевірте Accessibility та Automation.',
      tone: 'warning',
    };
  }
  if (data.tracker.currentApp?.site?.domain) {
    return {
      label: 'Працює',
      detail: `Отримано домен ${data.tracker.currentApp.site.domain}.`,
      tone: 'ok',
    };
  }
  if (data.tracker.websitePermissionState === 'granted') {
    return {
      label: 'Доступ підтверджено',
      detail: 'Домени збиратимуться, коли браузер буде активним.',
      tone: 'ok',
    };
  }
  return {
    label: 'Увімкнено · очікує браузер',
    detail: 'Відкрийте звичайну вкладку Arc, щоб перевірити доступ.',
    tone: 'muted',
  };
}

function StatusRow({ name, status }: { name: string; status: TrackingStatus }) {
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
        <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-bold text-[var(--text)]">
          <span>{name}</span>
          <span>{status.label}</span>
        </div>
        <p className="mt-1 text-[9px] leading-4 text-[var(--muted)]">
          {status.detail}
        </p>
      </div>
    </div>
  );
}

export function Settings({
  data,
  theme,
  onThemeChange,
  onSettingsChange,
  onOpenPermissions,
}: SettingsProps) {
  const websiteTrackingSupported = data.platform === 'darwin';
  const appTrackingStatus = activityStatus(data);
  const siteTrackingStatus = websiteStatus(data);

  return (
    <div>
      <div className="mb-7">
        <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--accent-strong)]">
          <Laptop size={13} /> Ваш Limit
        </div>
        <h1 className="page-title">Налаштування</h1>
        <p className="page-subtitle">
          Керуйте трекінгом, запуском у фоні та виглядом застосунку.
        </p>
      </div>

      <div className="grid grid-cols-[minmax(0,1.25fr)_minmax(290px,.75fr)] gap-4">
        <div className="space-y-4">
          <section className="card overflow-hidden">
            <div className="border-b border-[var(--border)] px-5 py-4">
              <h2 className="section-title">Загальні</h2>
              <p className="section-subtitle">Поведінка фонового застосунку</p>
            </div>
            <Row
              icon={Power}
              title="Відстеження активності"
              description="Рахувати лише час активного застосунку, не фонові процеси."
            >
              <Toggle
                label="Відстеження активності"
                checked={data.settings.trackingEnabled}
                onChange={(trackingEnabled) =>
                  onSettingsChange({ trackingEnabled })
                }
              />
            </Row>
            <Row
              icon={Globe2}
              title="Відстеження сайтів"
              description={
                websiteTrackingSupported
                  ? 'Опційно рахувати час за доменами в браузері. Зберігаються лише домени — локально на цьому Mac.'
                  : 'Функція доступна лише на macOS. Зберігаються тільки домени, без повних адрес і вмісту сторінок.'
              }
            >
              <Toggle
                label="Відстеження сайтів"
                checked={
                  websiteTrackingSupported &&
                  Boolean(data.settings.websiteTrackingEnabled)
                }
                disabled={!websiteTrackingSupported}
                onChange={(websiteTrackingEnabled) =>
                  onSettingsChange({ websiteTrackingEnabled })
                }
              />
            </Row>
            <Row
              icon={Laptop}
              title="Запуск разом із системою"
              description="Limit стартуватиме у фоні після входу в обліковий запис."
            >
              <Toggle
                label="Запуск разом із системою"
                checked={data.settings.launchAtLogin}
                onChange={(launchAtLogin) =>
                  onSettingsChange({ launchAtLogin })
                }
              />
            </Row>
            <Row
              icon={Bell}
              title="Поріг бездіяльності"
              description="Не рахувати час, якщо ви не взаємодієте з компʼютером."
            >
              <select
                value={data.settings.idleThresholdSeconds}
                onChange={(event) =>
                  onSettingsChange({
                    idleThresholdSeconds: Number(event.target.value),
                  })
                }
                className="select-compact"
              >
                <option value={60}>1 хв</option>
                <option value={180}>3 хв</option>
                <option value={300}>5 хв</option>
                <option value={600}>10 хв</option>
              </select>
            </Row>
          </section>

          <section className="card overflow-hidden">
            <div className="border-b border-[var(--border)] px-5 py-4">
              <h2 className="section-title">Вигляд</h2>
              <p className="section-subtitle">Оформлення інтерфейсу</p>
            </div>
            <Row
              icon={theme === 'dark' ? Moon : Sun}
              title="Тема"
              description="Застосовується лише до інтерфейсу Limit."
            >
              <div className="flex rounded-xl bg-[var(--surface-muted)] p-1">
                <Button
                  variant="ghost"
                  size="none"
                  onClick={() => onThemeChange('light')}
                  className={`theme-choice ${theme === 'light' ? 'theme-choice-active' : ''}`}
                >
                  <Sun size={13} /> Світла
                </Button>
                <Button
                  variant="ghost"
                  size="none"
                  onClick={() => onThemeChange('dark')}
                  className={`theme-choice ${theme === 'dark' ? 'theme-choice-active' : ''}`}
                >
                  <Moon size={13} /> Темна
                </Button>
              </div>
            </Row>
          </section>
        </div>

        <div className="space-y-4">
          <section className="card p-5">
            <div className="mb-4 grid h-11 w-11 place-items-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10">
              <ShieldCheck size={21} />
            </div>
            <h2 className="text-[14px] font-bold text-[var(--text)]">
              Приватність за замовчуванням
            </h2>
            <p className="mt-2 text-[10px] leading-5 text-[var(--muted)]">
              Історія зберігається локально на цьому компʼютері. Відстеження
              сайтів вимкнене за замовчуванням; якщо його ввімкнути, Limit
              зберігає лише домени — без повних URL, вмісту сторінок або історії
              браузера.
            </p>
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-[var(--surface-muted)] px-3 py-2.5 text-[10px] font-semibold text-[var(--muted-strong)]">
              <HardDrive size={14} /> Локальне сховище
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
                <h2 id="mac-access-title">Доступи macOS</h2>
              </div>
              <p className="text-[10px] leading-5 text-[var(--muted)]">
                Limit не може напряму перевірити всі системні перемикачі. Кнопки
                нижче завжди доступні для ручної перевірки.
              </p>

              {data.platform === 'darwin' && !data.isPackaged && (
                <div
                  className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-[9px] leading-4 text-[var(--muted-strong)]"
                  role="status"
                >
                  Dev-режим: macOS може показувати тут IntelliJ IDEA, Terminal
                  або Electron — залежно від того, звідки запущено застосунок.
                  Щоб у списку був саме Limit, запустіть зібрану Limit.app
                  напряму.
                </div>
              )}

              <div
                className="mt-4 space-y-2"
                aria-live="polite"
                aria-atomic="true"
              >
                <StatusRow name="Застосунки" status={appTrackingStatus} />
                <StatusRow name="Сайти" status={siteTrackingStatus} />
              </div>

              {!data.settings.websiteTrackingEnabled && (
                <Button
                  onClick={() =>
                    onSettingsChange({ websiteTrackingEnabled: true })
                  }
                  className="mt-4 w-full"
                >
                  <Globe2 size={14} aria-hidden="true" /> Увімкнути відстеження
                  сайтів
                </Button>
              )}

              <div className="mt-4 space-y-3 border-t border-[var(--border)] pt-4">
                <div>
                  <div className="text-[10px] font-bold text-[var(--text)]">
                    Accessibility
                  </div>
                  <p className="mt-1 text-[9px] leading-4 text-[var(--muted)]">
                    Дозволяє визначати активний застосунок і вкладку
                    підтримуваного браузера. Системний запит зʼявляється лише
                    після вашої дії, не у фоновому циклі.
                  </p>
                  <Button
                    variant="secondary"
                    onClick={() => onOpenPermissions('accessibility')}
                    aria-label="Відкрити налаштування macOS Accessibility"
                    className="mt-2 w-full"
                  >
                    Відкрити Accessibility{' '}
                    <ExternalLink size={12} aria-hidden="true" />
                  </Button>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-[var(--text)]">
                    Automation
                  </div>
                  <p className="mt-1 text-[9px] leading-4 text-[var(--muted)]">
                    Дозволяє запитувати в Arc лише домен активної вкладки. Limit
                    зʼявиться у списку після першої фактичної спроби прочитати
                    вкладку Arc.
                  </p>
                  <Button
                    variant="secondary"
                    onClick={() => onOpenPermissions('automation')}
                    aria-label="Відкрити налаштування macOS Automation"
                    className="mt-2 w-full"
                  >
                    Відкрити Automation{' '}
                    <ExternalLink size={12} aria-hidden="true" />
                  </Button>
                </div>
              </div>
              <p className="mt-4 text-[9px] leading-4 text-[var(--muted)]">
                Після зміни дозволів поверніться в Limit. Якщо macOS не застосує
                їх одразу, перезапустіть застосунок.
              </p>
            </section>
          )}

          <section className="card p-5">
            <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--muted)]">
              Про застосунок
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px]">
              <span className="font-semibold text-[var(--muted-strong)]">
                Версія
              </span>
              <span className="font-bold text-[var(--text)]">0.1.0 MVP</span>
            </div>
            <p className="mt-4 border-t border-[var(--border)] pt-4 text-[10px] leading-5 text-[var(--muted)]">
              На Linux/Wayland глобальний трекінг активного вікна недоступний
              через обмеження системи.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
