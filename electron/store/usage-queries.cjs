const path = require('node:path');
const {
  enumerateDays,
  limitPeriodRange,
  localDay,
} = require('./date-utils.cjs');
const {
  getOwn,
  guessCategory,
  normalizeCategory,
  normalizeSiteDomain,
} = require('./data-model.cjs');

function compareText(left, right) {
  const normalizedLeft = String(left).normalize('NFC').toLowerCase();
  const normalizedRight = String(right).normalize('NFC').toLowerCase();
  if (normalizedLeft < normalizedRight) return -1;
  if (normalizedLeft > normalizedRight) return 1;
  const originalLeft = String(left).normalize('NFC');
  const originalRight = String(right).normalize('NFC');
  return originalLeft < originalRight
    ? -1
    : originalLeft > originalRight
      ? 1
      : 0;
}

function getKnownApps(data) {
  const apps = new Map();
  for (const day of Object.values(data.usageByDay)) {
    for (const entry of Object.values(day)) {
      const previous = apps.get(entry.id);
      const sites = new Set(previous?.sites || []);
      for (const site of Object.values(entry.sites || {})) {
        const domain = normalizeSiteDomain(site?.domain);
        if (domain) sites.add(domain);
      }
      if (!previous || (entry.lastSeenAt || '') > (previous.lastSeenAt || '')) {
        apps.set(entry.id, {
          id: entry.id,
          name: entry.name,
          category: normalizeCategory(entry.category, entry.name),
          lastSeenAt: entry.lastSeenAt || null,
          sites: [...sites],
        });
      } else if (sites.size !== previous.sites.length) {
        previous.sites = [...sites];
      }
    }
  }
  for (const limit of Object.values(data.limits)) {
    const previous = apps.get(limit.appId);
    if (!previous) {
      apps.set(limit.appId, {
        id: limit.appId,
        name: limit.appName,
        category: guessCategory(limit.appName),
        lastSeenAt: null,
        sites: limit.siteDomain ? [limit.siteDomain] : [],
      });
    } else if (limit.siteDomain && !previous.sites.includes(limit.siteDomain)) {
      previous.sites.push(limit.siteDomain);
    }
  }
  return [...apps.values()]
    .map((entry) => ({ ...entry, sites: entry.sites.sort(compareText) }))
    .sort((a, b) => compareText(a.name, b.name));
}

function getAppIconSource(data, appId) {
  if (typeof appId !== 'string' || !appId) return null;
  let tracked = false;
  let name = null;
  let nameLastSeenAt = '';
  let executablePath = null;
  let pathLastSeenAt = '';
  for (const day of Object.values(data.usageByDay)) {
    const entry = getOwn(day, appId);
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
  if (!name) {
    name =
      Object.values(data.limits).find((limit) => limit.appId === appId)
        ?.appName || null;
  }
  return name ? { appId, appName: name, executablePath, tracked } : null;
}

function getCurrentLimitUsage(data, limit, date = new Date()) {
  if (!limit || typeof limit.appId !== 'string' || !limit.appId) return 0;
  const { from } = limitPeriodRange(limit.period, date);
  const to = localDay(date);
  const hasSiteTarget = Boolean(limit.siteDomain);
  const siteDomain = normalizeSiteDomain(limit.siteDomain);
  if (hasSiteTarget && !siteDomain) return 0;
  let seconds = 0;
  for (const dayKey of enumerateDays(from, to)) {
    const entry = getOwn(data.usageByDay[dayKey], limit.appId);
    const rawSeconds = siteDomain
      ? getOwn(entry?.sites, siteDomain)?.seconds
      : entry?.seconds;
    if (Number.isFinite(rawSeconds)) seconds += Math.max(0, rawSeconds);
  }
  return seconds;
}

function aggregateUsage(data, from, to) {
  const days = enumerateDays(from, to);
  const appMap = new Map();
  const hourly = Array.from({ length: 24 }, (_, hour) => ({
    key: String(hour),
    seconds: 0,
  }));
  const hourlyApps = Array.from({ length: 24 }, () => new Map());
  const daily = [];

  for (const dayKey of days) {
    let daySeconds = 0;
    const entries = data.usageByDay[dayKey] || {};
    for (const entry of Object.values(entries)) {
      const category = normalizeCategory(entry.category, entry.name);
      const aggregate = appMap.get(entry.id) || {
        id: entry.id,
        name: entry.name,
        category,
        seconds: 0,
        launches: 0,
        lastTitle: entry.lastTitle || '',
        lastSeenAt: entry.lastSeenAt || null,
        isBrowser: category === 'browser',
        sites: new Map(),
      };
      if (category === 'browser') aggregate.isBrowser = true;
      aggregate.seconds += entry.seconds || 0;
      aggregate.launches += entry.launches || 0;
      if ((entry.lastSeenAt || '') > (aggregate.lastSeenAt || '')) {
        aggregate.lastSeenAt = entry.lastSeenAt;
        aggregate.lastTitle = entry.lastTitle || aggregate.lastTitle;
      }
      aggregateSites(aggregate.sites, entry.sites);
      appMap.set(entry.id, aggregate);
      daySeconds += entry.seconds || 0;
      aggregateHours(hourly, hourlyApps, entry);
    }
    daily.push({ key: dayKey, seconds: daySeconds });
  }

  const apps = [...appMap.values()]
    .map((entry) => mapAppAggregate(data.limits, entry))
    .sort((a, b) => b.seconds - a.seconds);
  const totalSeconds = apps.reduce((sum, app) => sum + app.seconds, 0);
  const hourlyTimeline = hourly.map((point, hour) => ({
    ...point,
    apps: [...hourlyApps[hour].values()].sort(
      (a, b) => b.seconds - a.seconds || compareText(a.name, b.name),
    ),
  }));
  return {
    apps,
    totalSeconds,
    timeline: days.length <= 1 ? hourlyTimeline : daily,
    days,
  };
}

function aggregateSites(siteMap, sites) {
  if (!sites || typeof sites !== 'object' || Array.isArray(sites)) return;
  for (const siteEntry of Object.values(sites)) {
    if (!siteEntry || typeof siteEntry !== 'object') continue;
    const domain = normalizeSiteDomain(siteEntry.domain);
    const siteSeconds = Number.isFinite(siteEntry.seconds)
      ? Math.max(0, siteEntry.seconds)
      : 0;
    if (!domain || siteSeconds <= 0) continue;
    const siteAggregate = siteMap.get(domain) || {
      domain,
      seconds: 0,
      lastSeenAt: null,
    };
    siteAggregate.seconds += siteSeconds;
    if ((siteEntry.lastSeenAt || '') > (siteAggregate.lastSeenAt || '')) {
      siteAggregate.lastSeenAt = siteEntry.lastSeenAt;
    }
    siteMap.set(domain, siteAggregate);
  }
}

function aggregateHours(hourly, hourlyApps, entry) {
  for (const [hour, seconds] of Object.entries(entry.hourly || {})) {
    const hourIndex = Number(hour);
    const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    if (!hourly[hourIndex] || safeSeconds <= 0) continue;
    hourly[hourIndex].seconds += safeSeconds;
    const appUsage = hourlyApps[hourIndex].get(entry.id) || {
      id: entry.id,
      name: entry.name,
      seconds: 0,
    };
    appUsage.seconds += safeSeconds;
    hourlyApps[hourIndex].set(entry.id, appUsage);
  }
}

function mapAppAggregate(limits, entry) {
  const limit = getOwn(limits, entry.id);
  const sites = [...entry.sites.values()]
    .sort((a, b) => b.seconds - a.seconds || compareText(a.domain, b.domain))
    .map(({ domain, seconds }) => ({ domain, seconds }));
  const { sites: _siteMap, ...app } = entry;
  return {
    ...app,
    sites,
    limitMinutes: limit?.limitMinutes ?? null,
    limitPeriod: limit?.period ?? null,
    limitEnabled: limit?.enabled ?? false,
  };
}

module.exports = {
  aggregateUsage,
  compareText,
  getAppIconSource,
  getCurrentLimitUsage,
  getKnownApps,
};
