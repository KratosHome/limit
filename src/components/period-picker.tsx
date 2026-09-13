import { useId, useState } from 'react';
import { CalendarRange, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { DateRange as CalendarRangeValue } from 'react-day-picker';
import { enUS, uk } from 'react-day-picker/locale';
import { normalizeLanguage } from '../i18n';
import { offsetDay, toDayKey } from '../lib/format';
import type { DateRange, PeriodKey } from '../types/navigation';
import { Button } from './ui/button';
import { Calendar } from './ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from './ui/popover';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';

const periods = [
  { key: 'today', labelKey: 'periods.today' },
  { key: 'yesterday', labelKey: 'periods.yesterday' },
  { key: '7days', labelKey: 'periods.sevenDays' },
  { key: '30days', labelKey: 'periods.thirtyDays' },
] as const;

function localDate(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function PeriodPicker({
  value,
  customRange,
  onChange,
  onCustomRangeChange,
}: {
  value: PeriodKey;
  customRange: DateRange;
  onChange: (period: PeriodKey) => void;
  onCustomRangeChange: (range: DateRange) => void;
}) {
  const { t, i18n } = useTranslation(['components', 'common']);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<CalendarRangeValue>();
  const [selectingEnd, setSelectingEnd] = useState(false);
  const titleId = useId();
  const descriptionId = useId();
  const language = normalizeLanguage(i18n.resolvedLanguage);
  const today = localDate(toDayKey(new Date()));
  const earliest = offsetDay(today, -365);
  const formatter = new Intl.DateTimeFormat(
    language === 'uk' ? 'uk-UA' : 'en-US',
    {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    },
  );
  const ready =
    draft?.from && draft.to && draft.from >= earliest && draft.to <= today;

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setSelectingEnd(false);
      setDraft({
        from: localDate(customRange.from),
        to: localDate(customRange.to),
      });
    }
    setOpen(nextOpen);
  }

  function applyRange() {
    const currentDay = localDate(toDayKey(new Date()));
    if (
      !draft?.from ||
      !draft.to ||
      draft.from > draft.to ||
      draft.from < offsetDay(currentDay, -365) ||
      draft.to > currentDay
    )
      return;
    onCustomRangeChange({ from: toDayKey(draft.from), to: toDayKey(draft.to) });
    onChange('custom');
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <ToggleGroup
        type="single"
        variant="segment"
        spacing={1}
        value={value}
        onValueChange={(next) => {
          if (next && next !== 'custom') onChange(next as PeriodKey);
        }}
        aria-label={t('periods.label')}
        className="no-drag shrink-0 rounded-xl border border-border bg-popover p-1"
      >
        {periods.map((period) => (
          <ToggleGroupItem value={period.key} key={period.key}>
            {t(period.labelKey)}
          </ToggleGroupItem>
        ))}
        <PopoverTrigger asChild>
          <ToggleGroupItem
            value="custom"
            data-state={value === 'custom' ? 'on' : 'off'}
            title={
              value === 'custom'
                ? `${formatter.format(localDate(customRange.from))} – ${formatter.format(localDate(customRange.to))}`
                : undefined
            }
          >
            {t('periods.custom')}
            <ChevronDown data-icon="inline-end" aria-hidden="true" />
          </ToggleGroupItem>
        </PopoverTrigger>
      </ToggleGroup>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={10}
        collisionPadding={12}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-80 max-w-[calc(100vw-24px)] p-0"
      >
        <PopoverHeader className="px-4 pt-4">
          <PopoverTitle id={titleId}>{t('periods.chooseRange')}</PopoverTitle>
          <PopoverDescription id={descriptionId}>
            {t('periods.rangeHint')}
          </PopoverDescription>
        </PopoverHeader>
        <Calendar
          className="w-full [--cell-size:2.25rem]"
          mode="range"
          locale={language === 'uk' ? uk : enUS}
          defaultMonth={draft?.to ?? today}
          selected={draft}
          onSelect={(_, day) => {
            if (!selectingEnd || !draft?.from) {
              setDraft({ from: day, to: undefined });
              setSelectingEnd(true);
            } else {
              setDraft(
                day < draft.from
                  ? { from: day, to: draft.from }
                  : { from: draft.from, to: day },
              );
              setSelectingEnd(false);
            }
          }}
          startMonth={earliest}
          endMonth={today}
          disabled={{ before: earliest, after: today }}
          numberOfMonths={1}
          autoFocus
        />
        <div className="flex flex-col gap-3 border-t border-border p-4 text-[12px] text-foreground">
          <div className="flex items-center gap-2" role="status">
            <CalendarRange
              size={14}
              className="shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span>
              <span className="sr-only">{t('header.periodStart')}: </span>
              {draft?.from ? formatter.format(draft.from) : '…'}
              {' – '}
              <span className="sr-only">{t('header.periodEnd')}: </span>
              {draft?.to ? formatter.format(draft.to) : '…'}
            </span>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setOpen(false)}
            >
              {t('common:actions.cancel')}
            </Button>
            <Button size="sm" onClick={applyRange} disabled={!ready}>
              {t('periods.apply')}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
