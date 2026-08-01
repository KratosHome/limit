import { CalendarRange, Moon, Pause, Play, Sun } from 'lucide-react';
import { PeriodPicker } from '../components/PeriodPicker';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { offsetDay, toDayKey } from '../lib/format';
import type { DateRange, PeriodKey, ViewKey } from '../types';

interface AppHeaderProps {
  customRange: DateRange;
  period: PeriodKey;
  theme: 'light' | 'dark';
  trackingEnabled?: boolean;
  view: ViewKey;
  onCustomRangeChange: React.Dispatch<React.SetStateAction<DateRange>>;
  onPeriodChange: (period: PeriodKey) => void;
  onThemeToggle: () => void;
  onTrackingToggle: () => void;
}

export function AppHeader({ customRange, period, theme, trackingEnabled, view, onCustomRangeChange, onPeriodChange, onThemeToggle, onTrackingToggle }: AppHeaderProps) {
  const hasPeriodPicker = view === 'overview' || view === 'activity';

  return (
    <header className="app-drag flex h-[68px] shrink-0 items-center justify-end gap-3 border-b border-[var(--border)] bg-[var(--background)] px-7">
      {hasPeriodPicker && <PeriodPicker value={period} onChange={onPeriodChange} />}
      {period === 'custom' && hasPeriodPicker && (
        <div className="no-drag flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 shadow-[var(--shadow-xs)]">
          <CalendarRange size={14} className="text-[var(--muted)]" />
          <Input variant="date" type="date" aria-label="Початок періоду" value={customRange.from} min={toDayKey(offsetDay(new Date(), -365))} max={customRange.to} onChange={(event) => onCustomRangeChange((value) => ({ ...value, from: event.target.value }))} />
          <span className="text-[var(--muted)]">-</span>
          <Input variant="date" type="date" aria-label="Кінець періоду" value={customRange.to} min={customRange.from} max={toDayKey(new Date())} onChange={(event) => onCustomRangeChange((value) => ({ ...value, to: event.target.value }))} />
        </div>
      )}
      <div className="no-drag ml-1 flex items-center gap-2">
        <Button variant="topIcon" size="none" onClick={onThemeToggle} className="h-9 w-9" aria-label="Змінити тему">{theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}</Button>
        <Button variant="topIcon" size="none" onClick={onTrackingToggle} className={`h-9 w-9 ${trackingEnabled ? 'text-emerald-600' : 'text-amber-600'}`} aria-label={trackingEnabled ? 'Призупинити трекінг' : 'Відновити трекінг'}>{trackingEnabled ? <Pause size={15} /> : <Play size={15} />}</Button>
      </div>
    </header>
  );
}
