import { Activity } from '../pages/activity';
import { Limits } from '../pages/limits';
import { Overview } from '../pages/overview';
import { Settings } from '../pages/settings';
import type { AppLimit } from '../types/limits';
import type { ViewKey } from '../types/navigation';
import type {
  PermissionKind,
  Settings as SettingsType,
} from '../types/settings';
import type { AppUsage, DashboardData } from '../types/usage';

interface AppRouterProps {
  data: DashboardData;
  theme: 'light' | 'dark';
  view: ViewKey;
  onEditLimit: (limit?: AppLimit) => void;
  onOpenActivity: () => void;
  onOpenLimits: () => void;
  onOpenPermissions: (kind?: PermissionKind) => void;
  onOpenSettings: () => void;
  onPauseLimit: (appId: string) => void;
  onSetLimit: (app: AppUsage) => void;
  onSettingsChange: (patch: Partial<SettingsType>) => void;
  onThemeChange: (theme: 'light' | 'dark') => void;
}

export function AppRouter({
  data,
  theme,
  view,
  onEditLimit,
  onOpenActivity,
  onOpenLimits,
  onOpenPermissions,
  onOpenSettings,
  onPauseLimit,
  onSetLimit,
  onSettingsChange,
  onThemeChange,
}: AppRouterProps) {
  if (view === 'activity')
    return (
      <Activity
        data={data}
        onSetLimit={onSetLimit}
        onOpenSettings={onOpenSettings}
      />
    );
  if (view === 'limits')
    return (
      <Limits
        data={data}
        onAdd={() => onEditLimit()}
        onEdit={onEditLimit}
        onPause={onPauseLimit}
      />
    );
  if (view === 'settings')
    return (
      <Settings
        data={data}
        theme={theme}
        onThemeChange={onThemeChange}
        onSettingsChange={onSettingsChange}
        onOpenPermissions={onOpenPermissions}
      />
    );

  return (
    <Overview
      data={data}
      onOpenActivity={onOpenActivity}
      onOpenLimits={onOpenLimits}
      onOpenSettings={onOpenSettings}
      onEditLimit={onEditLimit}
    />
  );
}
