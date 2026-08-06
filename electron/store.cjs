const path = require('node:path');
const { SQLiteStorage } = require('./sqlite-storage.cjs');
const {
  cloneDefaultData,
  getOwn,
  guessCategory,
  normalizeData,
  normalizeSiteDomain,
} = require('./store/data-model.cjs');
const { addDays, enumerateDays, localDay } = require('./store/date-utils.cjs');
const {
  deleteLimit: deleteLimitRecord,
  writeLimit,
  writeNotificationDate,
  writePausedDate,
  writeSettings,
  writeUsageEntry,
} = require('./store/sqlite-writes.cjs');
const {
  aggregateUsage,
  getAppIconSource,
  getKnownApps,
} = require('./store/usage-queries.cjs');

class UsageStore {
  constructor(databasePath, options = {}) {
    this.storage = new SQLiteStorage(databasePath, {
      ...options,
      dataAdapter: {
        cloneDefaultData,
        guessCategory,
        normalizeData,
        normalizeSiteDomain,
      },
    });
    this.data = this.storage.data;
  }

  get database() {
    return this.storage.database;
  }

  transaction(callback) {
    return this.storage.transaction(callback);
  }

  persistNow() {
    return this.storage.persistNow();
  }

  close() {
    this.storage.close();
  }

  getSettings() {
    return { ...this.data.settings };
  }

  getStorageStatus() {
    return this.storage.getStatus();
  }

  updateSettings(patch) {
    const input =
      patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {};
    const allowed = {};
    if (typeof input.trackingEnabled === 'boolean')
      allowed.trackingEnabled = input.trackingEnabled;
    if (typeof input.websiteTrackingEnabled === 'boolean')
      allowed.websiteTrackingEnabled = input.websiteTrackingEnabled;
    if (typeof input.launchAtLogin === 'boolean')
      allowed.launchAtLogin = input.launchAtLogin;
    if (Number.isFinite(input.idleThresholdSeconds)) {
      allowed.idleThresholdSeconds = Math.min(
        3600,
        Math.max(15, Math.round(input.idleThresholdSeconds)),
      );
    }
    const settings = { ...this.data.settings, ...allowed };
    this.transaction(() => writeSettings(this.database, settings));
    this.data.settings = settings;
    return this.getSettings();
  }

  recordSample(sample, seconds, isLaunch = false, date = new Date()) {
    if (
      !sample?.id ||
      !sample?.name ||
      !Number.isFinite(seconds) ||
      seconds <= 0
    )
      return;
    const dayKey = localDay(date);
    const hour = String(date.getHours());
    const day = (this.data.usageByDay[dayKey] ||= {});
    const entry = createUpdatedEntry(
      day,
      sample,
      seconds,
      isLaunch,
      date,
      hour,
    );
    const site = updateSiteUsage(
      entry,
      this.data.settings.websiteTrackingEnabled ? sample.site?.domain : null,
      seconds,
      date,
    );
    this.transaction(() =>
      writeUsageEntry(this.database, dayKey, entry, hour, site),
    );
    Object.defineProperty(day, sample.id, {
      configurable: true,
      enumerable: true,
      value: entry,
      writable: true,
    });
  }

  getTodayUsage(appId, date = new Date()) {
    return getOwn(this.data.usageByDay[localDay(date)], appId)?.seconds || 0;
  }

  getKnownApps() {
    return getKnownApps(this.data);
  }

  getAppIconSource(appId) {
    return getAppIconSource(this.data, appId);
  }

  getLimits() {
    return Object.values(this.data.limits).map((limit) => ({ ...limit }));
  }

  saveLimit(input) {
    const limit = createLimit(input, getOwn(this.data.limits, input?.appId));
    this.transaction(() => writeLimit(this.database, limit));
    Object.defineProperty(this.data.limits, input.appId, {
      configurable: true,
      enumerable: true,
      value: limit,
      writable: true,
    });
    return { ...limit };
  }

  deleteLimit(appId) {
    this.transaction(() => deleteLimitRecord(this.database, appId));
    delete this.data.limits[appId];
  }

  pauseLimitToday(appId, date = new Date()) {
    const limit = getOwn(this.data.limits, appId);
    if (!limit) return null;
    const updatedLimit = { ...limit, pausedDate: localDay(date) };
    this.transaction(() =>
      writePausedDate(this.database, appId, updatedLimit.pausedDate),
    );
    Object.defineProperty(this.data.limits, appId, {
      configurable: true,
      enumerable: true,
      value: updatedLimit,
      writable: true,
    });
    return { ...updatedLimit };
  }

  markLimitNotification(appId, kind, date = new Date()) {
    const limit = getOwn(this.data.limits, appId);
    if (!limit) return;
    const key = kind === 'warning' ? 'lastWarningDate' : 'lastReachedDate';
    const day = localDay(date);
    this.transaction(() =>
      writeNotificationDate(this.database, appId, kind, day),
    );
    limit[key] = day;
  }

  getLimit(appId) {
    const limit = getOwn(this.data.limits, appId);
    return limit ? { ...limit } : null;
  }

  aggregate(from, to) {
    return aggregateUsage(this.data, from, to);
  }

  getDashboard(from, to, now = new Date()) {
    const current = this.aggregate(from, to);
    const today = localDay(now);
    const todayAggregate = this.aggregate(today, today);
    const previousTo = addDays(from, -1);
    const previousFrom = addDays(previousTo, -(current.days.length - 1));
    return {
      ...current,
      previousTotalSeconds: this.aggregate(previousFrom, previousTo)
        .totalSeconds,
      limits: this.getLimits(),
      knownApps: this.getKnownApps(),
      settings: this.getSettings(),
      storage: this.getStorageStatus(),
      today,
      todayUsage: Object.fromEntries(
        todayAggregate.apps.map((entry) => [entry.id, entry.seconds]),
      ),
      updatedAt: new Date().toISOString(),
    };
  }
}

function createUpdatedEntry(day, sample, seconds, isLaunch, date, hour) {
  const existingEntry = getOwn(day, sample.id);
  const entry = existingEntry
    ? JSON.parse(JSON.stringify(existingEntry))
    : {
        id: sample.id,
        name: sample.name,
        category: guessCategory(sample.name),
        seconds: 0,
        launches: 0,
        hourly: {},
        sites: {},
        lastTitle: '',
        lastSeenAt: null,
      };
  entry.name = sample.name;
  if (
    typeof sample.executablePath === 'string' &&
    sample.executablePath.length <= 4096 &&
    path.isAbsolute(sample.executablePath)
  ) {
    entry.executablePath = sample.executablePath;
  }
  entry.lastTitle = sample.title || entry.lastTitle;
  entry.lastSeenAt = date.toISOString();
  entry.seconds = Math.max(0, entry.seconds + seconds);
  entry.hourly[hour] = Math.max(0, (entry.hourly[hour] || 0) + seconds);
  if (isLaunch) entry.launches += 1;
  return entry;
}

function updateSiteUsage(entry, rawDomain, seconds, date) {
  const domain = normalizeSiteDomain(rawDomain);
  if (!domain) return null;
  if (
    !entry.sites ||
    typeof entry.sites !== 'object' ||
    Array.isArray(entry.sites)
  )
    entry.sites = {};
  const existingSite = getOwn(entry.sites, domain);
  const site =
    existingSite && typeof existingSite === 'object'
      ? existingSite
      : { domain, seconds: 0, lastSeenAt: null };
  site.domain = domain;
  site.seconds = Math.max(
    0,
    (Number.isFinite(site.seconds) ? site.seconds : 0) + seconds,
  );
  site.lastSeenAt = date.toISOString();
  Object.defineProperty(entry.sites, domain, {
    configurable: true,
    enumerable: true,
    value: site,
    writable: true,
  });
  return site;
}

function createLimit(input, previous = {}) {
  previous ||= {};
  if (!input?.appId || !input?.appName) throw new Error('Оберіть застосунок');
  if (String(input.appId).length > 512 || String(input.appName).length > 120)
    throw new Error('Некоректні дані застосунку');
  const dailyLimitMinutes = Math.round(Number(input.dailyLimitMinutes));
  if (
    !Number.isFinite(dailyLimitMinutes) ||
    dailyLimitMinutes < 1 ||
    dailyLimitMinutes > 1440
  ) {
    throw new Error('Ліміт має бути від 1 хвилини до 24 годин');
  }
  const warningMinutes = Math.min(
    Math.max(0, Math.round(Number(input.warningMinutes) || 0)),
    Math.max(0, dailyLimitMinutes - 1),
  );
  const thresholdChanged =
    previous.dailyLimitMinutes !== undefined &&
    previous.dailyLimitMinutes !== dailyLimitMinutes;
  return {
    ...previous,
    appId: input.appId,
    appName: input.appName,
    dailyLimitMinutes,
    warningMinutes,
    enabled: input.enabled !== false,
    lastWarningDate: thresholdChanged ? null : previous.lastWarningDate || null,
    lastReachedDate: thresholdChanged ? null : previous.lastReachedDate || null,
    pausedDate: previous.pausedDate || null,
  };
}

module.exports = {
  UsageStore,
  addDays,
  enumerateDays,
  guessCategory,
  localDay,
};
