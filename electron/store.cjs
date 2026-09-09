const path = require('node:path');
const { AppError, ERROR_CODES } = require('./errors.cjs');
const { SQLiteStorage } = require('./sqlite-storage.cjs');
const {
  CATEGORY_IDS,
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
} = require('./store/data-model.cjs');
const {
  addDays,
  enumerateDays,
  limitPeriodRange,
  localDay,
} = require('./store/date-utils.cjs');
const {
  deleteActivity: deleteActivityRecord,
  deleteLimit: deleteLimitRecord,
  writeLimit,
  writeNotificationDate,
  writePausedDate,
  writeSettings,
  writeUsageEntry,
  writeActivityEdit,
  writeActivityLimitNotifications,
} = require('./store/sqlite-writes.cjs');
const {
  activityDaySummary,
  getActivityDays,
  getActivityForMutation,
  rearmActivityLimits,
  scaleActivityEntry,
} = require('./store/activity-edits.cjs');
const {
  aggregateUsage,
  compareText,
  getAppIconSource,
  getCurrentLimitUsage,
  getKnownApps,
} = require('./store/usage-queries.cjs');

class UsageStore {
  constructor(databasePath, options = {}) {
    const defaultLanguage = options.defaultLanguage === 'en' ? 'en' : 'uk';
    this.storage = new SQLiteStorage(databasePath, {
      ...options,
      dataAdapter: {
        cloneDefaultData: () => cloneDefaultData(defaultLanguage),
        normalizeCategory,
        normalizeData: (value) => normalizeData(value, defaultLanguage),
        normalizeSiteDomain,
      },
    });
    this.data = this.storage.data;
    this.knownAppsCache = null;
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
    if (input.language === 'uk' || input.language === 'en')
      allowed.language = input.language;
    if (typeof input.trackingEnabled === 'boolean')
      allowed.trackingEnabled = input.trackingEnabled;
    if (typeof input.websiteTrackingEnabled === 'boolean')
      allowed.websiteTrackingEnabled = input.websiteTrackingEnabled;
    if (typeof input.notificationsEnabled === 'boolean')
      allowed.notificationsEnabled = input.notificationsEnabled;
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
    const site = createUpdatedSite(
      entry.sites,
      this.data.settings.websiteTrackingEnabled ? sample.site?.domain : null,
      seconds,
      date,
    );
    this.transaction(() =>
      writeUsageEntry(this.database, dayKey, entry, hour, site),
    );
    if (site) {
      Object.defineProperty(entry.sites, site.domain, {
        configurable: true,
        enumerable: true,
        value: site,
        writable: true,
      });
    }
    Object.defineProperty(day, sample.id, {
      configurable: true,
      enumerable: true,
      value: entry,
      writable: true,
    });
    this.updateKnownAppCache(entry, site);
  }

  getTodayUsage(appId, date = new Date()) {
    return getOwn(this.data.usageByDay[localDay(date)], appId)?.seconds || 0;
  }

  getActivityDays(appId, range) {
    return getActivityDays(this.data, appId, range);
  }

  updateActivity(input, now = new Date()) {
    const entry = getActivityForMutation(this.data, input, { edit: true });
    const updated = scaleActivityEntry(entry, input.seconds);
    const rearmedLimits = rearmActivityLimits(
      this.data,
      input.day,
      entry,
      updated,
      now,
    );
    this.transaction(() => {
      writeActivityEdit(this.database, input.day, updated);
      writeActivityLimitNotifications(this.database, rearmedLimits);
    });
    Object.defineProperty(this.data.usageByDay[input.day], input.appId, {
      configurable: true,
      enumerable: true,
      value: updated,
      writable: true,
    });
    for (const limit of rearmedLimits) this.data.limits[limit.id] = limit;
    this.knownAppsCache = null;
    return activityDaySummary(input.day, updated);
  }

  deleteActivity(input, now = new Date()) {
    const entry = getActivityForMutation(this.data, input);
    const rearmedLimits = rearmActivityLimits(
      this.data,
      input.day,
      entry,
      null,
      now,
    );
    this.transaction(() => {
      deleteActivityRecord(this.database, input.day, input.appId);
      writeActivityLimitNotifications(this.database, rearmedLimits);
    });
    const day = this.data.usageByDay[input.day];
    delete day[input.appId];
    if (!Object.keys(day).length) delete this.data.usageByDay[input.day];
    for (const limit of rearmedLimits) this.data.limits[limit.id] = limit;
    this.knownAppsCache = null;
    return true;
  }

  getTodaySiteUsage(appId, siteDomain, date = new Date()) {
    const domain = normalizeSiteDomain(siteDomain);
    if (!domain) return 0;
    const entry = getOwn(this.data.usageByDay[localDay(date)], appId);
    return getOwn(entry?.sites, domain)?.seconds || 0;
  }

  getTodayLimitUsage(limit, date = new Date()) {
    return this.getCurrentLimitUsage(limit, date);
  }

  getCurrentLimitUsage(limit, date = new Date()) {
    return getCurrentLimitUsage(this.data, limit, date);
  }

  getKnownApps() {
    if (!this.knownAppsCache) {
      this.knownAppsCache = new Map(
        getKnownApps(this.data).map((entry) => [
          entry.id,
          { ...entry, sites: new Set(entry.sites) },
        ]),
      );
    }
    return [...this.knownAppsCache.values()]
      .map((entry) => ({
        ...entry,
        sites: [...entry.sites].sort(compareText),
      }))
      .sort((left, right) => compareText(left.name, right.name));
  }

  updateKnownAppCache(entry, site) {
    if (!this.knownAppsCache) return;
    const cached = this.knownAppsCache.get(entry.id) || {
      id: entry.id,
      name: entry.name,
      category: entry.category,
      lastSeenAt: null,
      sites: new Set(),
    };
    cached.name = entry.name;
    cached.category = entry.category;
    cached.lastSeenAt = entry.lastSeenAt;
    if (site) cached.sites.add(site.domain);
    this.knownAppsCache.set(entry.id, cached);
  }

  getAppIconSource(appId) {
    return getAppIconSource(this.data, appId);
  }

  getLimits() {
    return Object.values(this.data.limits).map((limit) => ({ ...limit }));
  }

  saveLimit(input) {
    const limitId = createLimitId(input?.appId, input?.siteDomain);
    const limit = createLimit(input, getOwn(this.data.limits, limitId));
    this.transaction(() => writeLimit(this.database, limit));
    Object.defineProperty(this.data.limits, limit.id, {
      configurable: true,
      enumerable: true,
      value: limit,
      writable: true,
    });
    this.knownAppsCache = null;
    return { ...limit };
  }

  deleteLimit(limitId) {
    this.transaction(() => deleteLimitRecord(this.database, limitId));
    delete this.data.limits[limitId];
    this.knownAppsCache = null;
  }

  pauseLimitToday(limitId, date = new Date()) {
    const limit = getOwn(this.data.limits, limitId);
    if (!limit) return null;
    const updatedLimit = { ...limit, pausedDate: localDay(date) };
    this.transaction(() =>
      writePausedDate(this.database, limitId, updatedLimit.pausedDate),
    );
    Object.defineProperty(this.data.limits, limitId, {
      configurable: true,
      enumerable: true,
      value: updatedLimit,
      writable: true,
    });
    return { ...updatedLimit };
  }

  markLimitNotification(limitId, kind, date = new Date()) {
    const limit = getOwn(this.data.limits, limitId);
    if (!limit) return;
    const key = kind === 'warning' ? 'lastWarningDate' : 'lastReachedDate';
    const periodKey = limitPeriodRange(limit.period, date).key;
    this.transaction(() =>
      writeNotificationDate(this.database, limitId, kind, periodKey),
    );
    limit[key] = periodKey;
  }

  getLimit(limitId) {
    const limit = getOwn(this.data.limits, limitId);
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
    const limits = this.getLimits();
    const limitUsage = Object.fromEntries(
      limits.map((limit) => [limit.id, this.getCurrentLimitUsage(limit, now)]),
    );
    return {
      ...current,
      previousTotalSeconds: this.aggregate(previousFrom, previousTo)
        .totalSeconds,
      limits,
      knownApps: this.getKnownApps(),
      settings: this.getSettings(),
      storage: this.getStorageStatus(),
      today,
      todayUsage: Object.fromEntries(
        todayAggregate.apps.map((entry) => [entry.id, entry.seconds]),
      ),
      limitUsage,
      updatedAt: new Date().toISOString(),
    };
  }
}

function createUpdatedEntry(day, sample, seconds, isLaunch, date, hour) {
  const existingEntry = getOwn(day, sample.id);
  const entry = existingEntry
    ? {
        ...existingEntry,
        hourly: { ...(existingEntry.hourly || {}) },
        sites:
          existingEntry.sites &&
          typeof existingEntry.sites === 'object' &&
          !Array.isArray(existingEntry.sites)
            ? existingEntry.sites
            : {},
      }
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
  entry.category = normalizeCategory(entry.category, sample.name);
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

function createUpdatedSite(sites, rawDomain, seconds, date) {
  const domain = normalizeSiteDomain(rawDomain);
  if (!domain) return null;
  const existingSite = getOwn(sites, domain);
  const site =
    existingSite && typeof existingSite === 'object'
      ? { ...existingSite }
      : { domain, seconds: 0, lastSeenAt: null };
  site.domain = domain;
  site.seconds = Math.max(
    0,
    (Number.isFinite(site.seconds) ? site.seconds : 0) + seconds,
  );
  site.lastSeenAt = date.toISOString();
  return site;
}

function hasControlCharacter(value) {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint <= 31 || codePoint === 127) return true;
  }
  return false;
}

function createLimit(input, previous = {}) {
  previous ||= {};
  if (
    typeof input?.appId !== 'string' ||
    !input.appId.trim() ||
    typeof input?.appName !== 'string' ||
    !input.appName.trim()
  )
    throw new AppError(ERROR_CODES.SELECT_APP);
  if (
    input.appId.length > 512 ||
    input.appName.length > 120 ||
    hasControlCharacter(input.appId) ||
    hasControlCharacter(input.appName) ||
    input.appId.startsWith(SITE_LIMIT_ID_PREFIX)
  )
    throw new AppError(ERROR_CODES.INVALID_APP_DATA);
  const period =
    input.period === undefined
      ? normalizeLimitPeriod(previous.period)
      : normalizeLimitPeriod(input.period);
  if (input.period !== undefined && !isLimitPeriod(input.period))
    throw new AppError(ERROR_CODES.INVALID_LIMIT);
  const limitMinutes = Math.round(
    Number(input.limitMinutes ?? input.dailyLimitMinutes),
  );
  if (
    !Number.isFinite(limitMinutes) ||
    limitMinutes < 1 ||
    limitMinutes > limitMaximumMinutes(period)
  ) {
    throw new AppError(ERROR_CODES.INVALID_LIMIT);
  }
  const warningMinutes = Math.min(
    Math.max(0, Math.round(Number(input.warningMinutes) || 0)),
    Math.max(0, limitMinutes - 1),
  );
  const siteDomain = normalizeSiteDomain(input.siteDomain);
  if (input.siteDomain && !siteDomain)
    throw new AppError(ERROR_CODES.INVALID_APP_DATA);
  const id = createLimitId(input.appId, siteDomain);
  const previousLimitMinutes =
    previous.limitMinutes ?? previous.dailyLimitMinutes;
  const thresholdChanged =
    previousLimitMinutes !== undefined &&
    (previousLimitMinutes !== limitMinutes ||
      normalizeLimitPeriod(previous.period) !== period);
  const warningThresholdChanged =
    previous.warningMinutes !== undefined &&
    previous.warningMinutes !== warningMinutes;
  return {
    ...previous,
    id,
    appId: input.appId,
    appName: input.appName,
    siteDomain,
    period,
    limitMinutes,
    warningMinutes,
    enabled: input.enabled !== false,
    lastWarningDate:
      thresholdChanged || warningThresholdChanged
        ? null
        : previous.lastWarningDate || null,
    lastReachedDate: thresholdChanged ? null : previous.lastReachedDate || null,
    pausedDate: previous.pausedDate || null,
  };
}

module.exports = {
  CATEGORY_IDS,
  UsageStore,
  addDays,
  enumerateDays,
  guessCategory,
  limitPeriodRange,
  localDay,
  normalizeCategory,
};
