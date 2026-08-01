import { Activity } from '../pages/Activity';
import { Limits } from '../pages/Limits';
import { Overview } from '../pages/Overview';
import { Settings } from '../pages/Settings';
import type { AppLimit, AppUsage, DashboardData, Settings as SettingsType, ViewKey } from '../types';

interface AppRouterProps {
  data: DashboardData;
  theme: 'light' | 'dark';
  view: ViewKey;
  onEditLimit: (limit?: AppLimit) => void;
  onOpenActivity: () => void;
  onOpenLimits: () => void;
  onOpenPermissions: () => void;
  onPauseLimit: (appId: string) => void;
  onSetLimit: (app: AppUsage) => void;
  onSettingsChange: (patch: Partial<SettingsType>) => void;
  onThemeChange: (theme: 'light' | 'dark') => void;
}

export function AppRouter({ data, theme, view, onEditLimit, onOpenActivity, onOpenLimits, onOpenPermissions, onPauseLimit, onSetLimit, onSettingsChange, onThemeChange }: AppRouterProps) {
  if (view === 'activity') return <Activity data={data} onSetLimit={onSetLimit} />;
  if (view === 'limits') return <Limits data={data} onAdd={() => onEditLimit()} onEdit={onEditLimit} onPause={onPauseLimit} />;
  if (view === 'settings') return <Settings data={data} theme={theme} onThemeChange={onThemeChange} onSettingsChange={onSettingsChange} onOpenPermissions={onOpenPermissions} />;

  return <Overview data={data} onOpenActivity={onOpenActivity} onOpenLimits={onOpenLimits} onEditLimit={onEditLimit} />;
}
