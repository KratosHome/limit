import { Pause, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/button';

export function TrackingPauseBanner({
  pending,
  onResume,
  onOpenWidget,
}: {
  pending: boolean;
  onResume: () => void;
  onOpenWidget: () => void;
}) {
  const { t } = useTranslation('components');
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4">
      <Pause size={18} className="text-amber-600" aria-hidden="true" />
      <div className="min-w-0 flex-1" role="status">
        <p className="text-[12px] font-bold text-[var(--text)]">
          {t('tracking.paused')}
        </p>
        <p className="mt-1 text-[10px] text-[var(--muted)]">
          {t('tracking.pausedDetail')}
        </p>
      </div>
      <Button variant="secondary" size="sm" onClick={onOpenWidget}>
        {t('tracking.openWidget')}
      </Button>
      <Button size="sm" disabled={pending} onClick={onResume}>
        <Play size={13} aria-hidden="true" />
        {t('tracking.resume')}
      </Button>
    </div>
  );
}
