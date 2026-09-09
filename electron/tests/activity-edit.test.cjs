const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { UsageStore } = require('../store.cjs');
const { isLimitNotificationDue } = require('../limit-notification-rules.cjs');

const appId = 'com.example.Browser';
const day = '2026-09-09';
const range = { from: day, to: day };

function setup(t) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'limit-activity-test-'),
  );
  const databasePath = path.join(directory, 'usage.sqlite3');
  const store = new UsageStore(databasePath);
  store.updateSettings({ websiteTrackingEnabled: true });
  t.after(() => {
    if (store.database) store.close();
    fs.rmSync(directory, { force: true, recursive: true });
  });
  return { store, databasePath };
}

function sample(store, seconds, hour = 10, domain = 'example.com', id = appId) {
  store.recordSample(
    { id, name: 'Example Browser', site: domain ? { domain } : null },
    seconds,
    true,
    new Date(2026, 8, 9, hour),
  );
}

function editInput(store, seconds, id = appId) {
  const entry = store.getActivityDays(id, range)[0];
  return { appId: id, day, seconds, expectedRevision: entry.revision };
}

test('daily activity edits preserve metadata and persist consistent hours, sites and limits', (t) => {
  const { store, databasePath } = setup(t);
  sample(store, 120, 10);
  sample(store, 180, 11, 'second.example');
  sample(store, 100, 12, null);
  const appLimit = store.saveLimit({
    appId,
    appName: 'Browser',
    limitMinutes: 60,
  });
  const siteLimit = store.saveLimit({
    appId,
    appName: 'Browser',
    siteDomain: 'example.com',
    limitMinutes: 30,
  });
  const metadata = store.data.usageByDay[day][appId];
  const original = store.getActivityDays(appId, range)[0];

  const edited = store.updateActivity(editInput(store, 200));

  assert.equal(edited.seconds, 200);
  assert.notEqual(edited.revision, original.revision);
  assert.deepEqual(store.data.usageByDay[day][appId].hourly, {
    10: 60,
    11: 90,
    12: 50,
  });
  assert.equal(
    store.data.usageByDay[day][appId].sites['example.com'].seconds,
    60,
  );
  assert.equal(
    store.data.usageByDay[day][appId].sites['second.example'].seconds,
    90,
  );
  assert.equal(store.data.usageByDay[day][appId].launches, metadata.launches);
  assert.equal(
    store.data.usageByDay[day][appId].lastSeenAt,
    metadata.lastSeenAt,
  );
  assert.equal(store.getDashboard(day, day).totalSeconds, 200);
  assert.equal(
    store
      .aggregate(day, day)
      .timeline.reduce((sum, point) => sum + point.seconds, 0),
    200,
  );
  assert.equal(store.getCurrentLimitUsage(appLimit, new Date(2026, 8, 9)), 200);
  assert.equal(store.getCurrentLimitUsage(siteLimit, new Date(2026, 8, 9)), 60);

  store.close();
  const reopened = new UsageStore(databasePath);
  t.after(() => reopened.close());
  assert.deepEqual(reopened.getActivityDays(appId, range), [edited]);
  assert.equal(
    reopened.data.usageByDay[day][appId].sites['example.com'].seconds,
    60,
  );
  assert.equal(reopened.aggregate(day, day).timeline[11].seconds, 90);
});

test('editing one day/app does not change other days or apps and listing is scoped', (t) => {
  const { store } = setup(t);
  sample(store, 120);
  sample(store, 75, 11, null, 'other');
  store.recordSample(
    { id: appId, name: 'Example Browser' },
    90,
    false,
    new Date(2026, 8, 8, 10),
  );

  store.updateActivity(editInput(store, 60));

  assert.deepEqual(
    store
      .getActivityDays(appId, { from: '2026-09-08', to: day })
      .map((entry) => [entry.day, entry.seconds]),
    [
      [day, 60],
      ['2026-09-08', 90],
    ],
  );
  assert.equal(store.getActivityDays('other', range)[0].seconds, 75);
  assert.equal(store.getActivityDays('missing', range).length, 0);
});

test('a new sample invalidates stale edits and deletes without losing tracked time', (t) => {
  const { store } = setup(t);
  sample(store, 100);
  const input = editInput(store, 30);
  sample(store, 5, 11);

  assert.throws(() => store.updateActivity(input), {
    code: 'activityConflict',
  });
  assert.throws(() => store.deleteActivity(input), {
    code: 'activityConflict',
  });
  assert.equal(store.getActivityDays(appId, range)[0].seconds, 105);

  store.updateActivity(editInput(store, 60));
  sample(store, 5, 12, 'new.example');
  assert.equal(store.getActivityDays(appId, range)[0].seconds, 65);
  assert.equal(
    store.data.usageByDay[day][appId].sites['new.example'].seconds,
    5,
  );
  assert.ok(
    Math.abs(
      store
        .aggregate(day, day)
        .timeline.reduce((sum, point) => sum + point.seconds, 0) - 65,
    ) < 1e-9,
  );
});

test('zero and fractional edits keep hourly and site totals bounded', (t) => {
  const { store } = setup(t);
  sample(store, 1 / 3, 10);
  sample(store, 2 / 3, 11, 'second.example');
  store.updateActivity(editInput(store, 0.1));
  let entry = store.data.usageByDay[day][appId];
  assert.equal(
    Object.values(entry.hourly).reduce((sum, value) => sum + value, 0),
    0.1,
  );
  assert.ok(
    Object.values(entry.sites).reduce((sum, site) => sum + site.seconds, 0) <=
      0.1,
  );

  store.updateActivity(editInput(store, 0));
  store.updateActivity(editInput(store, 60));
  entry = store.data.usageByDay[day][appId];
  assert.equal(
    Object.values(entry.hourly).reduce((sum, value) => sum + value, 0),
    60,
  );
  assert.equal(
    Object.values(entry.sites).reduce((sum, site) => sum + site.seconds, 0),
    0,
  );
});

test('delete removes only its daily app usage and children, retains limits and persists', (t) => {
  const { store, databasePath } = setup(t);
  sample(store, 100);
  sample(store, 75, 11, null, 'other');
  const limit = store.saveLimit({
    appId,
    appName: 'Browser',
    limitMinutes: 60,
  });
  store.getKnownApps();

  assert.equal(store.deleteActivity(editInput(store, 0)), true);

  assert.equal(store.getActivityDays(appId, range).length, 0);
  assert.equal(
    store.database
      .prepare('SELECT count(*) AS count FROM hourly_usage WHERE app_id = ?')
      .get(appId).count,
    0,
  );
  assert.equal(
    store.database
      .prepare('SELECT count(*) AS count FROM site_usage WHERE app_id = ?')
      .get(appId).count,
    0,
  );
  assert.equal(store.aggregate(day, day).totalSeconds, 75);
  assert.deepEqual(store.getLimit(limit.id), limit);
  assert.equal(
    store.getKnownApps().find((app) => app.id === appId).lastSeenAt,
    null,
  );

  store.close();
  const reopened = new UsageStore(databasePath);
  t.after(() => reopened.close());
  assert.equal(reopened.getActivityDays(appId, range).length, 0);
  assert.equal(reopened.getActivityDays('other', range)[0].seconds, 75);
});

test('invalid dates, ranges, durations, revisions and missing rows fail before mutation', (t) => {
  const { store } = setup(t);
  sample(store, 100);
  const input = editInput(store, 60);
  for (const seconds of [-1, NaN, Infinity, '60', 90001]) {
    assert.throws(() => store.updateActivity({ ...input, seconds }), {
      code: 'invalidActivity',
    });
  }
  for (const invalidDay of ['2026-02-30', '2026-13-01', '2026-9-9', 'bad']) {
    assert.throws(() => store.updateActivity({ ...input, day: invalidDay }), {
      code: 'invalidActivity',
    });
  }
  assert.throws(
    () => store.getActivityDays(appId, { from: day, to: '2026-09-08' }),
    { code: 'invalidActivity' },
  );
  assert.throws(
    () => store.getActivityDays(appId, { from: '2020-01-01', to: day }),
    { code: 'invalidActivity' },
  );
  assert.throws(
    () => store.updateActivity({ ...input, expectedRevision: '' }),
    { code: 'invalidActivity' },
  );
  assert.throws(() => store.updateActivity({ ...input, appId: 'missing' }), {
    code: 'activityNotFound',
  });
  assert.equal(store.getActivityDays(appId, range)[0].seconds, 100);
});

test('bound app identifiers cannot change unrelated rows through SQL', (t) => {
  const { store } = setup(t);
  const unusualId = "'; DELETE FROM usage_entries; --";
  sample(store, 100);
  sample(store, 40, 10, null, unusualId);
  store.updateActivity(editInput(store, 20, unusualId));
  store.deleteActivity(editInput(store, 0, unusualId));
  assert.equal(store.getActivityDays(appId, range)[0].seconds, 100);
});

test('daily duration bounds follow 23-hour and 25-hour local days', (t) => {
  const previousTimezone = process.env.TZ;
  process.env.TZ = 'America/New_York';
  try {
    const { store } = setup(t);
    for (const [date, maximumSeconds] of [
      ['2026-03-08', 23 * 3600],
      ['2026-11-01', 25 * 3600],
    ]) {
      store.recordSample(
        { id: appId, name: 'Browser' },
        100,
        true,
        new Date(`${date}T12:00:00`),
      );
      const entry = store.getActivityDays(appId, { from: date, to: date })[0];
      const input = {
        appId,
        day: date,
        seconds: maximumSeconds + 1,
        expectedRevision: entry.revision,
      };
      assert.throws(() => store.updateActivity(input), {
        code: 'invalidActivity',
      });
      assert.equal(
        store.updateActivity({ ...input, seconds: maximumSeconds }).seconds,
        maximumSeconds,
      );
    }
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
});

test('a failed child write rolls back SQLite and keeps memory and revision unchanged', (t) => {
  const { store } = setup(t);
  sample(store, 100);
  const original = structuredClone(store.data.usageByDay[day][appId]);
  const input = editInput(store, 50);
  store.database.exec(
    `CREATE TRIGGER fail_activity_site BEFORE INSERT ON site_usage BEGIN SELECT RAISE(ABORT, 'test failure'); END`,
  );
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.throws(() => store.updateActivity(input), { code: 'storageSave' });
  } finally {
    console.error = originalError;
  }
  assert.deepEqual(store.data.usageByDay[day][appId], original);
  assert.equal(
    store.getActivityDays(appId, range)[0].revision,
    input.expectedRevision,
  );
  assert.equal(
    store.database
      .prepare('SELECT seconds FROM usage_entries WHERE day = ? AND app_id = ?')
      .get(day, appId).seconds,
    100,
  );
  assert.equal(
    store.database
      .prepare('SELECT seconds FROM hourly_usage WHERE day = ? AND app_id = ?')
      .get(day, appId).seconds,
    100,
  );
});

test('duration reduction rearms only crossed app/site thresholds and retains a daily pause', (t) => {
  const { store } = setup(t);
  const now = new Date(2026, 8, 9, 12);
  sample(store, 600);
  const appLimit = store.saveLimit({
    appId,
    appName: 'Browser',
    limitMinutes: 10,
    warningMinutes: 2,
  });
  const siteLimit = store.saveLimit({
    appId,
    appName: 'Browser',
    siteDomain: 'example.com',
    limitMinutes: 5,
    warningMinutes: 1,
  });
  for (const limit of [appLimit, siteLimit]) {
    store.markLimitNotification(limit.id, 'warning', now);
    store.markLimitNotification(limit.id, 'reached', now);
  }
  store.pauseLimitToday(appLimit.id, now);

  store.updateActivity(editInput(store, 270), now);

  const app = store.getLimit(appLimit.id);
  const site = store.getLimit(siteLimit.id);
  assert.equal(app.lastWarningDate, null);
  assert.equal(app.lastReachedDate, null);
  assert.equal(app.pausedDate, day);
  assert.equal(site.lastWarningDate, day);
  assert.equal(site.lastReachedDate, null);
  const stored = store.database
    .prepare(
      'SELECT last_warning_date, last_reached_date, paused_date FROM limits WHERE app_id = ?',
    )
    .get(app.id);
  assert.deepEqual(
    { ...stored },
    { last_warning_date: null, last_reached_date: null, paused_date: day },
  );

  sample(store, 30, 12);
  assert.equal(
    isLimitNotificationDue(
      store.getLimit(site.id),
      'reached',
      store.getCurrentLimitUsage(site, now),
      day,
    ),
    true,
  );
  assert.equal(
    isLimitNotificationDue(store.getLimit(app.id), 'warning', 480, day),
    false,
  );
});

test('edits to yesterday rearm current week/month limits but preserve current daily markers', (t) => {
  const { store } = setup(t);
  const now = new Date(2026, 8, 9, 12);
  const yesterday = '2026-09-08';
  for (const period of ['day', 'week', 'month']) {
    const id = `app-${period}`;
    store.recordSample(
      { id, name: period },
      600,
      true,
      new Date(2026, 8, 8, 10),
    );
    store.recordSample({ id, name: period }, 60, true, now);
    const limit = store.saveLimit({
      appId: id,
      appName: period,
      period,
      limitMinutes: 10,
      warningMinutes: 2,
    });
    store.markLimitNotification(limit.id, 'warning', now);
    store.markLimitNotification(limit.id, 'reached', now);
    const before = store.getLimit(limit.id);
    const entry = store.getActivityDays(id, {
      from: yesterday,
      to: yesterday,
    })[0];
    store.updateActivity(
      {
        appId: id,
        day: yesterday,
        seconds: 0,
        expectedRevision: entry.revision,
      },
      now,
    );
    const after = store.getLimit(limit.id);
    assert.equal(
      after.lastWarningDate,
      period === 'day' ? before.lastWarningDate : null,
    );
    assert.equal(
      after.lastReachedDate,
      period === 'day' ? before.lastReachedDate : null,
    );
  }
});

test('delete rearms current affected limits while preserving historical markers and other apps', (t) => {
  const { store, databasePath } = setup(t);
  const now = new Date(2026, 8, 9, 12);
  sample(store, 600);
  sample(store, 600, 11, null, 'other');
  const appLimit = store.saveLimit({
    appId,
    appName: 'Browser',
    period: 'month',
    limitMinutes: 10,
    warningMinutes: 2,
  });
  const otherLimit = store.saveLimit({
    appId: 'other',
    appName: 'Other',
    limitMinutes: 10,
    warningMinutes: 2,
  });
  store.markLimitNotification(appLimit.id, 'warning', new Date(2026, 7, 9));
  store.markLimitNotification(appLimit.id, 'reached', now);
  store.markLimitNotification(otherLimit.id, 'warning', now);
  store.markLimitNotification(otherLimit.id, 'reached', now);
  store.pauseLimitToday(appLimit.id, now);
  const otherBefore = store.getLimit(otherLimit.id);

  store.deleteActivity(editInput(store, 0), now);

  assert.equal(store.getLimit(appLimit.id).lastWarningDate, '2026-08-01');
  assert.equal(store.getLimit(appLimit.id).lastReachedDate, null);
  assert.equal(store.getLimit(appLimit.id).pausedDate, day);
  assert.deepEqual(store.getLimit(otherLimit.id), otherBefore);
  store.close();
  const reopened = new UsageStore(databasePath);
  t.after(() => reopened.close());
  assert.equal(reopened.getLimit(appLimit.id).lastWarningDate, '2026-08-01');
  assert.equal(reopened.getLimit(appLimit.id).lastReachedDate, null);
  assert.equal(reopened.getLimit(appLimit.id).pausedDate, day);
});

test('failure to persist rearmed notifications rolls back the whole activity edit', (t) => {
  const { store } = setup(t);
  const now = new Date(2026, 8, 9, 12);
  sample(store, 600);
  const limit = store.saveLimit({
    appId,
    appName: 'Browser',
    limitMinutes: 10,
    warningMinutes: 2,
  });
  store.markLimitNotification(limit.id, 'reached', now);
  const originalLimit = store.getLimit(limit.id);
  const originalEntry = structuredClone(store.data.usageByDay[day][appId]);
  store.database.exec(
    `CREATE TRIGGER fail_activity_limit BEFORE UPDATE ON limits BEGIN SELECT RAISE(ABORT, 'test failure'); END`,
  );
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.throws(() => store.updateActivity(editInput(store, 60), now), {
      code: 'storageSave',
    });
  } finally {
    console.error = originalError;
  }
  assert.deepEqual(store.data.usageByDay[day][appId], originalEntry);
  assert.deepEqual(store.getLimit(limit.id), originalLimit);
  assert.equal(
    store.database
      .prepare('SELECT seconds FROM usage_entries WHERE day = ? AND app_id = ?')
      .get(day, appId).seconds,
    600,
  );
  assert.equal(
    store.database
      .prepare('SELECT last_reached_date FROM limits WHERE app_id = ?')
      .get(limit.id).last_reached_date,
    day,
  );
});

test('permission enforcement failure cannot commit activity while leaving memory stale', (t) => {
  const { store } = setup(t);
  sample(store, 100);
  const original = store.getActivityDays(appId, range)[0];
  const securePermissions = store.storage.secureFilePermissions;
  const originalError = console.error;
  store.storage.secureFilePermissions = () => {
    throw new Error('chmod failed');
  };
  console.error = () => {};
  try {
    assert.throws(() => store.updateActivity(editInput(store, 60)), {
      code: 'storageSave',
    });
  } finally {
    store.storage.secureFilePermissions = securePermissions;
    console.error = originalError;
  }
  assert.deepEqual(store.getActivityDays(appId, range), [original]);
  assert.equal(
    store.database
      .prepare('SELECT seconds FROM usage_entries WHERE day = ? AND app_id = ?')
      .get(day, appId).seconds,
    100,
  );
  assert.equal(
    store.database
      .prepare('SELECT seconds FROM hourly_usage WHERE day = ? AND app_id = ?')
      .get(day, appId).seconds,
    100,
  );
});
