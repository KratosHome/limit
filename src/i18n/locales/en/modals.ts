export default {
  limit: {
    eyebrow: 'Time boundary',
    editTitle: 'Edit limit',
    newTitle: 'New limit',
    app: 'App',
    noApps: 'Open the app you need first',
    site: 'Site (optional)',
    wholeBrowser: 'Entire browser',
    siteHint: 'Leave the site unselected to limit the entire browser.',
    noTrackedSites:
      'No tracked sites yet—the limit will apply to the entire browser.',
    periodLabel: 'Limit period',
    period: {
      day: 'Day',
      week: 'Week',
      month: 'Month',
    },
    periodHint: {
      day: 'Usage starts over at local midnight.',
      week: 'Usage adds up from Monday through Sunday.',
      month: 'Usage adds up from the first through the last day of the month.',
    },
    timeLabel: {
      day: 'Time per day',
      week: 'Total time per week',
      month: 'Total time per month',
    },
    minutesLabel: 'Limit in minutes',
    minuteUnit: 'min',
    warning: 'Warn me',
    noWarning: 'No warning',
    warningBefore: '{{count}} minutes before',
    warningBefore_one: '{{count}} minute before',
    warningBefore_other: '{{count}} minutes before',
    enabled: 'Limit active',
    reset: {
      day: 'Starts over every day',
      week: 'Starts over every Monday',
      month: 'Starts over on the first day of each month',
    },
    systemNotice:
      'System notifications are sent when they are enabled in Limit settings and allowed by the operating system. The app will not close automatically.',
  },
} as const;
