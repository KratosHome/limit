const assert = require('node:assert/strict');
const test = require('node:test');
const {
  isLimitNotificationDue,
  notificationKey,
  pruneDayScopedCache,
} = require('../limit-notification-rules.cjs');

const baseLimit = {
  id: 'example',
  dailyLimitMinutes: 30,
  warningMinutes: 10,
  enabled: true,
  pausedDate: null,
  lastWarningDate: null,
  lastReachedDate: null,
};

test('notification rules separate warning and reached thresholds', () => {
  assert.equal(
    isLimitNotificationDue(baseLimit, 'warning', 20 * 60, '2026-08-09'),
    true,
  );
  assert.equal(
    isLimitNotificationDue(baseLimit, 'warning', 30 * 60, '2026-08-09'),
    false,
  );
  assert.equal(
    isLimitNotificationDue(baseLimit, 'reached', 30 * 60, '2026-08-09'),
    true,
  );
});

test('notification rules reject paused, disabled, and already delivered limits', () => {
  const day = '2026-08-09';
  assert.equal(
    isLimitNotificationDue(
      { ...baseLimit, pausedDate: day },
      'warning',
      1200,
      day,
    ),
    false,
  );
  assert.equal(
    isLimitNotificationDue(
      { ...baseLimit, enabled: false },
      'warning',
      1200,
      day,
    ),
    false,
  );
  assert.equal(
    isLimitNotificationDue(
      { ...baseLimit, lastWarningDate: day },
      'warning',
      1200,
      day,
    ),
    false,
  );
});

test('day-scoped caches discard stale and oldest entries', () => {
  const cache = new Map([
    [notificationKey('2026-08-08', 'old', 'warning'), 1],
    [notificationKey('2026-08-09', 'first', 'warning'), 2],
    [notificationKey('2026-08-09', 'second', 'reached'), 3],
  ]);
  pruneDayScopedCache(cache, '2026-08-09', 1);
  assert.deepEqual(
    [...cache.keys()],
    [notificationKey('2026-08-09', 'second', 'reached')],
  );
});
