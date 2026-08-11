import { limitApi } from '../api';
import { Sidebar } from '../components/sidebar';
import { AppShell } from '../layout/app-shell';
import { DashboardContent } from '../layout/dashboard-content';
import { AppHeader } from '../layout/app-header';
import { AppRouter } from '../routes/app-router';
import { useLimitApp } from '../hooks/use-limit-app';
import { AppOverlays } from './app-overlays';

export function LimitApp() {
  const app = useLimitApp();

  return (
    <AppShell
      sidebar={
        <Sidebar
          view={app.view}
          onChange={app.setView}
          trackingEnabled={app.data?.settings.trackingEnabled ?? true}
          currentApp={app.data?.tracker.currentApp?.name}
        />
      }
      header={
        <AppHeader
          view={app.view}
          period={app.period}
          customRange={app.customRange}
          language={app.language}
          trackingEnabled={app.data?.settings.trackingEnabled}
          theme={app.theme}
          onPeriodChange={app.setPeriod}
          onCustomRangeChange={app.setCustomRange}
          onLanguageChange={(language) => void app.changeLanguage(language)}
          onThemeToggle={() =>
            app.setTheme((value) => (value === 'light' ? 'dark' : 'light'))
          }
          onTrackingToggle={app.toggleTracking}
        />
      }
    >
      <DashboardContent
        data={app.data}
        loading={app.loading}
        error={app.error}
        onReload={() => void app.loadDashboard(true)}
      >
        {app.data && (
          <AppRouter
            data={app.data}
            theme={app.theme}
            view={app.view}
            onEditLimit={(limit) =>
              app.setModal(limit ? { existing: limit } : {})
            }
            onOpenActivity={() => app.setView('activity')}
            onOpenLimits={() => app.setView('limits')}
            onOpenPermissions={(kind) => limitApi.openPermissions(kind)}
            onOpenSettings={() => app.setView('settings')}
            onLanguageChange={(language) => void app.changeLanguage(language)}
            onPauseLimit={(appId) => void app.pauseLimit(appId)}
            onSetLimit={app.openLimitForApp}
            onSettingsChange={app.updateSettings}
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
