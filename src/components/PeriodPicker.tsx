import type { PeriodKey } from '../types';

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
        <button
          type="button"
          key={period.key}
          onClick={() => onChange(period.key)}
          className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold transition ${value === period.key ? 'bg-[var(--text)] text-[var(--surface)] shadow-sm' : 'text-[var(--muted)] hover:text-[var(--text)]'}`}
        >
          {period.label}
        </button>
      ))}
    </div>
  );
}
