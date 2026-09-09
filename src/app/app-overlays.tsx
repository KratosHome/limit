import { LimitModal } from '../components/limit-modal';
import { LimitToast } from '../layout/limit-toast';
import type { LimitInput, LimitNotification } from '../types/limits';
import type { DashboardData } from '../types/usage';
import type { ModalState } from '../hooks/use-limit-app';
import type { AppUpdates } from '../hooks/use-app-updates';
import { AppUpdateToast } from '../layout/app-update-toast';

interface AppOverlaysProps {
  data: DashboardData | null;
  modal: ModalState | null;
  toast: LimitNotification | null;
  updates: AppUpdates;
  onOpenUpdateSettings: () => void;
  onCloseModal: () => void;
  onDeleteLimit: (limitId: string) => Promise<void>;
  onOpenLimitsFromToast: () => void;
  onSaveLimit: (input: LimitInput) => Promise<void>;
}

export function AppOverlays({
  data,
  modal,
  toast,
  updates,
  onOpenUpdateSettings,
  onCloseModal,
  onDeleteLimit,
  onOpenLimitsFromToast,
  onSaveLimit,
}: AppOverlaysProps) {
  return (
    <>
      {modal && data && (
        <LimitModal
          apps={data.knownApps}
          existing={modal.existing}
          initialAppId={modal.initialAppId}
          onClose={onCloseModal}
          onSave={onSaveLimit}
          onDelete={onDeleteLimit}
        />
      )}
      <div className="fixed bottom-5 right-5 z-[60] flex flex-col items-end gap-3">
        <AppUpdateToast
          updates={updates}
          onOpenSettings={onOpenUpdateSettings}
        />
        {toast && (
          <LimitToast toast={toast} onOpenLimits={onOpenLimitsFromToast} />
        )}
      </div>
    </>
  );
}
