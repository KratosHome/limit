import { useTranslation } from 'react-i18next';
import { Badge } from '../components/ui/badge';
import { SupportSection } from '../components/support-section';

export function Health() {
  const { t } = useTranslation('health');
  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="page-title">{t('title')}</h1>
        <p className="page-subtitle">{t('subtitle')}</p>
      </header>
      <section className="card flex flex-col-reverse items-start gap-6 overflow-hidden p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div className="flex max-w-lg flex-col items-start gap-4">
          <Badge variant="outline">{t('development')}</Badge>
          <h2 className="max-w-sm text-[25px] font-semibold leading-tight tracking-tight text-foreground">
            {t('headline')}
          </h2>
          <p className="text-[12px] leading-6 text-muted-foreground">
            {t('description')}
          </p>
          <p className="text-[11px] font-medium text-foreground">
            {t('invitation')}
          </p>
        </div>
        <div
          className="relative grid size-36 shrink-0 place-items-center self-center text-primary sm:size-44"
          aria-hidden="true"
        >
          <div className="absolute inset-0 rounded-full border border-border" />
          <div className="absolute inset-4 rounded-full border border-dashed border-primary/30" />
          <svg
            viewBox="0 0 120 100"
            className="relative w-28 fill-none stroke-current sm:w-32"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path
              d="M60 83 25 50C8 33 18 13 35 13c12 0 19 8 25 16 6-8 13-16 25-16 17 0 27 20 10 37Z"
              className="opacity-35"
            />
            <path d="M12 50h26l9-17 14 37 11-25 6 5h30" />
          </svg>
        </div>
      </section>
      <SupportSection source="health" />
    </div>
  );
}
