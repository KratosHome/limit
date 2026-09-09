export default {
  eyebrow: 'Your Limit',
  title: 'Settings',
  subtitle: 'Manage tracking, background launch, and the app’s appearance.',
  general: 'General',
  generalSubtitle: 'Background app behavior',
  activityTracking: 'Activity tracking',
  activityTrackingDescription:
    'Count time in the foreground app even without mouse or keyboard activity. Pause tracking manually when you need a break.',
  websiteTracking: 'Website tracking',
  websiteTrackingMac:
    'Optionally track time by browser domain. Only domains are stored, locally on this Mac.',
  websiteTrackingUnsupported:
    'This feature is available only on macOS. Only domains are stored—never full addresses or page content.',
  launchAtLogin: 'Launch at login',
  launchAtLoginDescription:
    'Limit will start in the background after you sign in.',
  notifications: 'Limit notifications',
  notificationsDescription:
    'Show system banners and in-app messages when limits are approaching or reached.',
  notificationsDisabledDescription: 'Limit will not show limit warnings.',
  notificationsReadyDescription:
    'Enabled in Limit and allowed by the operating system.',
  notificationsPermissionRequiredDescription:
    'Enabled in Limit, but macOS is blocking banners. Open System Settings with the button beside the switch.',
  notificationsPermissionPendingDescription:
    'Waiting for macOS permission to show notification banners.',
  notificationsCheckingDescription:
    'Limit is checking the macOS notification permission.',
  notificationsCheckingWindowsDescription:
    'Limit is checking whether Windows allows notifications for this app.',
  notificationsSuppressedWindowsDescription:
    'Windows is blocking notifications for Limit. Check the system notification settings.',
  notificationsUnsupportedDescription:
    'System banners are unavailable on this system or in this launch mode.',
  settingsUpdateError: 'Could not update settings. Please try again.',
  notificationsUpdateError:
    'Could not update notification settings. Please try again.',
  notificationsOpenSettingsError:
    'Could not open system notification settings. Please try again.',
  permissionsOpenError:
    'Could not open system permission settings. Please try again.',
  openNotificationSettings: 'macOS notification settings',
  openNotificationSettingsLabel: 'Open macOS notification settings',
  openWindowsNotificationSettings: 'Windows notification settings',
  openWindowsNotificationSettingsLabel: 'Open Windows notification settings',
  appearance: 'Appearance',
  appearanceSubtitle: 'Interface appearance',
  theme: 'Theme',
  themeDescription: 'Applies only to the Limit interface.',
  light: 'Light',
  dark: 'Dark',
  privacyTitle: 'Privacy by default',
  privacyDescription:
    'History is stored locally on this computer. Website tracking is off by default; when enabled, Limit stores domains only—never full URLs, page content, or browser history.',
  localStorage: 'Local storage',
  macAccess: 'macOS permissions',
  macAccessDescription:
    'Limit cannot directly inspect every system toggle. The buttons below are always available for a manual check.',
  devMode:
    'Development mode: macOS may list IntelliJ IDEA, Terminal, or Electron here, depending on how the app was started. Launch the packaged Limit.app directly to see Limit itself in the list.',
  apps: 'Apps',
  sites: 'Sites',
  enableSites: 'Enable website tracking',
  accessibility: 'Accessibility',
  accessibilityDescription:
    'Allows Limit to identify the active app and supported browser tab. The system prompt appears only after your action, never from a background loop.',
  openAccessibility: 'Open Accessibility',
  openAccessibilityLabel: 'Open macOS Accessibility settings',
  automation: 'Automation',
  automationDescription:
    'Allows Limit to request only the active Arc tab’s domain. Limit appears in the list after the first real attempt to read an Arc tab.',
  openAutomation: 'Open Automation',
  openAutomationLabel: 'Open macOS Automation settings',
  permissionsAftercare:
    'Return to Limit after changing permissions. Restart the app if macOS does not apply them immediately.',
  about: 'About',
  version: 'Version',
  updates: {
    title: 'App updates',
    currentVersion: 'Installed version {{version}}',
    loading: 'Loading update status…',
    working: 'Please wait…',
    disabled:
      'Local builds do not update from GitHub, so your current changes are preserved. Updates are available in release builds.',
    idle: 'You’re using the latest version.',
    checking: 'Checking for updates…',
    available: 'Version {{version}} is available',
    downloading: 'Downloading version {{version}}…',
    progress: 'Downloaded {{percent}}%',
    ready: 'Version {{version}} is ready to install',
    manualDetail:
      'Download the update, then open the installer when you’re ready.',
    automaticDetail: 'Download the update, then restart Limit to install it.',
    installerDetail:
      'Limit will quit when the installer opens. Drag Limit into Applications to replace the current version, then reopen it. Your history and settings will stay on this Mac.',
    restartDetail: 'Restart Limit to finish installing the update.',
    check: 'Check for updates',
    download: 'Download update',
    install: 'Restart and update',
    open: 'Open installer and quit',
    failed: 'Could not update Limit',
    retry: 'Try again',
    details: 'View in settings',
    dismiss: 'Dismiss update notification',
    releaseNotes: 'What’s new',
    errors: {
      load: 'Could not load update status. Please try again.',
      check:
        'Could not check for updates. Check your connection and try again.',
      download:
        'Could not download the update. Check your connection and try again.',
      open: 'Could not open the installer. Try opening it again.',
      install: 'Could not install the update. Restart Limit and try again.',
    },
  },
  waylandNotice:
    'Global active-window tracking is unavailable on Linux/Wayland due to system limitations.',
  status: {
    disabled: 'Disabled',
    activityDisabledDetail: 'Enable general activity tracking.',
    notRunning: 'Not running',
    notRunningDetail: 'Restart Limit and check system permissions.',
    attention: 'Needs attention',
    accessibilityDetail: 'Check Accessibility in macOS Settings.',
    working: 'Working',
    activityWorkingDetail: 'The active app is being detected.',
    checking: 'Checking',
    checkingDetail: 'Limit is waiting for the next active app.',
    websitesDisabledDetail:
      'Enable this feature to start collecting time by domain.',
    permissionsDetail: 'Check Accessibility and Automation.',
    noDomain: 'No domain received',
    noDomainDetail: 'Open Arc and check Accessibility and Automation.',
    domainReceived: 'Received domain {{domain}}.',
    accessConfirmed: 'Access confirmed',
    accessConfirmedDetail:
      'Domains will be collected while a browser is active.',
    waitingBrowser: 'Enabled · waiting for browser',
    waitingBrowserDetail: 'Open a regular Arc tab to verify access.',
  },
} as const;
