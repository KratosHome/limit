import { Globe2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AppLanguage } from '../i18n';
import { cn } from '../lib/utils';

interface LanguageSelectProps {
  className?: string;
  compact?: boolean;
  value: AppLanguage;
  onChange: (language: AppLanguage) => void;
}

export function LanguageSelect({
  className,
  compact = false,
  value,
  onChange,
}: LanguageSelectProps) {
  const { t } = useTranslation('common');

  return (
    <label
      className={cn(
        'no-drag flex items-center gap-2',
        compact &&
          'h-9 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 shadow-[var(--shadow-xs)]',
        className,
      )}
    >
      {compact && (
        <Globe2 size={14} className="text-[var(--muted)]" aria-hidden="true" />
      )}
      <span className="sr-only">{t('language.label')}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as AppLanguage)}
        className={cn(
          'cursor-pointer bg-transparent font-semibold outline-none',
          compact ? 'text-[11px] text-[var(--muted-strong)]' : 'select-compact',
        )}
        aria-label={t('language.label')}
      >
        <option value="uk">{t('language.uk')}</option>
        <option value="en">{t('language.en')}</option>
      </select>
    </label>
  );
}
