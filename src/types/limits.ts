export interface AppLimit {
  id: string;
  appId: string;
  appName: string;
  siteDomain: string | null;
  dailyLimitMinutes: number;
  warningMinutes: number;
  enabled: boolean;
  lastWarningDate: string | null;
  lastReachedDate: string | null;
  pausedDate: string | null;
}

export interface LimitInput {
  appId: string;
  appName: string;
  siteDomain?: string | null;
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
