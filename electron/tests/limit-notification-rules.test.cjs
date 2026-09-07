const assert = require('node:assert/strict');
const test = require('node:test');
const {
  isLimitNotificationDue,
  notificationKey,
  notificationKeyMatchesLimit,
  notificationKindsResetByLimitChange,
  parseNotificationKey,
  pruneBoundedCache,
} = require('../limit-notification-rules.cjs');

const baseLimit = {
  id: 'example',
  period: 'day',
  limitMinutes: 30,
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

test('weekly and monthly markers are period scoped while pause remains daily', () => {
  const weekKey = '2026-08-03';
  assert.equal(
    isLimitNotificationDue(
      { ...baseLimit, period: 'week', lastWarningDate: weekKey },
      'warning',
      20 * 60,
      '2026-08-09',
      weekKey,
    ),
    false,
  );
  assert.equal(
    isLimitNotificationDue(
      { ...baseLimit, period: 'week', lastWarningDate: weekKey },
      'warning',
      20 * 60,
      '2026-08-10',
      '2026-08-10',
    ),
    true,
  );
  const paused = { ...baseLimit, period: 'month', pausedDate: '2026-08-09' };
  assert.equal(
    isLimitNotificationDue(
      paused,
      'reached',
      30 * 60,
      '2026-08-09',
      '2026-08-01',
    ),
    false,
  );
  assert.equal(
    isLimitNotificationDue(
      paused,
      'reached',
      30 * 60,
      '2026-08-10',
      '2026-08-01',
    ),
    true,
  );
});

test('mixed-period caches retain active scopes and discard oldest entries', () => {
  const cache = new Map([
    [notificationKey('2026-08-08', 'old', 'warning'), 1],
    [notificationKey('2026-08-03', 'weekly', 'warning'), 2],
    [notificationKey('2026-08-01', 'monthly', 'reached'), 3],
  ]);
  pruneBoundedCache(cache, 2);
  assert.deepEqual(
    [...cache.keys()],
    [
      notificationKey('2026-08-03', 'weekly', 'warning'),
      notificationKey('2026-08-01', 'monthly', 'reached'),
    ],
  );
  assert.equal(
    notificationKeyMatchesLimit(
      notificationKey('2026-08-03', 'app:with:colons', 'warning'),
      'app:with:colons',
    ),
    true,
  );
  assert.deepEqual(
    parseNotificationKey(
      notificationKey('2026-08-03', 'app:with:colons', 'warning'),
    ),
    {
      periodKey: '2026-08-03',
      limitId: 'app:with:colons',
      kind: 'warning',
    },
  );
  assert.equal(parseNotificationKey('not-json'), null);
  assert.equal(
    parseNotificationKey(JSON.stringify(['2026-08-03', 'app', 'unknown'])),
    null,
  );
});

test('only threshold edits reset their matching notification dedupe', () => {
  assert.deepEqual(
    notificationKindsResetByLimitChange(baseLimit, {
      ...baseLimit,
      enabled: false,
    }),
    [],
  );
  assert.deepEqual(
    notificationKindsResetByLimitChange(baseLimit, {
      ...baseLimit,
      warningMinutes: 5,
    }),
    ['warning'],
  );
  assert.deepEqual(
    notificationKindsResetByLimitChange(baseLimit, {
      ...baseLimit,
      limitMinutes: 60,
    }),
    ['warning', 'reached'],
  );
  assert.deepEqual(
    notificationKindsResetByLimitChange(baseLimit, {
      ...baseLimit,
      period: 'week',
    }),
    ['warning', 'reached'],
  );
});
