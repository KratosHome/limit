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
