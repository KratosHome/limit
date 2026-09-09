import {
  CalendarRange,
  Moon,
  Pause,
  PictureInPicture2,
  Play,
  Sun,
} from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { PeriodPicker } from '../components/period-picker';
import { LanguageSelect } from '../components/language-select';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { offsetDay, toDayKey } from '../lib/format';
import type { DateRange, PeriodKey, ViewKey } from '../types/navigation';
import type { AppLanguage } from '../i18n';

interface AppHeaderProps {
  customRange: DateRange;
  language: AppLanguage;
  period: PeriodKey;
  theme: 'light' | 'dark';
  trackingEnabled?: boolean;
  trackingPending: boolean;
  view: ViewKey;
  onCustomRangeChange: Dispatch<SetStateAction<DateRange>>;
  onLanguageChange: (language: AppLanguage) => void;
  onPeriodChange: (period: PeriodKey) => void;
  onThemeToggle: () => void;
  onTrackingToggle: () => void;
  onOpenTrackingWidget: () => void;
}

export function AppHeader({
  customRange,
  language,
  period,
  theme,
  trackingEnabled,
  trackingPending,
  view,
  onCustomRangeChange,
  onLanguageChange,
  onPeriodChange,
  onThemeToggle,
  onTrackingToggle,
  onOpenTrackingWidget,
}: AppHeaderProps) {
  const { t } = useTranslation('components');
  const hasPeriodPicker = view === 'overview' || view === 'activity';

  return (
    <header className="app-drag flex h-[68px] shrink-0 items-center justify-end gap-3 border-b border-[var(--border)] bg-[var(--background)] px-7">
      {hasPeriodPicker && (
        <PeriodPicker value={period} onChange={onPeriodChange} />
      )}
      {period === 'custom' && hasPeriodPicker && (
        <div className="no-drag flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 shadow-[var(--shadow-xs)]">
          <CalendarRange size={14} className="text-[var(--muted)]" />
          <Input
            variant="date"
            type="date"
            aria-label={t('header.periodStart')}
            value={customRange.from}
            min={toDayKey(offsetDay(new Date(), -365))}
            max={customRange.to}
            onChange={(event) =>
              onCustomRangeChange((value) => ({
                ...value,
                from: event.target.value,
              }))
            }
          />
          <span className="text-[var(--muted)]">-</span>
          <Input
            variant="date"
            type="date"
            aria-label={t('header.periodEnd')}
            value={customRange.to}
            min={customRange.from}
            max={toDayKey(new Date())}
            onChange={(event) =>
              onCustomRangeChange((value) => ({
                ...value,
                to: event.target.value,
              }))
            }
          />
        </div>
      )}
      <LanguageSelect compact value={language} onChange={onLanguageChange} />
      <div className="no-drag ml-1 flex items-center gap-2">
        <Button
          variant="topIcon"
          size="none"
          className="h-9 w-9"
          onClick={onOpenTrackingWidget}
          aria-label={t('header.openWidget')}
          title={t('header.openWidget')}
          disabled={trackingEnabled === undefined}
        >
          <PictureInPicture2 size={16} aria-hidden="true" />
        </Button>
        <Button
          variant="topIcon"
          size="none"
          onClick={onThemeToggle}
          className="h-9 w-9"
          aria-label={t('header.toggleTheme')}
        >
          {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
        </Button>
        <Button
          variant="topIcon"
          size="none"
          onClick={onTrackingToggle}
          disabled={trackingPending || trackingEnabled === undefined}
          className={`h-9 w-9 ${trackingEnabled ? 'text-emerald-600' : 'text-amber-600'}`}
          aria-label={
            trackingEnabled
              ? t('header.pauseTracking')
              : t('header.resumeTracking')
          }
        >
          {trackingEnabled ? <Pause size={15} /> : <Play size={15} />}
        </Button>
      </div>
    </header>
  );
}
