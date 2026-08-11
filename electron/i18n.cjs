const messages = {
  uk: {
    trayTooltip: 'Limit — трекер часу',
    open: 'Відкрити Limit',
    pauseTracking: 'Призупинити трекінг',
    resumeTracking: 'Відновити трекінг',
    quit: 'Вийти',
    warningTitle: (appName) => `Наближається ліміт ${appName}`,
    reachedTitle: (appName) => `Ліміт ${appName} досягнуто`,
    warningMessage: (remaining) => `Залишилося ${remaining} хв.`,
    reachedMessage: (used, limit) =>
      `Сьогодні використано ${used} хв. із ${limit} хв.`,
    notificationRequestTitle: 'Сповіщення Limit',
    notificationRequestBody:
      'Дозвольте сповіщення, щоб Limit попереджав про завершення часу.',
    notificationPermissionTitle: 'Системні сповіщення вимкнено',
    notificationPermissionMessage: 'Увімкніть сповіщення для Limit',
    notificationPermissionDetail:
      'Без цього macOS не покаже попередження про наближення або завершення ліміту.',
    openNotificationSettings: 'Відкрити налаштування',
    later: 'Пізніше',
  },
  en: {
    trayTooltip: 'Limit — time tracker',
    open: 'Open Limit',
    pauseTracking: 'Pause tracking',
    resumeTracking: 'Resume tracking',
    quit: 'Quit',
    warningTitle: (appName) => `${appName} is approaching its limit`,
    reachedTitle: (appName) => `${appName} reached its limit`,
    warningMessage: (remaining) => `${remaining} min remaining.`,
    reachedMessage: (used, limit) => `${used} of ${limit} min used today.`,
    notificationRequestTitle: 'Limit notifications',
    notificationRequestBody:
      'Allow notifications so Limit can warn you when time runs out.',
    notificationPermissionTitle: 'System notifications are disabled',
    notificationPermissionMessage: 'Enable notifications for Limit',
    notificationPermissionDetail:
      'Without permission, macOS cannot show warnings when a limit is approaching or reached.',
    openNotificationSettings: 'Open Settings',
    later: 'Later',
  },
};

function desktopMessages(language) {
  return messages[language === 'uk' ? 'uk' : 'en'];
}

function resolveDesktopLanguage(preferredLanguages) {
  if (!Array.isArray(preferredLanguages)) return 'en';

  for (const locale of preferredLanguages) {
    if (typeof locale !== 'string') continue;
    const language = locale.trim().toLowerCase().split(/[-_]/, 1)[0];
    if (language === 'uk' || language === 'en') return language;
  }

  return 'en';
}

module.exports = { desktopMessages, resolveDesktopLanguage };
