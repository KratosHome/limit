import { Bell } from 'lucide-react';
import { Button } from '../components/ui/button';
import type { LimitNotification } from '../types/limits';

interface LimitToastProps {
  toast: LimitNotification;
  onOpenLimits: () => void;
}

export function LimitToast({ toast, onOpenLimits }: LimitToastProps) {
  return (
    <div role="status" aria-live="assertive">
      <Button
        variant="ghost"
        size="none"
        onClick={onOpenLimits}
        className="flex w-[340px] items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left shadow-[0_18px_50px_rgba(15,23,42,.18)] hover:bg-[var(--surface)]"
      >
        <div
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${toast.kind === 'reached' ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/10' : 'bg-amber-50 text-amber-600 dark:bg-amber-500/10'}`}
        >
          <Bell size={18} />
        </div>
        <span>
          <strong className="block text-[12px] text-[var(--text)]">
            {toast.title}
          </strong>
          <span className="mt-1 block text-[10px] leading-4 text-[var(--muted)]">
            {toast.message}
          </span>
        </span>
      </Button>
    </div>
  );
}
