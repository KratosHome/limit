import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { enUS, uk } from 'react-day-picker/locale';
import { toDayKey } from '../../lib/format';
import { Button } from '../ui/button';
import { Calendar } from '../ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';

export function TaskDatePicker({
  value,
  onChange,
  label,
  disabled = false,
  required = false,
  min = '1900-01-01',
  max = '2100-12-31',
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  label: string;
  disabled?: boolean;
  required?: boolean;
  min?: string;
  max?: string;
}) {
  const { t, i18n } = useTranslation('tasks');
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(
    () => new Date(`${value ?? toDayKey(new Date())}T12:00:00`),
  );
  const start = new Date(`${min}T12:00:00`);
  const end = new Date(`${max}T12:00:00`);
  const selected = value ? new Date(`${value}T12:00:00`) : undefined;
  const locale = i18n.language.startsWith('uk') ? uk : enUS;
  const format = new Intl.DateTimeFormat(i18n.language, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const changeMonth = (next: Date) =>
    setMonth(next < start ? start : next > end ? end : next);
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) changeMonth(selected ?? new Date());
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="secondary"
          disabled={disabled}
          className="w-full justify-start gap-2"
          aria-label={label}
        >
          <CalendarDays size={14} aria-hidden="true" />
          {selected ? format.format(selected) : t('editor.selectDate')}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 max-w-[calc(100vw-24px)] p-3"
      >
        <div className="mb-2 flex gap-2">
          <Select
            value={String(month.getMonth())}
            onValueChange={(value) =>
              changeMonth(new Date(month.getFullYear(), Number(value), 1))
            }
          >
            <SelectTrigger size="compact" aria-label={t('editor.month')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {Array.from({ length: 12 }, (_, index) => (
                  <SelectItem
                    key={index}
                    value={String(index)}
                    disabled={
                      new Date(month.getFullYear(), index + 1, 0, 12) < start ||
                      new Date(month.getFullYear(), index, 1, 12) > end
                    }
                  >
                    {new Intl.DateTimeFormat(i18n.language, {
                      month: 'long',
                    }).format(new Date(2026, index, 1))}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select
            value={String(month.getFullYear())}
            onValueChange={(value) =>
              changeMonth(new Date(Number(value), month.getMonth(), 1))
            }
          >
            <SelectTrigger
              size="compact"
              className="w-24! shrink-0"
              aria-label={t('editor.year')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {Array.from(
                  { length: end.getFullYear() - start.getFullYear() + 1 },
                  (_, index) => start.getFullYear() + index,
                ).map((year) => (
                  <SelectItem key={year} value={String(year)}>
                    {year}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <Calendar
          mode="single"
          locale={locale}
          month={month}
          onMonthChange={changeMonth}
          selected={selected}
          onSelect={(date) => {
            if (date) {
              onChange(toDayKey(date));
              setOpen(false);
            }
          }}
          startMonth={start}
          endMonth={end}
          disabled={{ before: start, after: end }}
          className="w-full p-0"
        />
        {!required && value && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
          >
            {t('editor.clearDate')}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
