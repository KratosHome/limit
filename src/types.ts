export type ViewKey = 'overview' | 'activity' | 'limits' | 'settings';
export type PeriodKey = 'today' | 'yesterday' | '7days' | '30days' | 'custom';
export type PermissionKind = 'accessibility' | 'automation';

export interface SiteUsage {
  domain: string;
  seconds: number;
}

export interface AppUsage {
  id: string;
  name: string;
  category: string;
  seconds: number;
  launches: number;
  lastTitle: string;
  lastSeenAt: string | null;
  limitMinutes: number | null;
  limitEnabled: boolean;
  isBrowser: boolean;
  sites: SiteUsage[];
}

export interface KnownApp {
  id: string;
  name: string;
  category: string;
  lastSeenAt: string | null;
}

export interface AppLimit {
  appId: string;
  appName: string;
  dailyLimitMinutes: number;
  warningMinutes: number;
  enabled: boolean;
  lastWarningDate: string | null;
  lastReachedDate: string | null;
  pausedDate: string | null;
}

export interface Settings {
  trackingEnabled: boolean;
  websiteTrackingEnabled: boolean;
  launchAtLogin: boolean;
  idleThresholdSeconds: number;
}

export interface TrackerStatus {
  currentApp: { id: string; name: string; title: string; site?: { domain: string } | null } | null;
  permissionState: 'unknown' | 'granted' | 'denied' | 'unsupported' | 'error';
  lastError: string | null;
  websitePermissionState: 'disabled' | 'pending' | 'granted' | 'unavailable' | 'denied' | 'error';
  lastWebsiteError: string | null;
  running: boolean;
}

export interface TimelinePoint {
  key: string;
  seconds: number;
}

export interface DashboardData {
  apps: AppUsage[];
  totalSeconds: number;
  previousTotalSeconds: number;
  timeline: TimelinePoint[];
  days: string[];
  limits: AppLimit[];
  knownApps: KnownApp[];
  settings: Settings;
  tracker: TrackerStatus;
  storage: { error: string | null; recoveryCreated: boolean };
  platform: string;
  isPackaged: boolean;
  today: string;
  todayUsage: Record<string, number>;
  updatedAt: string;
}

export interface DateRange {
  from: string;
  to: string;
}

export interface LimitInput {
  appId: string;
  appName: string;
  dailyLimitMinutes: number;
  warningMinutes: number;
  enabled: boolean;
}

export interface LimitNotification {
  kind: 'warning' | 'reached';
  appId: string;
  appName: string;
  title: string;
  message: string;
}

export interface LimitApi {
  getDashboard(range: DateRange): Promise<DashboardData>;
  getStatus(): Promise<TrackerStatus>;
  setTrackingEnabled(enabled: boolean): Promise<Settings>;
  updateSettings(patch: Partial<Settings>): Promise<Settings>;
  saveLimit(limit: LimitInput): Promise<AppLimit>;
  deleteLimit(appId: string): Promise<boolean>;
  pauseLimitToday(appId: string): Promise<AppLimit | null>;
  openPermissions(kind?: PermissionKind): Promise<boolean>;
  onDataUpdated(callback: (payload: { reason?: string }) => void): () => void;
  onLimitNotification(callback: (payload: LimitNotification) => void): () => void;
}

declare global {
  interface Window {
    limitApi?: LimitApi;
  }
}
