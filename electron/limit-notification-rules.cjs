function isLimitNotificationDue(
  limit,
  kind,
  usedSeconds,
  dayKey,
  periodKey = dayKey,
) {
  if (!limit?.enabled || limit.pausedDate === dayKey) return false;
  const usedMinutes = Math.max(0, Number(usedSeconds) || 0) / 60;
  if (kind === 'warning') {
    return (
      limit.warningMinutes > 0 &&
      usedMinutes >= limit.limitMinutes - limit.warningMinutes &&
      usedMinutes < limit.limitMinutes &&
      limit.lastWarningDate !== periodKey
    );
  }
  if (kind === 'reached') {
    return (
      usedMinutes >= limit.limitMinutes && limit.lastReachedDate !== periodKey
    );
  }
  return false;
}

function notificationKey(periodKey, limitId, kind) {
  return JSON.stringify([periodKey, limitId, kind]);
}

function parseNotificationKey(key) {
  try {
    const parts = JSON.parse(String(key));
    if (
      !Array.isArray(parts) ||
      parts.length !== 3 ||
      parts.some((part) => typeof part !== 'string') ||
      (parts[2] !== 'warning' && parts[2] !== 'reached')
    )
      return null;
    return { periodKey: parts[0], limitId: parts[1], kind: parts[2] };
  } catch {
    return null;
  }
}

function notificationKeyMatchesLimit(key, limitId) {
  return parseNotificationKey(key)?.limitId === limitId;
}

function notificationKindsResetByLimitChange(previous, next) {
  if (!previous) return ['warning', 'reached'];
  const thresholdChanged =
    previous.period !== next.period ||
    previous.limitMinutes !== next.limitMinutes;
  if (thresholdChanged) return ['warning', 'reached'];
  return previous.warningMinutes !== next.warningMinutes ? ['warning'] : [];
}

function pruneBoundedCache(cache, maximumSize) {
  while (cache.size > maximumSize) {
    cache.delete(cache.keys().next().value);
  }
}

module.exports = {
  isLimitNotificationDue,
  notificationKey,
  notificationKeyMatchesLimit,
  notificationKindsResetByLimitChange,
  parseNotificationKey,
  pruneBoundedCache,
};
