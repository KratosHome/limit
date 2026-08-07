export default {
  app: {
    title: 'Limit — Intentional time',
  },
  language: {
    label: 'Language',
    description:
      'Detected from the system on first launch. Changes the interface and system notifications.',
    uk: 'Українська',
    en: 'English',
  },
  duration: {
    hoursMinutes: '{{hours}} hr {{minutes}} min',
    hours: '{{count}} hr',
    minutes: '{{count}} min',
    lessThanMinute: '< 1 min',
    zeroMinutes: '0 min',
  },
  categories: {
    browser: 'Browser',
    communication: 'Communication',
    development: 'Development',
    design: 'Design',
    entertainment: 'Entertainment',
    productivity: 'Productivity',
    other: 'Other',
  },
  actions: {
    close: 'Close',
    cancel: 'Cancel',
    save: 'Save',
    saving: 'Saving…',
    delete: 'Delete',
    retry: 'Try again',
  },
} as const;
