import { LimitModal } from '../components/limit-modal';
import { LimitToast } from '../layout/limit-toast';
import type { LimitInput, LimitNotification } from '../types/limits';
import type { DashboardData } from '../types/usage';
import type { ModalState } from '../hooks/use-limit-app';

interface AppOverlaysProps {
  data: DashboardData | null;
  modal: ModalState | null;
  toast: LimitNotification | null;
  onCloseModal: () => void;
  onDeleteLimit: (limitId: string) => Promise<void>;
  onOpenLimitsFromToast: () => void;
  onSaveLimit: (input: LimitInput) => Promise<void>;
}

export function AppOverlays({
  data,
  modal,
  toast,
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
      {toast && (
        <LimitToast toast={toast} onOpenLimits={onOpenLimitsFromToast} />
      )}
    </>
  );
}
