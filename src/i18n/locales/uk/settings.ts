export default {
  eyebrow: 'Ваш Limit',
  title: 'Налаштування',
  subtitle: 'Керуйте трекінгом, запуском у фоні та виглядом застосунку.',
  general: 'Загальні',
  generalSubtitle: 'Поведінка фонового застосунку',
  activityTracking: 'Відстеження активності',
  activityTrackingDescription:
    'Рахувати лише час активного застосунку, не фонові процеси.',
  websiteTracking: 'Відстеження сайтів',
  websiteTrackingMac:
    'Опційно рахувати час за доменами в браузері. Зберігаються лише домени — локально на цьому Mac.',
  websiteTrackingUnsupported:
    'Функція доступна лише на macOS. Зберігаються тільки домени, без повних адрес і вмісту сторінок.',
  launchAtLogin: 'Запуск разом із системою',
  launchAtLoginDescription:
    'Limit стартуватиме у фоні після входу в обліковий запис.',
  idleThreshold: 'Поріг бездіяльності',
  idleThresholdDescription:
    'Не рахувати час, якщо ви не взаємодієте з компʼютером.',
  idleThresholdSelectLabel: 'Вибрати поріг бездіяльності',
  minutes: '{{count}} хв',
  appearance: 'Вигляд',
  appearanceSubtitle: 'Оформлення інтерфейсу',
  theme: 'Тема',
  themeDescription: 'Застосовується лише до інтерфейсу Limit.',
  light: 'Світла',
  dark: 'Темна',
  privacyTitle: 'Приватність за замовчуванням',
  privacyDescription:
    'Історія зберігається локально на цьому компʼютері. Відстеження сайтів вимкнене за замовчуванням; якщо його ввімкнути, Limit зберігає лише домени — без повних URL, вмісту сторінок або історії браузера.',
  localStorage: 'Локальне сховище',
  macAccess: 'Доступи macOS',
  macAccessDescription:
    'Limit не може напряму перевірити всі системні перемикачі. Кнопки нижче завжди доступні для ручної перевірки.',
  devMode:
    'Dev-режим: macOS може показувати тут IntelliJ IDEA, Terminal або Electron — залежно від того, звідки запущено застосунок. Щоб у списку був саме Limit, запустіть зібрану Limit.app напряму.',
  apps: 'Застосунки',
  sites: 'Сайти',
  enableSites: 'Увімкнути відстеження сайтів',
  accessibility: 'Accessibility',
  accessibilityDescription:
    'Дозволяє визначати активний застосунок і вкладку підтримуваного браузера. Системний запит зʼявляється лише після вашої дії, не у фоновому циклі.',
  openAccessibility: 'Відкрити Accessibility',
  openAccessibilityLabel: 'Відкрити налаштування macOS Accessibility',
  automation: 'Automation',
  automationDescription:
    'Дозволяє запитувати в Arc лише домен активної вкладки. Limit зʼявиться у списку після першої фактичної спроби прочитати вкладку Arc.',
  openAutomation: 'Відкрити Automation',
  openAutomationLabel: 'Відкрити налаштування macOS Automation',
  permissionsAftercare:
    'Після зміни дозволів поверніться в Limit. Якщо macOS не застосує їх одразу, перезапустіть застосунок.',
  about: 'Про застосунок',
  version: 'Версія',
  waylandNotice:
    'На Linux/Wayland глобальний трекінг активного вікна недоступний через обмеження системи.',
  status: {
    disabled: 'Вимкнено',
    activityDisabledDetail: 'Увімкніть загальне відстеження активності.',
    notRunning: 'Не запущено',
    notRunningDetail: 'Перезапустіть Limit і перевірте системні дозволи.',
    attention: 'Потребує уваги',
    accessibilityDetail: 'Перевірте Accessibility у налаштуваннях macOS.',
    working: 'Працює',
    activityWorkingDetail: 'Активний застосунок визначається.',
    checking: 'Перевіряється',
    checkingDetail: 'Limit очікує наступний активний застосунок.',
    websitesDisabledDetail:
      'Увімкніть функцію, щоб почати збирати час за доменами.',
    permissionsDetail: 'Перевірте Accessibility та Automation.',
    noDomain: 'Домен не отримано',
    noDomainDetail: 'Відкрийте Arc і перевірте Accessibility та Automation.',
    domainReceived: 'Отримано домен {{domain}}.',
    accessConfirmed: 'Доступ підтверджено',
    accessConfirmedDetail: 'Домени збиратимуться, коли браузер буде активним.',
    waitingBrowser: 'Увімкнено · очікує браузер',
    waitingBrowserDetail:
      'Відкрийте звичайну вкладку Arc, щоб перевірити доступ.',
  },
} as const;
