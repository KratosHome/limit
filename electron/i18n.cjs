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
    downloadingUpdateProgress: (percent) =>
      `Завантажуємо оновлення — ${percent}%`,
    installUpdate: (version) => `Перезапустити й оновити до ${version}`,
    downloadUpdateVersion: (version) => `Завантажити оновлення ${version}`,
    downloadUpdate: 'Завантажити',
    updateAvailableTitle: 'Оновлення Limit',
    updateAvailableMessage: (version) => `Доступна версія ${version}`,
    manualUpdateDetail:
      'Limit завантажить встановщик у папку «Завантаження». Прогрес буде видно в Dock і меню Limit біля годинника. Після завантаження допоможемо відкрити встановщик та замінити застосунок. Ваша статистика збережеться.',
    updateReadyMessage: (version) => `Версія ${version} завантажена`,
    manualUpdateReadyDetail:
      'Встановщик збережено в папці «Завантаження». Натисніть «Відкрити встановщик і завершити Limit». У вікні встановщика перетягніть Limit на Applications і підтвердьте заміну. Потім відкрийте Limit із Applications. Ваша статистика збережеться.',
    openInstallerAndQuit: 'Відкрити встановщик і завершити Limit',
    openInstallerVersion: (version) => `Відкрити встановщик ${version}`,
    showInFinder: 'Показати у Finder',
    updateDownloadFailed: 'Не вдалося завантажити оновлення',
    updateDownloadFailedDetail:
      'Перевірте підключення до інтернету та вільне місце у папці «Завантаження» й спробуйте ще раз. Поточна версія Limit продовжує працювати.',
    retryDownload: 'Повторити завантаження',
    updateOpenFailed:
      'Не вдалося відкрити встановщик. Відкрийте його у Finder.',
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
    downloadingUpdateProgress: (percent) => `Downloading update — ${percent}%`,
    installUpdate: (version) => `Restart and update to ${version}`,
    downloadUpdateVersion: (version) => `Download update ${version}`,
    downloadUpdate: 'Download',
    updateAvailableTitle: 'Limit update',
    updateAvailableMessage: (version) => `Version ${version} is available`,
    manualUpdateDetail:
      'Limit will download the installer to Downloads. Progress appears in the Dock and the Limit menu near the clock. When it is ready, we will help you open the installer and replace the app. Your statistics will be kept.',
    updateReadyMessage: (version) => `Version ${version} is downloaded`,
    manualUpdateReadyDetail:
      'The installer is saved in Downloads. Click “Open installer and quit Limit”. In the installer window, drag Limit onto Applications and confirm replacement. Then open Limit from Applications. Your statistics will be kept.',
    openInstallerAndQuit: 'Open installer and quit Limit',
    openInstallerVersion: (version) => `Open installer ${version}`,
    showInFinder: 'Show in Finder',
    updateDownloadFailed: 'Could not download the update',
    updateDownloadFailedDetail:
      'Check your internet connection and free space in Downloads, then try again. Your current version of Limit is still running.',
    retryDownload: 'Retry download',
    updateOpenFailed: 'Could not open the installer. Open it in Finder.',
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
