export default {
  limit: {
    eyebrow: 'Daily boundary',
    editTitle: 'Edit limit',
    newTitle: 'New limit',
    app: 'App',
    noApps: 'Open the app you need first',
    site: 'Site (optional)',
    wholeBrowser: 'Entire browser',
    siteHint: 'Leave the site unselected to limit the entire browser.',
    noTrackedSites:
      'No tracked sites yet—the limit will apply to the entire browser.',
    dailyTime: 'Time per day',
    minutesLabel: 'Limit in minutes',
    minuteUnit: 'min',
    warning: 'Warn me',
    noWarning: 'No warning',
    warningBefore: '{{count}} minutes before',
    warningBefore_one: '{{count}} minute before',
    warningBefore_other: '{{count}} minutes before',
    enabled: 'Limit active',
    notifyDaily: 'Apply every day',
    systemNotice:
      'System notifications are sent when they are enabled in Limit settings and allowed by the operating system. The app will not close automatically.',
  },
} as const;
