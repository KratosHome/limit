import type { AppLimit } from './limits';
import type { Settings } from './settings';
import type { TrackerStatus } from './tracker';

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

export interface TimelineAppUsage {
  id: string;
  name: string;
  seconds: number;
}

export interface TimelinePoint {
  key: string;
  seconds: number;
  apps?: TimelineAppUsage[];
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
