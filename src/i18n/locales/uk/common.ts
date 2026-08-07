export default {
  app: {
    title: 'Limit — Свідомий час',
  },
  language: {
    label: 'Мова',
    description:
      'На першому запуску визначається із системи. Змінює інтерфейс і системні сповіщення.',
    uk: 'Українська',
    en: 'English',
  },
  duration: {
    hoursMinutes: '{{hours}} год {{minutes}} хв',
    hours: '{{count}} год',
    minutes: '{{count}} хв',
    lessThanMinute: '< 1 хв',
    zeroMinutes: '0 хв',
  },
  categories: {
    browser: 'Браузер',
    communication: 'Спілкування',
    development: 'Розробка',
    design: 'Дизайн',
    entertainment: 'Розваги',
    productivity: 'Продуктивність',
    other: 'Інше',
  },
  actions: {
    close: 'Закрити',
    cancel: 'Скасувати',
    save: 'Зберегти',
    saving: 'Зберігаю…',
    delete: 'Видалити',
    retry: 'Спробувати ще',
  },
} as const;
