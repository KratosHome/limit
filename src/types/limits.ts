export const limitPeriods = ['day', 'week', 'month'] as const;

export type LimitPeriod = (typeof limitPeriods)[number];

export function normalizeLimitPeriod(value: unknown): LimitPeriod {
  return limitPeriods.includes(value as LimitPeriod)
    ? (value as LimitPeriod)
    : 'day';
}

export interface AppLimit {
  id: string;
  appId: string;
  appName: string;
  siteDomain: string | null;
  period: LimitPeriod;
  limitMinutes: number;
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
  period: LimitPeriod;
  limitMinutes: number;
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
