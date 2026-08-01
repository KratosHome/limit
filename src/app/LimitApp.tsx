import { limitApi } from '../api';
import { Sidebar } from '../components/Sidebar';
import { AppShell } from '../layout/AppShell';
import { DashboardContent } from '../layout/DashboardContent';
import { AppHeader } from '../layout/AppHeader';
import { AppRouter } from '../routes/AppRouter';
import { AppOverlays } from './AppOverlays';
import { useLimitApp } from './useLimitApp';

export function LimitApp() {
  const app = useLimitApp();

  return (
    <AppShell
      sidebar={<Sidebar view={app.view} onChange={app.setView} trackingEnabled={app.data?.settings.trackingEnabled ?? true} currentApp={app.data?.tracker.currentApp?.name} />}
      header={<AppHeader view={app.view} period={app.period} customRange={app.customRange} trackingEnabled={app.data?.settings.trackingEnabled} theme={app.theme} onPeriodChange={app.setPeriod} onCustomRangeChange={app.setCustomRange} onThemeToggle={() => app.setTheme((value) => value === 'light' ? 'dark' : 'light')} onTrackingToggle={app.toggleTracking} />}
    >
      <DashboardContent data={app.data} loading={app.loading} error={app.error} onReload={() => void app.loadDashboard(true)}>
        {app.data && (
          <AppRouter
            data={app.data}
            theme={app.theme}
            view={app.view}
            onEditLimit={(limit) => app.setModal(limit ? { existing: limit } : {})}
            onOpenActivity={() => app.setView('activity')}
            onOpenLimits={() => app.setView('limits')}
            onOpenPermissions={() => void limitApi.openPermissions()}
            onPauseLimit={(appId) => void app.pauseLimit(appId)}
            onSetLimit={app.openLimitForApp}
            onSettingsChange={(patch) => void app.updateSettings(patch)}
            onThemeChange={app.setTheme}
          />
        )}
      </DashboardContent>

      <AppOverlays
        data={app.data}
        modal={app.modal}
        toast={app.toast}
        onCloseModal={() => app.setModal(null)}
        onDeleteLimit={app.deleteLimit}
        onOpenLimitsFromToast={() => {
          app.setToast(null);
          app.setView('limits');
        }}
        onSaveLimit={app.saveLimit}
      />
    </AppShell>
  );
}
