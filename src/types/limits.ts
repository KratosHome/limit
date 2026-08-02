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
