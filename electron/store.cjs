const fs = require('node:fs');
const path = require('node:path');

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

function localDay(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

function normalizeData(value) {
  const fallback = cloneDefaultData();
  if (!value || typeof value !== 'object') return fallback;
  const settings =
    value.settings && typeof value.settings === 'object' ? value.settings : {};
  return {
    ...fallback,
    ...value,
    schemaVersion: Math.max(
      DEFAULT_DATA.schemaVersion,
      Number.isInteger(value.schemaVersion) ? value.schemaVersion : 1,
    ),
    usageByDay:
      value.usageByDay && typeof value.usageByDay === 'object'
        ? value.usageByDay
        : {},
    limits:
      value.limits && typeof value.limits === 'object' ? value.limits : {},
    settings: {
      ...fallback.settings,
      ...settings,
      websiteTrackingEnabled: settings.websiteTrackingEnabled === true,
    },
  };
}

function parseDay(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function addDays(value, amount) {
  const date = parseDay(value);
  date.setDate(date.getDate() + amount);
  return localDay(date);
}

function enumerateDays(from, to) {
  const days = [];
  let cursor = from;
  while (cursor <= to && days.length < 370) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}

class UsageStore {
  constructor(filePath, options = {}) {
    this.filePath = filePath;
    this.persistDelay = options.persistDelay ?? 600;
    this.data = cloneDefaultData();
    this.writeTimer = null;
    this.lastPersistenceError = null;
    this.recoveryCreated = false;
    this.writeBlocked = false;
    this.load();
  }

  load() {
    try {
      if (!fs.existsSync(this.filePath)) return;
      this.data = normalizeData(
        JSON.parse(fs.readFileSync(this.filePath, 'utf8')),
      );
    } catch (error) {
      console.warn(
        'Не вдалося прочитати локальну історію Limit:',
        error.message,
      );
      try {
        const recoveryPath = `${this.filePath}.corrupt-${Date.now()}`;
        fs.copyFileSync(this.filePath, recoveryPath);
        this.recoveryCreated = true;
      } catch (backupError) {
        console.error(
          'Не вдалося створити резервну копію пошкодженої історії:',
          backupError.message,
        );
        this.writeBlocked = true;
      }
      this.lastPersistenceError =
        'Не вдалося прочитати локальну історію. Створено резервну копію для відновлення.';
      this.data = cloneDefaultData();
    }
  }

  schedulePersist() {
    if (this.writeBlocked) return;
    if (this.writeTimer) return;
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      this.persistNow();
    }, this.persistDelay);
  }

  persistNow() {
    if (this.writeBlocked) return false;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      const tempPath = `${this.filePath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(this.data, null, 2));
      fs.renameSync(tempPath, this.filePath);
      if (!this.recoveryCreated) this.lastPersistenceError = null;
      return true;
    } catch (error) {
      this.lastPersistenceError = `Не вдалося зберегти історію: ${error.message}`;
      console.error(this.lastPersistenceError);
      return false;
    }
  }

  close() {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
    this.persistNow();
  }

  getSettings() {
    return { ...this.data.settings };
  }

  getStorageStatus() {
    return {
      error: this.lastPersistenceError,
      recoveryCreated: this.recoveryCreated,
    };
  }

  updateSettings(patch) {
    const allowed = {};
    if (typeof patch.trackingEnabled === 'boolean')
      allowed.trackingEnabled = patch.trackingEnabled;
    if (typeof patch.websiteTrackingEnabled === 'boolean')
      allowed.websiteTrackingEnabled = patch.websiteTrackingEnabled;
    if (typeof patch.launchAtLogin === 'boolean')
      allowed.launchAtLogin = patch.launchAtLogin;
    if (Number.isFinite(patch.idleThresholdSeconds)) {
      allowed.idleThresholdSeconds = Math.min(
        3600,
        Math.max(15, Math.round(patch.idleThresholdSeconds)),
      );
    }
    this.data.settings = { ...this.data.settings, ...allowed };
    this.schedulePersist();
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
    const entry = (day[sample.id] ||= {
      id: sample.id,
      name: sample.name,
      category: guessCategory(sample.name),
      seconds: 0,
      launches: 0,
      hourly: {},
      sites: {},
      lastTitle: '',
      lastSeenAt: null,
    });
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

    const domain = this.data.settings.websiteTrackingEnabled
      ? normalizeSiteDomain(sample.site?.domain)
      : null;
    if (domain) {
      if (
        !entry.sites ||
        typeof entry.sites !== 'object' ||
        Array.isArray(entry.sites)
      )
        entry.sites = {};
      const existingSite = Object.prototype.hasOwnProperty.call(
        entry.sites,
        domain,
      )
        ? entry.sites[domain]
        : null;
      const site =
        existingSite && typeof existingSite === 'object'
          ? existingSite
          : {
              domain,
              seconds: 0,
              lastSeenAt: null,
            };
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
    }
    this.schedulePersist();
  }

  getTodayUsage(appId, date = new Date()) {
    return this.data.usageByDay[localDay(date)]?.[appId]?.seconds || 0;
  }

  getKnownApps() {
    const apps = new Map();
    for (const day of Object.values(this.data.usageByDay)) {
      for (const entry of Object.values(day)) {
        const previous = apps.get(entry.id);
        if (
          !previous ||
          (entry.lastSeenAt || '') > (previous.lastSeenAt || '')
        ) {
          apps.set(entry.id, {
            id: entry.id,
            name: entry.name,
            category: entry.category || guessCategory(entry.name),
            lastSeenAt: entry.lastSeenAt || null,
          });
        }
      }
    }
    for (const limit of Object.values(this.data.limits)) {
      if (!apps.has(limit.appId)) {
        apps.set(limit.appId, {
          id: limit.appId,
          name: limit.appName,
          category: guessCategory(limit.appName),
          lastSeenAt: null,
        });
      }
    }
    return [...apps.values()].sort((a, b) =>
      a.name.localeCompare(b.name, 'uk'),
    );
  }

  getAppIconSource(appId) {
    if (typeof appId !== 'string' || !appId) return null;
    let tracked = false;
    let name = null;
    let nameLastSeenAt = '';
    let executablePath = null;
    let pathLastSeenAt = '';
    for (const day of Object.values(this.data.usageByDay)) {
      const entry = day?.[appId];
      if (!entry) continue;
      tracked = true;
      const lastSeenAt = entry.lastSeenAt || '';
      if (typeof entry.name === 'string' && lastSeenAt >= nameLastSeenAt) {
        name = entry.name;
        nameLastSeenAt = lastSeenAt;
      }
      if (
        typeof entry.executablePath === 'string' &&
        entry.executablePath &&
        entry.executablePath.length <= 4096 &&
        path.isAbsolute(entry.executablePath) &&
        lastSeenAt >= pathLastSeenAt
      ) {
        executablePath = entry.executablePath;
        pathLastSeenAt = lastSeenAt;
      }
    }
    if (!name) name = this.data.limits[appId]?.appName || null;
    return name ? { appId, appName: name, executablePath, tracked } : null;
  }

  getLimits() {
    return Object.values(this.data.limits).map((limit) => ({ ...limit }));
  }

  saveLimit(input) {
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
    const previous = this.data.limits[input.appId] || {};
    const thresholdChanged =
      previous.dailyLimitMinutes !== undefined &&
      previous.dailyLimitMinutes !== dailyLimitMinutes;
    const limit = {
      ...previous,
      appId: input.appId,
      appName: input.appName,
      dailyLimitMinutes,
      warningMinutes,
      enabled: input.enabled !== false,
      lastWarningDate: thresholdChanged
        ? null
        : previous.lastWarningDate || null,
      lastReachedDate: thresholdChanged
        ? null
        : previous.lastReachedDate || null,
      pausedDate: previous.pausedDate || null,
    };
    this.data.limits[input.appId] = limit;
    this.schedulePersist();
    return { ...limit };
  }

  deleteLimit(appId) {
    delete this.data.limits[appId];
    this.schedulePersist();
  }

  pauseLimitToday(appId, date = new Date()) {
    const limit = this.data.limits[appId];
    if (!limit) return null;
    limit.pausedDate = localDay(date);
    this.schedulePersist();
    return { ...limit };
  }

  markLimitNotification(appId, kind, date = new Date()) {
    const limit = this.data.limits[appId];
    if (!limit) return;
    const key = kind === 'warning' ? 'lastWarningDate' : 'lastReachedDate';
    limit[key] = localDay(date);
    this.schedulePersist();
  }

  getLimit(appId) {
    const limit = this.data.limits[appId];
    return limit ? { ...limit } : null;
  }

  aggregate(from, to) {
    const days = enumerateDays(from, to);
    const appMap = new Map();
    const hourly = Array.from({ length: 24 }, (_, hour) => ({
      key: String(hour),
      seconds: 0,
    }));
    const daily = [];

    for (const dayKey of days) {
      let daySeconds = 0;
      const entries = this.data.usageByDay[dayKey] || {};
      for (const entry of Object.values(entries)) {
        const category = entry.category || guessCategory(entry.name);
        const aggregate = appMap.get(entry.id) || {
          id: entry.id,
          name: entry.name,
          category,
          seconds: 0,
          launches: 0,
          lastTitle: entry.lastTitle || '',
          lastSeenAt: entry.lastSeenAt || null,
          isBrowser: category === 'Браузер',
          sites: new Map(),
        };
        if (category === 'Браузер') aggregate.isBrowser = true;
        aggregate.seconds += entry.seconds || 0;
        aggregate.launches += entry.launches || 0;
        if ((entry.lastSeenAt || '') > (aggregate.lastSeenAt || '')) {
          aggregate.lastSeenAt = entry.lastSeenAt;
          aggregate.lastTitle = entry.lastTitle || aggregate.lastTitle;
        }
        if (
          entry.sites &&
          typeof entry.sites === 'object' &&
          !Array.isArray(entry.sites)
        ) {
          for (const siteEntry of Object.values(entry.sites)) {
            if (!siteEntry || typeof siteEntry !== 'object') continue;
            const domain = normalizeSiteDomain(siteEntry.domain);
            const siteSeconds = Number.isFinite(siteEntry.seconds)
              ? Math.max(0, siteEntry.seconds)
              : 0;
            if (!domain || siteSeconds <= 0) continue;
            const siteAggregate = aggregate.sites.get(domain) || {
              domain,
              seconds: 0,
              lastSeenAt: null,
            };
            siteAggregate.seconds += siteSeconds;
            if (
              (siteEntry.lastSeenAt || '') > (siteAggregate.lastSeenAt || '')
            ) {
              siteAggregate.lastSeenAt = siteEntry.lastSeenAt;
            }
            aggregate.sites.set(domain, siteAggregate);
          }
        }
        appMap.set(entry.id, aggregate);
        daySeconds += entry.seconds || 0;
        for (const [hour, seconds] of Object.entries(entry.hourly || {})) {
          if (hourly[Number(hour)])
            hourly[Number(hour)].seconds += seconds || 0;
        }
      }
      daily.push({ key: dayKey, seconds: daySeconds });
    }

    const apps = [...appMap.values()]
      .map((entry) => {
        const limit = this.data.limits[entry.id];
        const sites = [...entry.sites.values()]
          .sort(
            (a, b) => b.seconds - a.seconds || a.domain.localeCompare(b.domain),
          )
          .map(({ domain, seconds }) => ({ domain, seconds }));
        const { sites: _siteMap, ...app } = entry;
        return {
          ...app,
          sites,
          limitMinutes: limit?.dailyLimitMinutes ?? null,
          limitEnabled: limit?.enabled ?? false,
        };
      })
      .sort((a, b) => b.seconds - a.seconds);

    const totalSeconds = apps.reduce((sum, app) => sum + app.seconds, 0);
    const timeline = days.length <= 1 ? hourly : daily;
    return { apps, totalSeconds, timeline, days };
  }

  getDashboard(from, to, now = new Date()) {
    const current = this.aggregate(from, to);
    const today = localDay(now);
    const todayAggregate = this.aggregate(today, today);
    const dayCount = current.days.length;
    const previousTo = addDays(from, -1);
    const previousFrom = addDays(previousTo, -(dayCount - 1));
    const previousTotalSeconds = this.aggregate(
      previousFrom,
      previousTo,
    ).totalSeconds;
    return {
      ...current,
      previousTotalSeconds,
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

module.exports = {
  UsageStore,
  addDays,
  enumerateDays,
  guessCategory,
  localDay,
};
