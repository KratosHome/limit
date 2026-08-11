export default {
  limit: {
    eyebrow: 'Щоденна межа',
    editTitle: 'Редагувати ліміт',
    newTitle: 'Новий ліміт',
    app: 'Застосунок',
    noApps: 'Спочатку відкрийте потрібний застосунок',
    site: 'Сайт (необов’язково)',
    wholeBrowser: 'Увесь браузер',
    siteHint: 'Без вибору сайту ліміт діятиме на весь браузер.',
    noTrackedSites:
      'Відстежених сайтів ще немає — ліміт діятиме на весь браузер.',
    dailyTime: 'Час на день',
    minutesLabel: 'Ліміт у хвилинах',
    minuteUnit: 'хв',
    warning: 'Попередити',
    noWarning: 'Без попередження',
    warningBefore: 'За {{count}} хвилин',
    warningBefore_one: 'За {{count}} хвилину',
    warningBefore_few: 'За {{count}} хвилини',
    warningBefore_many: 'За {{count}} хвилин',
    warningBefore_other: 'За {{count}} хвилини',
    enabled: 'Ліміт активний',
    notifyDaily: 'Застосовувати щодня',
    systemNotice:
      'Системні сповіщення надсилаються, коли вони ввімкнені в налаштуваннях Limit і дозволені операційною системою. Застосунок автоматично не закриватиметься.',
  },
} as const;
