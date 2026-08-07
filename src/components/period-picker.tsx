import type { PeriodKey } from '../types/navigation';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/button';

type PeriodLabelKey =
  | 'periods.today'
  | 'periods.yesterday'
  | 'periods.sevenDays'
  | 'periods.thirtyDays'
  | 'periods.custom';

const periods: Array<{ key: PeriodKey; labelKey: PeriodLabelKey }> = [
  { key: 'today', labelKey: 'periods.today' },
  { key: 'yesterday', labelKey: 'periods.yesterday' },
  { key: '7days', labelKey: 'periods.sevenDays' },
  { key: '30days', labelKey: 'periods.thirtyDays' },
  { key: 'custom', labelKey: 'periods.custom' },
];

export function PeriodPicker({
  value,
  onChange,
}: {
  value: PeriodKey;
  onChange: (period: PeriodKey) => void;
}) {
  const { t } = useTranslation('components');
  return (
    <div className="flex items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 shadow-[var(--shadow-xs)]">
      {periods.map((period) => (
        <Button
          variant="segment"
          size="none"
          key={period.key}
          onClick={() => onChange(period.key)}
          active={value === period.key}
        >
          {t(period.labelKey)}
        </Button>
      ))}
    </div>
  );
}
