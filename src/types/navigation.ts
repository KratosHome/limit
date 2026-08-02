export type ViewKey = 'overview' | 'activity' | 'limits' | 'settings';

export type PeriodKey = 'today' | 'yesterday' | '7days' | '30days' | 'custom';

export interface DateRange {
  from: string;
  to: string;
}
