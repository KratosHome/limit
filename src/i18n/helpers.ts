import i18n from './index';

const categoryKeys: Record<string, string> = {
  Браузер: 'browser',
  Browser: 'browser',
  Спілкування: 'communication',
  Communication: 'communication',
  Розробка: 'development',
  Development: 'development',
  Дизайн: 'design',
  Design: 'design',
  Розваги: 'entertainment',
  Entertainment: 'entertainment',
  Продуктивність: 'productivity',
  Productivity: 'productivity',
  Інше: 'other',
  Other: 'other',
};

const errorKeys: Record<string, string> = {
  'Desktop API недоступний. Перезапустіть Limit або перевірте preload script.':
    'desktopApiUnavailable',
  'Недозволений IPC sender': 'ipcSender',
  'Некоректне значення трекінгу': 'invalidTracking',
  'Некоректний ідентифікатор застосунку': 'invalidAppId',
  'Некоректний тип дозволу': 'invalidPermission',
  'Оберіть застосунок': 'selectApp',
  'Некоректні дані застосунку': 'invalidAppData',
  'Ліміт має бути від 1 хвилини до 24 годин': 'invalidLimit',
  'Не вдалося прочитати локальну базу. Створено резервну копію для відновлення.':
    'storageRead',
  'Не вдалося імпортувати стару JSON-історію. Створено резервну копію для відновлення.':
    'storageImport',
  'Не вдалося зберегти локальну історію.': 'storageSave',
  'Не вдалося завершити збереження історії.': 'storageMaintenance',
};

export function translateCategory(category: string): string {
  const key = categoryKeys[category];
  return key ? i18n.t(`common:categories.${key}`) : category;
}

export function translateError(
  message: string,
  fallbackKey = 'unknown',
): string {
  if (i18n.exists(`errors:${message}`))
    return String(i18n.t(`errors:${message}`));
  const key = errorKeys[message];
  return key
    ? String(i18n.t(`errors:${key}`))
    : message || String(i18n.t(`errors:${fallbackKey}`));
}
