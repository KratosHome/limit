import type { AppLimit, LimitInput, LimitNotification } from './limits';
import type { DateRange } from './navigation';
import type { PermissionKind, Settings } from './settings';
import type { TrackerStatus } from './tracker';
import type { DashboardData } from './usage';

export interface LimitApi {
  getDashboard(range: DateRange): Promise<DashboardData>;
  getStatus(): Promise<TrackerStatus>;
  setTrackingEnabled(enabled: boolean): Promise<Settings>;
  updateSettings(patch: Partial<Settings>): Promise<Settings>;
  saveLimit(limit: LimitInput): Promise<AppLimit>;
  deleteLimit(appId: string): Promise<boolean>;
  pauseLimitToday(appId: string): Promise<AppLimit | null>;
  openPermissions(kind?: PermissionKind): Promise<boolean>;
  getAppIcon(appId: string): Promise<string | null>;
  onDataUpdated(callback: (payload: { reason?: string }) => void): () => void;
  onLimitNotification(
    callback: (payload: LimitNotification) => void,
  ): () => void;
}
