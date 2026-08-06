const DEFAULT_DATA = Object.freeze({
  schemaVersion: 2,
  usageByDay: {},
  limits: {},
  settings: {
    trackingEnabled: true,
    websiteTrackingEnabled: false,
    launchAtLogin: false,
    idleThresholdSeconds: 60,
  },
});

function cloneDefaultData() {
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}

function guessCategory(appName = '') {
  const name = appName.toLowerCase();
  if (/(chrome|safari|firefox|edge|opera|brave|arc)/.test(name))
    return 'Браузер';
  if (/(telegram|slack|discord|messages|whatsapp|signal|teams|zoom)/.test(name))
    return 'Спілкування';
  if (/(code|cursor|webstorm|idea|xcode|terminal|iterm|warp|github)/.test(name))
    return 'Розробка';
  if (/(figma|photoshop|illustrator|sketch|canva)/.test(name)) return 'Дизайн';
  if (/(spotify|music|youtube|vlc|netflix)/.test(name)) return 'Розваги';
  if (/(notion|obsidian|notes|word|excel|pages|numbers)/.test(name))
    return 'Продуктивність';
  return 'Інше';
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

function getOwn(record, key) {
  return record && Object.prototype.hasOwnProperty.call(record, key)
    ? record[key]
    : null;
}

function normalizeData(value) {
  const fallback = cloneDefaultData();
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
    usageByDay:
      value.usageByDay &&
      typeof value.usageByDay === 'object' &&
      !Array.isArray(value.usageByDay)
        ? value.usageByDay
        : {},
    limits:
      value.limits &&
      typeof value.limits === 'object' &&
      !Array.isArray(value.limits)
        ? value.limits
        : {},
    settings: {
      trackingEnabled:
        typeof settings.trackingEnabled === 'boolean'
          ? settings.trackingEnabled
          : fallback.settings.trackingEnabled,
      websiteTrackingEnabled: settings.websiteTrackingEnabled === true,
      launchAtLogin: settings.launchAtLogin === true,
      idleThresholdSeconds,
    },
  };
}

module.exports = {
  cloneDefaultData,
  getOwn,
  guessCategory,
  normalizeData,
  normalizeSiteDomain,
};
