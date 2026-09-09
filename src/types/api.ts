import type { AppLimit, LimitInput, LimitNotification } from './limits';
import type { DateRange } from './navigation';
import type { PermissionKind, Settings } from './settings';
import type { TrackerStatus } from './tracker';
import type {
  ActivityDay,
  ActivityDelete,
  ActivityUpdate,
  DashboardData,
} from './usage';
import type { AppUpdateState } from './updates';

export interface LimitApi {
  getDashboard(range: DateRange): Promise<DashboardData>;
  getStatus(): Promise<TrackerStatus>;
  getActivityDays(appId: string, range: DateRange): Promise<ActivityDay[]>;
  updateActivity(input: ActivityUpdate): Promise<ActivityDay>;
  deleteActivity(input: ActivityDelete): Promise<boolean>;
  openTrackingWidget(): Promise<boolean>;
  setTrackingEnabled(enabled: boolean): Promise<Settings>;
  updateSettings(patch: Partial<Settings>): Promise<Settings>;
  saveLimit(limit: LimitInput): Promise<AppLimit>;
  deleteLimit(limitId: string): Promise<boolean>;
  pauseLimitToday(limitId: string): Promise<AppLimit | null>;
  openPermissions(kind?: PermissionKind): Promise<boolean>;
  getAppIcon(appId: string): Promise<string | null>;
  getAppUpdateState(): Promise<AppUpdateState>;
  checkForAppUpdates(): Promise<boolean>;
  downloadAppUpdate(): Promise<boolean>;
  installAppUpdate(): Promise<boolean>;
  openAppUpdateInstaller(): Promise<boolean>;
  onAppUpdateState(callback: (state: AppUpdateState) => void): () => void;
  onDataUpdated(callback: (payload: { reason?: string }) => void): () => void;
  onLimitNotification(
    callback: (payload: LimitNotification) => void,
  ): () => void;
}
