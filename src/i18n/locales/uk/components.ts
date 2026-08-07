export default {
  navigation: {
    label: 'Основна навігація',
    overview: 'Огляд',
    activity: 'Активність',
    limits: 'Ліміти',
    settings: 'Налаштування',
  },
  sidebar: {
    tagline: 'Свідомий час',
    active: 'Трекінг активний',
    paused: 'Трекінг на паузі',
    current: 'Зараз: {{app}}',
    local: 'Дані залишаються на пристрої',
  },
  periods: {
    today: 'Сьогодні',
    yesterday: 'Вчора',
    sevenDays: '7 днів',
    thirtyDays: '30 днів',
    custom: 'Власний',
  },
  header: {
    periodStart: 'Початок періоду',
    periodEnd: 'Кінець періоду',
    toggleTheme: 'Змінити тему',
    pauseTracking: 'Призупинити трекінг',
    resumeTracking: 'Відновити трекінг',
  },
  chart: {
    label: 'Графік активності',
    appsThisHour: 'Застосунки в цю годину',
    others_one: 'Інший ({{count}})',
    others_few: 'Інші ({{count}})',
    others_many: 'Інших ({{count}})',
    others_other: 'Інших ({{count}})',
    noBreakdown: 'Немає деталізації за застосунками.',
    restartForBreakdown:
      'Перезапустіть Limit, щоб завантажити деталізацію застосунків.',
  },
  sites: {
    label: 'Сайти в {{app}}',
    more_one: 'Ще {{count}} сайт',
    more_few: 'Ще {{count}} сайти',
    more_many: 'Ще {{count}} сайтів',
    more_other: 'Ще {{count}} сайта',
    unattributed: 'Без визначеного домену',
    unavailable:
      'Домен ще не отримано. Перевірте доступи macOS і відкрийте вкладку {{app}}.',
    disabled: 'Відстеження сайтів зараз вимкнене.',
    openSettings: 'Відкрити налаштування',
  },
} as const;
