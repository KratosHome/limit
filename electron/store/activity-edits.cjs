const crypto = require('node:crypto');
const { AppError, ERROR_CODES } = require('../errors.cjs');
const { getOwn, normalizeSiteDomain } = require('./data-model.cjs');
const {
  addDays,
  enumerateDays,
  limitPeriodRange,
  localDay,
} = require('./date-utils.cjs');
const { getCurrentLimitUsage } = require('./usage-queries.cjs');

function validateActivityAppId(appId) {
  if (
    typeof appId !== 'string' ||
    !appId.trim() ||
    appId.length > 512 ||
    [...appId].some(
      (character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    throw new AppError(ERROR_CODES.INVALID_ACTIVITY);
}

function activityDayStart(day) {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day))
    throw new AppError(ERROR_CODES.INVALID_ACTIVITY);
  const date = new Date(`${day}T00:00:00`);
  if (!Number.isFinite(date.getTime()) || localDay(date) !== day)
    throw new AppError(ERROR_CODES.INVALID_ACTIVITY);
  return date;
}

function activityDaySeconds(day) {
  const start = activityDayStart(day);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return (end.getTime() - start.getTime()) / 1000;
}

function activityRevision(day, entry) {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify([
        day,
        entry.id,
        entry.name,
        entry.category,
        entry.executablePath || null,
        entry.seconds,
        entry.launches,
        entry.lastTitle || '',
        entry.lastSeenAt || null,
        Object.entries(entry.hourly || {}).sort(
          ([left], [right]) => Number(left) - Number(right),
        ),
        Object.values(entry.sites || {})
          .map((site) => [site.domain, site.seconds, site.lastSeenAt || null])
          .sort(([left], [right]) =>
            left < right ? -1 : left > right ? 1 : 0,
          ),
      ]),
    )
    .digest('hex');
}

function activityDaySummary(day, entry) {
  return {
    day,
    appId: entry.id,
    name: entry.name,
    seconds: entry.seconds,
    revision: activityRevision(day, entry),
  };
}

function getActivityDays(data, appId, range) {
  validateActivityAppId(appId);
  activityDayStart(range?.from);
  activityDayStart(range?.to);
  if (range.from > range.to || range.to > addDays(range.from, 369))
    throw new AppError(ERROR_CODES.INVALID_ACTIVITY);
  return enumerateDays(range.from, range.to)
    .reverse()
    .flatMap((day) => {
      const entry = getOwn(getOwn(data.usageByDay, day), appId);
      return entry ? [activityDaySummary(day, entry)] : [];
    });
}

function getActivityForMutation(data, input, { edit = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new AppError(ERROR_CODES.INVALID_ACTIVITY);
  validateActivityAppId(input.appId);
  const maximumSeconds = activityDaySeconds(input.day);
  if (
    typeof input.expectedRevision !== 'string' ||
    !/^[a-f0-9]{64}$/.test(input.expectedRevision) ||
    (edit &&
      (!Number.isFinite(input.seconds) ||
        input.seconds < 0 ||
        input.seconds > maximumSeconds))
  )
    throw new AppError(ERROR_CODES.INVALID_ACTIVITY);
  const entry = getOwn(getOwn(data.usageByDay, input.day), input.appId);
  if (!entry) throw new AppError(ERROR_CODES.ACTIVITY_NOT_FOUND);
  if (activityRevision(input.day, entry) !== input.expectedRevision)
    throw new AppError(ERROR_CODES.ACTIVITY_CONFLICT);
  return entry;
}

// Assign the floating-point remainder to the final bucket so its sum stays at target.
function distributeSeconds(weights, target) {
  const total = weights.reduce((sum, value) => sum + value, 0);
  let remaining = target;
  return weights.map((weight, index) => {
    const value =
      index === weights.length - 1
        ? remaining
        : total > 0
          ? Math.min(remaining, target * (weight / total))
          : 0;
    remaining = Math.max(0, remaining - value);
    return value;
  });
}

function scaleActivityEntry(entry, seconds) {
  let hours = Object.entries(entry.hourly || {}).filter(
    ([hour, value]) =>
      /^(?:[0-9]|1[0-9]|2[0-3])$/.test(hour) &&
      Number.isFinite(value) &&
      value >= 0,
  );
  if (!hours.some(([, value]) => value > 0)) {
    const lastSeen = new Date(entry.lastSeenAt);
    const hour = Number.isFinite(lastSeen.getTime()) ? lastSeen.getHours() : 12;
    hours = [[String(hour), 1]];
  }
  const hourlySeconds = distributeSeconds(
    hours.map(([, value]) => value),
    seconds,
  );
  const sites = Object.values(entry.sites || {}).filter(
    (site) =>
      normalizeSiteDomain(site?.domain) &&
      Number.isFinite(site.seconds) &&
      site.seconds >= 0,
  );
  const oldSiteSeconds = sites.reduce((sum, site) => sum + site.seconds, 0);
  const siteTarget =
    entry.seconds > 0
      ? seconds * Math.min(1, oldSiteSeconds / entry.seconds)
      : 0;
  const siteSeconds = distributeSeconds(
    sites.map((site) => site.seconds),
    siteTarget,
  );
  return {
    ...entry,
    seconds,
    hourly: Object.fromEntries(
      hours.map(([hour], index) => [hour, hourlySeconds[index]]),
    ),
    sites: Object.fromEntries(
      sites.map((site, index) => [
        site.domain,
        { ...site, seconds: siteSeconds[index] },
      ]),
    ),
  };
}

function rearmActivityLimits(data, day, previousEntry, nextEntry, now) {
  const today = localDay(now);
  return Object.values(data.limits).flatMap((limit) => {
    if (limit.appId !== previousEntry.id) return [];
    const { from, key } = limitPeriodRange(limit.period, now);
    if (day < from || day > today) return [];
    const domain = normalizeSiteDomain(limit.siteDomain);
    if (limit.siteDomain && !domain) return [];
    const previousSeconds = domain
      ? getOwn(previousEntry.sites, domain)?.seconds || 0
      : previousEntry.seconds;
    const nextSeconds = domain
      ? getOwn(nextEntry?.sites, domain)?.seconds || 0
      : nextEntry?.seconds || 0;
    if (nextSeconds >= previousSeconds) return [];
    const usage = Math.max(
      0,
      getCurrentLimitUsage(data, limit, now) - previousSeconds + nextSeconds,
    );
    const resetWarning =
      limit.lastWarningDate === key &&
      limit.warningMinutes > 0 &&
      usage < (limit.limitMinutes - limit.warningMinutes) * 60;
    const resetReached =
      limit.lastReachedDate === key && usage < limit.limitMinutes * 60;
    if (!resetWarning && !resetReached) return [];
    return [
      {
        ...limit,
        lastWarningDate: resetWarning ? null : limit.lastWarningDate,
        lastReachedDate: resetReached ? null : limit.lastReachedDate,
      },
    ];
  });
}

module.exports = {
  activityDaySummary,
  getActivityDays,
  getActivityForMutation,
  rearmActivityLimits,
  scaleActivityEntry,
};
