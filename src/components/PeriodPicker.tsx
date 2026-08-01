import type { PeriodKey } from '../types';
import { Button } from './ui/button';

const periods: Array<{ key: PeriodKey; label: string }> = [
  { key: 'today', label: 'Сьогодні' },
  { key: 'yesterday', label: 'Вчора' },
  { key: '7days', label: '7 днів' },
  { key: '30days', label: '30 днів' },
  { key: 'custom', label: 'Власний' },
];

export function PeriodPicker({ value, onChange }: { value: PeriodKey; onChange: (period: PeriodKey) => void }) {
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
          {period.label}
        </Button>
      ))}
    </div>
  );
}
