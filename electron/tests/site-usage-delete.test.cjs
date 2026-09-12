const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { UsageStore } = require('../store.cjs');
const { isLimitNotificationDue } = require('../limit-notification-rules.cjs');

const appId = 'com.example.Browser';
const domain = 'example.com';
const now = new Date(2026, 8, 9, 12);
const range = { from: '2026-09-07', to: '2026-09-09' };
const input = { appId, domain, range };

function setup(t) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'limit-site-delete-'),
  );
  const databasePath = path.join(directory, 'usage.sqlite3');
  const stores = [];
  function openStore() {
    const store = new UsageStore(databasePath);
    stores.push(store);
    return store;
  }
  const store = openStore();
  store.updateSettings({ websiteTrackingEnabled: true });
  t.after(() => {
    for (const opened of stores) opened.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return { store, openStore };
}

function sample(store, day, seconds = 120, siteDomain = domain, id = appId) {
  store.recordSample(
    { id, name: 'Example Browser', site: { domain: siteDomain } },
    seconds,
    true,
    new Date(`${day}T10:00:00`),
  );
}

function limit(
  store,
  { id = appId, siteDomain = domain, period = 'day' } = {},
) {
  return store.saveLimit({
    appId: id,
    appName: 'Example Browser',
    siteDomain,
    period,
    limitMinutes: 10,
    warningMinutes: 2,
  });
}

function markBoth(store, target, date = now) {
  store.markLimitNotification(target.id, 'warning', date);
  store.markLimitNotification(target.id, 'reached', date);
  return store.getLimit(target.id);
}

test('deleting site usage changes only the exact app/domain in the inclusive range and persists', (t) => {
  const { store, openStore } = setup(t);
  for (const day of [
    '2026-09-06',
    range.from,
    '2026-09-08',
    range.to,
    '2026-09-10',
  ]) {
    sample(store, day);
    sample(store, day, 30, 'second.example');
    sample(store, day, 50, domain, 'other-browser');
  }
  const original = structuredClone(store.data);
  const expected = structuredClone(original);
  for (const day of [range.from, '2026-09-08', range.to]) {
    delete expected.usageByDay[day][appId].sites[domain];
  }

  assert.equal(store.deleteSiteUsage(input, now), true);
  assert.deepEqual(store.data, expected);
  assert.equal(store.aggregate(range.from, range.to).totalSeconds, 600);
  assert.equal(
    store.database
      .prepare(
        'SELECT count(*) AS count FROM site_usage WHERE app_id = ? AND domain = ?',
      )
      .get(appId, domain).count,
    2,
  );
  store.close();
  assert.deepEqual(openStore().data, expected);
});

test('site deletion clears the known-app cache and a future visit starts fresh site time', (t) => {
  const { store, openStore } = setup(t);
  sample(store, range.to);
  assert.deepEqual(store.getKnownApps()[0].sites, [domain]);
  const previousRevision = store.getActivityDays(appId, range)[0].revision;
  assert.equal(
    store.deleteSiteUsage({ ...input, domain: ' WWW.Example.COM. ' }, now),
    true,
  );
  assert.deepEqual(store.getKnownApps()[0].sites, []);
  assert.notEqual(
    store.getActivityDays(appId, range)[0].revision,
    previousRevision,
  );
  assert.equal(store.deleteSiteUsage(input, now), false);
  assert.equal(
    store.deleteSiteUsage({ ...input, appId: 'missing' }, now),
    false,
  );

  sample(store, range.to, 15);
  const entry = store.data.usageByDay[range.to][appId];
  assert.equal(entry.seconds, 135);
  assert.equal(entry.hourly[10], 135);
  assert.equal(entry.launches, 2);
  assert.equal(entry.sites[domain].seconds, 15);
  assert.deepEqual(store.getKnownApps()[0].sites, [domain]);
  store.close();
  assert.equal(openStore().getTodaySiteUsage(appId, domain, now), 15);
});

test('invalid or hostile site deletion input is rejected before mutation', (t) => {
  const { store } = setup(t);
  sample(store, range.to);
  const original = structuredClone(store.data);
  for (const value of [
    null,
    [],
    'input',
    {},
    ...['', ' ', 'a'.repeat(513), 'bad\u0000id', 42].map((appId) => ({
      ...input,
      appId,
    })),
    ...[
      '',
      'https://example.com',
      "example.com'; DELETE FROM site_usage; --",
      '__proto__',
      'a'.repeat(254),
      'example.com\u0000',
      null,
      {},
    ].map((domain) => ({ ...input, domain })),
    ...[
      null,
      [],
      {},
      { from: range.from },
      { from: '2026-02-30', to: range.to },
      { from: '2026-9-7', to: range.to },
      { from: range.to, to: range.from },
      { from: '2025-01-01', to: '2026-01-06' },
      { from: "2026-09-07' OR 1=1 --", to: range.to },
    ].map((range) => ({ ...input, range })),
  ]) {
    assert.throws(() => store.deleteSiteUsage(value, now), {
      code: 'invalidActivity',
    });
  }
  assert.deepEqual(store.data, original);
  assert.equal(
    store.deleteSiteUsage(
      { ...input, range: { from: '2025-01-01', to: '2026-01-05' } },
      now,
    ),
    false,
  );
  assert.equal(
    store.database.prepare('SELECT count(*) AS count FROM site_usage').get()
      .count,
    1,
  );
});

test('quoted and prototype-named app IDs remain literal deletion targets', (t) => {
  const { store } = setup(t);
  sample(store, range.to);
  for (const id of [
    "'; DELETE FROM site_usage; --",
    '__proto__',
    'constructor',
  ]) {
    sample(store, range.to, 40, domain, id);
    sample(store, range.to, 20, 'second.example', id);
    assert.equal(store.deleteSiteUsage({ ...input, appId: id }, now), true);
    assert.equal(store.getTodayUsage(id, now), 60);
    assert.equal(store.getTodaySiteUsage(id, 'second.example', now), 20);
  }
  assert.equal(store.getTodaySiteUsage(appId, domain, now), 120);
});

for (const period of ['week', 'month']) {
  for (const remaining of [400, 550]) {
    test(`${period} site markers rearm from the final multi-day total of ${remaining} seconds`, (t) => {
      const { store, openStore } = setup(t);
      sample(store, range.from);
      sample(store, '2026-09-08');
      sample(store, range.to, remaining);
      sample(store, range.to, 600, 'second.example');
      sample(store, range.to, 600, domain, 'other-browser');
      const target = limit(store, { period });
      const appTarget = limit(store, { siteDomain: null, period });
      const otherSite = limit(store, { siteDomain: 'second.example', period });
      const otherBrowser = limit(store, { id: 'other-browser', period });
      for (const item of [target, appTarget, otherSite, otherBrowser])
        markBoth(store, item);
      store.pauseLimitToday(target.id, now);
      const originalLimits = structuredClone(store.data.limits);

      store.deleteSiteUsage(
        { ...input, range: { from: range.from, to: '2026-09-08' } },
        now,
      );

      const updated = store.getLimit(target.id);
      assert.equal(updated.lastReachedDate, null);
      assert.equal(
        updated.lastWarningDate,
        remaining < 480 ? null : originalLimits[target.id].lastWarningDate,
      );
      assert.equal(updated.pausedDate, range.to);
      const expected = { ...originalLimits, [target.id]: updated };
      assert.deepEqual(store.data.limits, expected);
      assert.equal(store.getCurrentLimitUsage(updated, now), remaining);
      store.close();
      assert.deepEqual(openStore().data.limits, expected);
    });
  }
}

test('deleting historical or future usage preserves current markers outside that limit period', (t) => {
  for (const [period, deletedDay] of [
    ['day', '2026-09-08'],
    ['week', '2026-09-06'],
    ['month', '2026-08-31'],
    ['month', '2026-09-10'],
  ]) {
    const { store } = setup(t);
    sample(store, deletedDay, 600);
    sample(store, range.to, 600);
    const target = limit(store, { period });
    const original = markBoth(store, target);
    store.deleteSiteUsage(
      { ...input, range: { from: deletedDay, to: deletedDay } },
      now,
    );
    assert.deepEqual(store.getLimit(target.id), original);
  }
});

test('site limits survive deletion, retain historical markers, and notify on new visits', (t) => {
  const { store } = setup(t);
  sample(store, range.to, 600);
  const target = limit(store, { period: 'month' });
  store.markLimitNotification(target.id, 'warning', new Date(2026, 7, 9));
  store.markLimitNotification(target.id, 'reached', now);
  store.deleteSiteUsage(input, now);
  assert.equal(store.getLimit(target.id).lastWarningDate, '2026-08-01');
  assert.equal(store.getLimit(target.id).lastReachedDate, null);
  assert.deepEqual(store.getKnownApps()[0].sites, [domain]);
  sample(store, range.to, 600);
  assert.equal(
    isLimitNotificationDue(
      store.getLimit(target.id),
      'reached',
      store.getCurrentLimitUsage(target, now),
      '2026-09-01',
    ),
    true,
  );
});

for (const failure of ['site-delete', 'limit-update']) {
  test(`${failure} failure rolls back all site rows, limit markers, memory and cache`, (t) => {
    const { store, openStore } = setup(t);
    sample(store, range.from, 300);
    sample(store, range.to, 300);
    const target = limit(store, { period: 'week' });
    markBoth(store, target);
    store.getKnownApps();
    const cache = store.knownAppsCache;
    const original = structuredClone(store.data);
    store.database.exec(
      failure === 'site-delete'
        ? `CREATE TRIGGER fail_site_delete BEFORE DELETE ON site_usage WHEN OLD.day = '2026-09-09' BEGIN SELECT RAISE(ABORT, 'test failure'); END`
        : `CREATE TRIGGER fail_site_limit BEFORE UPDATE ON limits BEGIN SELECT RAISE(ABORT, 'test failure'); END`,
    );
    t.mock.method(console, 'error', () => {});
    assert.throws(() => store.deleteSiteUsage(input, now), {
      code: 'storageSave',
    });
    assert.deepEqual(store.data, original);
    assert.equal(store.knownAppsCache, cache);
    assert.equal(
      store.database.prepare('SELECT count(*) AS count FROM site_usage').get()
        .count,
      2,
    );
    store.close();
    assert.deepEqual(openStore().data, original);
  });
}
