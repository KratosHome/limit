const messages = {
  uk: {
    trayTooltip: 'Limit — трекер часу',
    open: 'Відкрити Limit',
    pauseTracking: 'Призупинити трекінг',
    resumeTracking: 'Відновити трекінг',
    quit: 'Вийти',
    appVersion: (version) => `Версія ${version}`,
    checkForUpdates: 'Перевірити оновлення',
    checkingForUpdates: 'Перевіряємо оновлення…',
    downloadingUpdate: 'Завантажуємо оновлення…',
    installUpdate: (version) => `Перезапустити й оновити до ${version}`,
    downloadUpdateVersion: (version) => `Завантажити оновлення ${version}`,
    downloadUpdate: 'Завантажити',
    updateAvailableTitle: 'Оновлення Limit',
    updateAvailableMessage: (version) => `Доступна версія ${version}`,
    manualUpdateDetail:
      'Завантажте новий DMG, завершіть Limit через меню та замініть застосунок у папці Applications. Ваша статистика збережеться.',
    retryUpdate: 'Не вдалося оновити — спробувати ще раз',
    warningTitle: (appName) => `Наближається ліміт ${appName}`,
    reachedTitle: (appName) => `Ліміт ${appName} досягнуто`,
    warningMessage: (remaining) => `Залишилося ${remaining} хв.`,
    reachedMessage: (used, limit, period = 'day') => {
      const scope =
        period === 'week'
          ? 'Цього тижня'
          : period === 'month'
            ? 'Цього місяця'
            : 'Сьогодні';
      return `${scope} використано ${used} хв. із ${limit} хв.`;
    },
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
    appVersion: (version) => `Version ${version}`,
    checkForUpdates: 'Check for updates',
    checkingForUpdates: 'Checking for updates…',
    downloadingUpdate: 'Downloading update…',
    installUpdate: (version) => `Restart and update to ${version}`,
    downloadUpdateVersion: (version) => `Download update ${version}`,
    downloadUpdate: 'Download',
    updateAvailableTitle: 'Limit update',
    updateAvailableMessage: (version) => `Version ${version} is available`,
    manualUpdateDetail:
      'Download the new DMG, quit Limit from its menu, and replace the app in Applications. Your statistics will be kept.',
    retryUpdate: 'Update failed — try again',
    warningTitle: (appName) => `${appName} is approaching its limit`,
    reachedTitle: (appName) => `${appName} reached its limit`,
    warningMessage: (remaining) => `${remaining} min remaining.`,
    reachedMessage: (used, limit, period = 'day') => {
      const scope =
        period === 'week'
          ? 'this week'
          : period === 'month'
            ? 'this month'
            : 'today';
      return `${used} of ${limit} min used ${scope}.`;
    },
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
