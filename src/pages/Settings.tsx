import { Bell, CircleHelp, ExternalLink, HardDrive, Laptop, Moon, Power, ShieldCheck, Sun } from 'lucide-react';
import type { DashboardData, Settings as SettingsType } from '../types';
import { Button } from '../components/ui/button';

interface SettingsProps {
  data: DashboardData;
  theme: 'light' | 'dark';
  onThemeChange: (theme: 'light' | 'dark') => void;
  onSettingsChange: (patch: Partial<SettingsType>) => void;
  onOpenPermissions: () => void;
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <Button variant="ghost" size="none" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={`relative h-6 w-11 rounded-full p-0 transition hover:bg-[var(--toggle-off)] ${checked ? 'bg-[var(--accent)] hover:bg-[var(--accent)]' : 'bg-[var(--toggle-off)]'}`}>
      <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition ${checked ? 'left-6' : 'left-1'}`} />
    </Button>
  );
}

function Row({ icon: Icon, title, description, children }: { icon: typeof Bell; title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 border-b border-[var(--border)] px-5 py-4 last:border-b-0">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--surface-muted)] text-[var(--muted-strong)]"><Icon size={17} /></div>
      <div className="min-w-0 flex-1"><div className="text-[12px] font-bold text-[var(--text)]">{title}</div><p className="mt-0.5 text-[10px] leading-4 text-[var(--muted)]">{description}</p></div>
      {children}
    </div>
  );
}

export function Settings({ data, theme, onThemeChange, onSettingsChange, onOpenPermissions }: SettingsProps) {
  return (
    <div>
      <div className="mb-7">
        <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--accent-strong)]"><Laptop size={13} /> Ваш Limit</div>
        <h1 className="page-title">Налаштування</h1>
        <p className="page-subtitle">Керуйте трекінгом, запуском у фоні та виглядом застосунку.</p>
      </div>

      <div className="grid grid-cols-[minmax(0,1.25fr)_minmax(290px,.75fr)] gap-4">
        <div className="space-y-4">
          <section className="card overflow-hidden">
            <div className="border-b border-[var(--border)] px-5 py-4"><h2 className="section-title">Загальні</h2><p className="section-subtitle">Поведінка фонового застосунку</p></div>
            <Row icon={Power} title="Відстеження активності" description="Рахувати лише час активного застосунку, не фонові процеси."><Toggle label="Відстеження активності" checked={data.settings.trackingEnabled} onChange={(trackingEnabled) => onSettingsChange({ trackingEnabled })} /></Row>
            <Row icon={Laptop} title="Запуск разом із системою" description="Limit стартуватиме у фоні після входу в обліковий запис."><Toggle label="Запуск разом із системою" checked={data.settings.launchAtLogin} onChange={(launchAtLogin) => onSettingsChange({ launchAtLogin })} /></Row>
            <Row icon={Bell} title="Поріг бездіяльності" description="Не рахувати час, якщо ви не взаємодієте з компʼютером.">
              <select value={data.settings.idleThresholdSeconds} onChange={(event) => onSettingsChange({ idleThresholdSeconds: Number(event.target.value) })} className="select-compact">
                <option value={60}>1 хв</option><option value={180}>3 хв</option><option value={300}>5 хв</option><option value={600}>10 хв</option>
              </select>
            </Row>
          </section>

          <section className="card overflow-hidden">
            <div className="border-b border-[var(--border)] px-5 py-4"><h2 className="section-title">Вигляд</h2><p className="section-subtitle">Оформлення інтерфейсу</p></div>
            <Row icon={theme === 'dark' ? Moon : Sun} title="Тема" description="Застосовується лише до інтерфейсу Limit.">
              <div className="flex rounded-xl bg-[var(--surface-muted)] p-1">
                <Button variant="ghost" size="none" onClick={() => onThemeChange('light')} className={`theme-choice ${theme === 'light' ? 'theme-choice-active' : ''}`}><Sun size={13} /> Світла</Button>
                <Button variant="ghost" size="none" onClick={() => onThemeChange('dark')} className={`theme-choice ${theme === 'dark' ? 'theme-choice-active' : ''}`}><Moon size={13} /> Темна</Button>
              </div>
            </Row>
          </section>
        </div>

        <div className="space-y-4">
          <section className="card p-5">
            <div className="mb-4 grid h-11 w-11 place-items-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10"><ShieldCheck size={21} /></div>
            <h2 className="text-[14px] font-bold text-[var(--text)]">Приватність за замовчуванням</h2>
            <p className="mt-2 text-[10px] leading-5 text-[var(--muted)]">Історія зберігається локально на цьому компʼютері. Limit не читає вміст вікон, назви документів, повідомлення або адреси сайтів.</p>
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-[var(--surface-muted)] px-3 py-2.5 text-[10px] font-semibold text-[var(--muted-strong)]"><HardDrive size={14} /> Локальне сховище</div>
          </section>

          {data.tracker.permissionState !== 'granted' && data.platform === 'darwin' && (
            <section className="card border-amber-200 bg-amber-50/70 p-5 dark:border-amber-500/20 dark:bg-amber-500/5">
              <div className="mb-3 flex items-center gap-2 text-[12px] font-bold text-amber-700 dark:text-amber-300"><CircleHelp size={17} /> Потрібен доступ</div>
              <p className="text-[10px] leading-5 text-amber-800/70 dark:text-amber-200/60">macOS обмежила визначення активного застосунку. Перевірте дозволи Limit у системних налаштуваннях.</p>
              <Button variant="link" size="none" onClick={onOpenPermissions} className="mt-4 text-amber-700 dark:text-amber-300">Відкрити налаштування <ExternalLink size={12} /></Button>
            </section>
          )}

          <section className="card p-5">
            <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--muted)]">Про застосунок</div>
            <div className="mt-3 flex items-center justify-between text-[11px]"><span className="font-semibold text-[var(--muted-strong)]">Версія</span><span className="font-bold text-[var(--text)]">0.1.0 MVP</span></div>
            <p className="mt-4 border-t border-[var(--border)] pt-4 text-[10px] leading-5 text-[var(--muted)]">На Linux/Wayland глобальний трекінг активного вікна недоступний через обмеження системи.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
