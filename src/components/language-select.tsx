import { Globe2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AppLanguage } from '../i18n';
import { cn } from '../lib/utils';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from './ui/select';

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
    <div className={cn('no-drag flex shrink-0 items-center', className)}>
      <Select
        value={value}
        onValueChange={(language) => onChange(language as AppLanguage)}
      >
        <SelectTrigger
          size="compact"
          className="w-auto min-w-[120px]"
          aria-label={t('language.label')}
        >
          {compact && <Globe2 aria-hidden="true" />}
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel className="sr-only">{t('language.label')}</SelectLabel>
            <SelectItem value="uk">{t('language.uk')}</SelectItem>
            <SelectItem value="en">{t('language.en')}</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}
