function isLimitNotificationDue(limit, kind, usedSeconds, day) {
  if (!limit?.enabled || limit.pausedDate === day) return false;
  const usedMinutes = Math.max(0, Number(usedSeconds) || 0) / 60;
  if (kind === 'warning') {
    return (
      limit.warningMinutes > 0 &&
      usedMinutes >= limit.dailyLimitMinutes - limit.warningMinutes &&
      usedMinutes < limit.dailyLimitMinutes &&
      limit.lastWarningDate !== day
    );
  }
  if (kind === 'reached') {
    return (
      usedMinutes >= limit.dailyLimitMinutes && limit.lastReachedDate !== day
    );
  }
  return false;
}

function notificationKey(day, limitId, kind) {
  return `${day}:${limitId}:${kind}`;
}

function pruneDayScopedCache(cache, day, maximumSize) {
  const dayPrefix = `${day}:`;
  for (const key of cache.keys()) {
    if (!String(key).startsWith(dayPrefix)) cache.delete(key);
  }
  while (cache.size > maximumSize) {
    cache.delete(cache.keys().next().value);
  }
}

module.exports = {
  isLimitNotificationDue,
  notificationKey,
  pruneDayScopedCache,
};
