export default {
  navigation: {
    label: 'Main navigation',
    overview: 'Overview',
    activity: 'Activity',
    limits: 'Limits',
    settings: 'Settings',
  },
  sidebar: {
    tagline: 'Intentional time',
    active: 'Tracking active',
    paused: 'Tracking paused',
    current: 'Now: {{app}}',
    local: 'Your data stays on this device',
  },
  periods: {
    today: 'Today',
    yesterday: 'Yesterday',
    sevenDays: '7 days',
    thirtyDays: '30 days',
    custom: 'Custom',
  },
  header: {
    periodStart: 'Period start',
    periodEnd: 'Period end',
    toggleTheme: 'Change theme',
    pauseTracking: 'Pause tracking',
    resumeTracking: 'Resume tracking',
  },
  chart: {
    label: 'Activity chart',
    appsThisHour: 'Apps during this hour',
    others_one: 'Other ({{count}})',
    others_other: 'Others ({{count}})',
    noBreakdown: 'No app breakdown is available.',
    restartForBreakdown: 'Restart Limit to load the app breakdown.',
  },
  sites: {
    label: 'Sites in {{app}}',
    more_one: '{{count}} more site',
    more_other: '{{count}} more sites',
    unattributed: 'Unattributed domain',
    unavailable:
      'No domain received yet. Check macOS permissions and open a tab in {{app}}.',
    disabled: 'Website tracking is currently disabled.',
    openSettings: 'Open settings',
  },
} as const;
