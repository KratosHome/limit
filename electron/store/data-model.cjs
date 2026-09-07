const crypto = require('node:crypto');

const SITE_LIMIT_ID_PREFIX = 'limit-site:v1:';

const DEFAULT_DATA = Object.freeze({
  schemaVersion: 8,
  usageByDay: {},
  limits: {},
  settings: {
    language: 'uk',
    trackingEnabled: true,
    websiteTrackingEnabled: false,
    notificationsEnabled: true,
    launchAtLogin: false,
    idleThresholdSeconds: 60,
  },
});

const LIMIT_PERIODS = Object.freeze(['day', 'week', 'month']);
const LIMIT_MAX_MINUTES = Object.freeze({
  day: 1440,
  week: 10080,
  month: 44640,
});

const CATEGORY_IDS = Object.freeze([
  'browser',
  'communication',
  'development',
  'design',
  'entertainment',
  'productivity',
  'other',
]);

const CATEGORY_ALIASES = new Map([
  ['browser', 'browser'],
  ['браузер', 'browser'],
  ['communication', 'communication'],
  ['спілкування', 'communication'],
  ['development', 'development'],
  ['розробка', 'development'],
  ['design', 'design'],
  ['дизайн', 'design'],
  ['entertainment', 'entertainment'],
  ['розваги', 'entertainment'],
  ['productivity', 'productivity'],
  ['продуктивність', 'productivity'],
  ['other', 'other'],
  ['інше', 'other'],
]);

function cloneDefaultData(defaultLanguage = 'uk') {
  const data = JSON.parse(JSON.stringify(DEFAULT_DATA));
  data.settings.language = defaultLanguage === 'en' ? 'en' : 'uk';
  return data;
}

function guessCategory(appName = '') {
  const name = appName.toLowerCase();
  if (/(chrome|safari|firefox|edge|opera|brave|arc)/.test(name))
    return 'browser';
  if (/(telegram|slack|discord|messages|whatsapp|signal|teams|zoom)/.test(name))
    return 'communication';
  if (/(code|cursor|webstorm|idea|xcode|terminal|iterm|warp|github)/.test(name))
    return 'development';
  if (/(figma|photoshop|illustrator|sketch|canva)/.test(name)) return 'design';
  if (/(spotify|music|youtube|vlc|netflix)/.test(name)) return 'entertainment';
  if (/(notion|obsidian|notes|word|excel|pages|numbers)/.test(name))
    return 'productivity';
  return 'other';
}

function normalizeCategory(value, appName = '') {
  const alias =
    typeof value === 'string' ? value.trim().toLocaleLowerCase('uk-UA') : '';
  return CATEGORY_ALIASES.get(alias) || guessCategory(appName);
}

function normalizeUsageByDay(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([dayKey, rawDay]) => {
      if (!rawDay || typeof rawDay !== 'object' || Array.isArray(rawDay))
        return [dayKey, {}];
      const entries = Object.entries(rawDay).flatMap(([appId, rawEntry]) => {
        if (
          !rawEntry ||
          typeof rawEntry !== 'object' ||
          Array.isArray(rawEntry)
        )
          return [];
        return [
          [
            appId,
            {
              ...rawEntry,
              category: normalizeCategory(rawEntry.category, rawEntry.name),
            },
          ],
        ];
      });
      return [dayKey, Object.fromEntries(entries)];
    }),
  );
}

function normalizeSiteDomain(value) {
  if (typeof value !== 'string') return null;
  let domain = value.trim().toLowerCase();
  if (domain.endsWith('.')) domain = domain.slice(0, -1);
  if (domain.startsWith('www.')) domain = domain.slice(4);
  if (!domain || domain.length > 253 || /[\s\\/:?#@]/.test(domain)) return null;

  const labels = domain.split('.');
  if (
    labels.some(
      (label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label),
    )
  )
    return null;
  return domain;
}

function isLimitPeriod(value) {
  return LIMIT_PERIODS.includes(value);
}

function normalizeLimitPeriod(value) {
  return isLimitPeriod(value) ? value : 'day';
}

function limitMaximumMinutes(period) {
  return LIMIT_MAX_MINUTES[normalizeLimitPeriod(period)];
}

function normalizeLimits(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([limitId, rawLimit]) => {
      if (!rawLimit || typeof rawLimit !== 'object' || Array.isArray(rawLimit))
        return [];
      return [
        [
          limitId,
          {
            ...rawLimit,
            period: normalizeLimitPeriod(rawLimit.period),
            limitMinutes: rawLimit.limitMinutes ?? rawLimit.dailyLimitMinutes,
          },
        ],
      ];
    }),
  );
}

function createLimitId(appId, siteDomain) {
  const normalizedAppId = String(appId);
  const domain = normalizeSiteDomain(siteDomain);
  if (!domain) return normalizedAppId;
  const digest = crypto
    .createHash('sha256')
    .update(JSON.stringify([normalizedAppId, domain]))
    .digest('base64url');
  return `${SITE_LIMIT_ID_PREFIX}${digest}`;
}

function getOwn(record, key) {
  return record && Object.prototype.hasOwnProperty.call(record, key)
    ? record[key]
    : null;
}

function normalizeData(value, defaultLanguage = 'uk') {
  const fallback = cloneDefaultData(defaultLanguage);
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return fallback;
  const settings =
    value.settings &&
    typeof value.settings === 'object' &&
    !Array.isArray(value.settings)
      ? value.settings
      : {};
  const idleThresholdSeconds = Number.isFinite(settings.idleThresholdSeconds)
    ? Math.min(3600, Math.max(15, Math.round(settings.idleThresholdSeconds)))
    : fallback.settings.idleThresholdSeconds;
  return {
    ...fallback,
    ...value,
    schemaVersion: Math.max(
      DEFAULT_DATA.schemaVersion,
      Number.isInteger(value.schemaVersion) ? value.schemaVersion : 1,
    ),
    usageByDay: normalizeUsageByDay(value.usageByDay),
    limits: normalizeLimits(value.limits),
    settings: {
      language:
        settings.language === 'en' || settings.language === 'uk'
          ? settings.language
          : fallback.settings.language,
      trackingEnabled:
        typeof settings.trackingEnabled === 'boolean'
          ? settings.trackingEnabled
          : fallback.settings.trackingEnabled,
      websiteTrackingEnabled: settings.websiteTrackingEnabled === true,
      notificationsEnabled:
        typeof settings.notificationsEnabled === 'boolean'
          ? settings.notificationsEnabled
          : fallback.settings.notificationsEnabled,
      launchAtLogin: settings.launchAtLogin === true,
      idleThresholdSeconds,
    },
  };
}

module.exports = {
  CATEGORY_IDS,
  LIMIT_MAX_MINUTES,
  LIMIT_PERIODS,
  SITE_LIMIT_ID_PREFIX,
  cloneDefaultData,
  createLimitId,
  getOwn,
  guessCategory,
  isLimitPeriod,
  limitMaximumMinutes,
  normalizeCategory,
  normalizeData,
  normalizeLimitPeriod,
  normalizeSiteDomain,
};
