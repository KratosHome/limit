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
import type { AppLanguage } from '../i18n';
import type { AppUpdates } from '../hooks/use-app-updates';

interface AppRouterProps {
  data: DashboardData;
  theme: 'light' | 'dark';
  view: ViewKey;
  updates: AppUpdates;
  onEditLimit: (limit?: AppLimit) => void;
  onOpenActivity: () => void;
  onActivityChanged: () => Promise<void>;
  onOpenLimits: () => void;
  onOpenPermissions: (kind?: PermissionKind) => Promise<boolean>;
  onOpenSettings: () => void;
  onLanguageChange: (language: AppLanguage) => void;
  onPauseLimit: (limitId: string) => void;
  onSetLimit: (app: AppUsage) => void;
  onSettingsChange: (patch: Partial<SettingsType>) => Promise<void>;
  onThemeChange: (theme: 'light' | 'dark') => void;
}

export function AppRouter({
  data,
  theme,
  view,
  updates,
  onEditLimit,
  onOpenActivity,
  onActivityChanged,
  onOpenLimits,
  onOpenPermissions,
  onOpenSettings,
  onLanguageChange,
  onPauseLimit,
  onSetLimit,
  onSettingsChange,
  onThemeChange,
}: AppRouterProps) {
  if (view === 'activity')
    return (
      <Activity
        data={data}
        onActivityChanged={onActivityChanged}
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
        updates={updates}
        theme={theme}
        onThemeChange={onThemeChange}
        onLanguageChange={onLanguageChange}
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
