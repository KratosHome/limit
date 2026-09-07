const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const { UsageStore } = require('../store.cjs');

function createStore(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'limit-store-test-'));
  const store = new UsageStore(path.join(directory, 'usage-data.sqlite3'));
  t.after(() => {
    store.close();
    fs.rmSync(directory, { force: true, recursive: true });
  });
  return store;
}

function rebuildLegacyLimitsTable(database, { siteTargets = true } = {}) {
  database.exec('ALTER TABLE limits RENAME TO limits_current');
  if (siteTargets) {
    database.exec(`
      CREATE TABLE limits (
        app_id TEXT PRIMARY KEY,
        app_name TEXT NOT NULL,
        daily_limit_minutes INTEGER NOT NULL CHECK (daily_limit_minutes BETWEEN 1 AND 1440),
        warning_minutes INTEGER NOT NULL CHECK (warning_minutes >= 0),
        enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
        last_warning_date TEXT,
        last_reached_date TEXT,
        paused_date TEXT,
        source_app_id TEXT,
        site_domain TEXT
      ) STRICT;
      INSERT INTO limits (
        app_id, app_name, daily_limit_minutes, warning_minutes, enabled,
        last_warning_date, last_reached_date, paused_date,
        source_app_id, site_domain
      )
      SELECT
        app_id, app_name, limit_minutes, warning_minutes, enabled,
        last_warning_date, last_reached_date, paused_date,
        source_app_id, site_domain
      FROM limits_current;
      DROP TABLE limits_current;
    `);
    return;
  }
  database.exec(`
    CREATE TABLE limits (
      app_id TEXT PRIMARY KEY,
      app_name TEXT NOT NULL,
      daily_limit_minutes INTEGER NOT NULL CHECK (daily_limit_minutes BETWEEN 1 AND 1440),
      warning_minutes INTEGER NOT NULL CHECK (warning_minutes >= 0),
      enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
      last_warning_date TEXT,
      last_reached_date TEXT,
      paused_date TEXT
    ) STRICT;
    INSERT INTO limits (
      app_id, app_name, daily_limit_minutes, warning_minutes, enabled,
      last_warning_date, last_reached_date, paused_date
    )
    SELECT
      app_id, app_name, limit_minutes, warning_minutes, enabled,
      last_warning_date, last_reached_date, paused_date
    FROM limits_current;
    DROP TABLE limits_current;
  `);
}

test('getAppIconSource keeps an older usable path while using the latest name', (t) => {
  const store = createStore(t);
  store.data.usageByDay = {
    '2026-08-01': {
      'com.example.App': {
        id: 'com.example.App',
        name: 'Example',
        executablePath: '/Applications/Example.app',
        lastSeenAt: '2026-08-01T10:00:00.000Z',
      },
    },
    '2026-08-02': {
      'com.example.App': {
        id: 'com.example.App',
        name: 'Example 2',
        executablePath: 'relative/untrusted-path',
        lastSeenAt: '2026-08-02T10:00:00.000Z',
      },
    },
  };

  assert.deepEqual(store.getAppIconSource('com.example.App'), {
    appId: 'com.example.App',
    appName: 'Example 2',
    executablePath: '/Applications/Example.app',
    tracked: true,
  });
});

test('getAppIconSource marks a limit-only id as untracked', (t) => {
  const store = createStore(t);
  store.data.limits['/untrusted/path'] = {
    appId: '/untrusted/path',
    appName: 'Example',
  };

  assert.deepEqual(store.getAppIconSource('/untrusted/path'), {
    appId: '/untrusted/path',
    appName: 'Example',
    executablePath: null,
    tracked: false,
  });
});

test('getKnownApps exposes only renderer-safe application metadata', (t) => {
  const store = createStore(t);
  store.data.usageByDay = {
    '2026-08-02': {
      'com.example.App': {
        id: 'com.example.App',
        name: 'Example',
        category: 'Інше',
        executablePath: '/Applications/Example.app',
        lastTitle: 'Private title',
        seconds: 42,
        launches: 3,
        hourly: {},
        sites: {
          'example.com': { domain: 'example.com', seconds: 42 },
        },
        lastSeenAt: '2026-08-02T10:00:00.000Z',
      },
    },
  };

  assert.deepEqual(store.getKnownApps(), [
    {
      id: 'com.example.App',
      name: 'Example',
      category: 'other',
      lastSeenAt: '2026-08-02T10:00:00.000Z',
      sites: ['example.com'],
    },
  ]);
});

test('getKnownApps cache updates incrementally with the active site', (t) => {
  const store = createStore(t);
  store.updateSettings({ websiteTrackingEnabled: true });
  assert.deepEqual(store.getKnownApps(), []);

  store.recordSample(
    {
      id: 'com.example.Browser',
      name: 'Example Chrome',
      site: { domain: 'example.com' },
    },
    2,
    true,
    new Date(2026, 7, 2, 10, 0, 0),
  );

  assert.deepEqual(store.getKnownApps(), [
    {
      id: 'com.example.Browser',
      name: 'Example Chrome',
      category: 'browser',
      lastSeenAt: new Date(2026, 7, 2, 10, 0, 0).toISOString(),
      sites: ['example.com'],
    },
  ]);
});

test('aggregate exposes per-app usage for every hourly timeline point', (t) => {
  const store = createStore(t);
  store.data.usageByDay = {
    '2026-08-02': {
      'com.example.Editor': {
        id: 'com.example.Editor',
        name: 'Editor',
        seconds: 900,
        launches: 1,
        hourly: { 10: 300, 11: 600 },
      },
      'com.example.Chat': {
        id: 'com.example.Chat',
        name: 'Chat',
        seconds: 180,
        launches: 1,
        hourly: { 10: 180 },
      },
    },
  };

  const { timeline } = store.aggregate('2026-08-02', '2026-08-02');

  assert.deepEqual(timeline[10], {
    key: '10',
    seconds: 480,
    apps: [
      { id: 'com.example.Editor', name: 'Editor', seconds: 300 },
      { id: 'com.example.Chat', name: 'Chat', seconds: 180 },
    ],
  });
  assert.deepEqual(timeline[11], {
    key: '11',
    seconds: 600,
    apps: [{ id: 'com.example.Editor', name: 'Editor', seconds: 600 }],
  });
});

test('SQLite persists settings, usage, sites, and limits across restarts', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'limit-store-test-'));
  const databasePath = path.join(directory, 'usage-data.sqlite3');
  const date = new Date(2026, 7, 5, 10, 30, 0);
  const firstStore = new UsageStore(databasePath);
  firstStore.updateSettings({
    language: 'en',
    websiteTrackingEnabled: true,
    notificationsEnabled: false,
  });
  firstStore.recordSample(
    {
      id: 'com.example.Browser',
      name: 'Example Browser',
      executablePath: '/Applications/Example Browser.app',
      title: '',
      site: { domain: 'example.com' },
    },
    125,
    true,
    date,
  );
  firstStore.saveLimit({
    appId: 'com.example.Browser',
    appName: 'Example Browser',
    limitMinutes: 30,
    warningMinutes: 5,
    enabled: true,
  });
  const siteLimit = firstStore.saveLimit({
    appId: 'com.example.Browser',
    appName: 'Example Browser',
    siteDomain: 'example.com',
    limitMinutes: 15,
    warningMinutes: 5,
    enabled: true,
  });
  firstStore.close();

  const reopenedStore = new UsageStore(databasePath);
  t.after(() => {
    reopenedStore.close();
    fs.rmSync(directory, { force: true, recursive: true });
  });

  assert.equal(reopenedStore.getSettings().websiteTrackingEnabled, true);
  assert.equal(reopenedStore.getSettings().notificationsEnabled, false);
  assert.equal(reopenedStore.getSettings().language, 'en');
  assert.equal(reopenedStore.getTodayUsage('com.example.Browser', date), 125);
  assert.deepEqual(
    reopenedStore.aggregate('2026-08-05', '2026-08-05').apps[0].sites,
    [{ domain: 'example.com', seconds: 125 }],
  );
  assert.equal(reopenedStore.getLimit('com.example.Browser').limitMinutes, 30);
  assert.deepEqual(reopenedStore.getLimit(siteLimit.id), {
    ...siteLimit,
  });
  assert.equal(reopenedStore.getTodayLimitUsage(siteLimit, date), 125);
  assert.equal(
    reopenedStore.database.prepare('PRAGMA user_version').get().user_version,
    8,
  );
  assert.deepEqual(
    reopenedStore.database
      .prepare('SELECT version, name FROM schema_migrations')
      .all()
      .map(({ version, name }) => ({ version, name })),
    [
      { version: 1, name: 'initial_schema' },
      { version: 2, name: 'settings_language' },
      { version: 3, name: 'category_ids' },
      { version: 4, name: 'site_limits' },
      { version: 5, name: 'retry_native_notifications' },
      { version: 6, name: 'notification_preference' },
      { version: 7, name: 'canonical_site_limit_ids' },
      { version: 8, name: 'limit_periods' },
    ],
  );
  assert.equal(
    reopenedStore.database.prepare('PRAGMA foreign_key_check').all().length,
    0,
  );
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(databasePath).mode & 0o777, 0o600);
  }
});

test('new databases use the supplied system language', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'limit-store-test-'));
  const store = new UsageStore(path.join(directory, 'usage-data.sqlite3'), {
    defaultLanguage: 'en',
  });
  t.after(() => {
    store.close();
    fs.rmSync(directory, { force: true, recursive: true });
  });

  assert.equal(store.getSettings().language, 'en');
  assert.equal(store.getSettings().notificationsEnabled, true);
  store.updateSettings({ notificationsEnabled: 'false' });
  assert.equal(store.getSettings().notificationsEnabled, true);
});

test('current limit usage follows local day, week, and month boundaries', (t) => {
  const store = createStore(t);
  store.updateSettings({ websiteTrackingEnabled: true });
  const sample = {
    id: 'com.example.Browser',
    name: 'Example Browser',
    site: { domain: 'example.com' },
  };
  store.recordSample(sample, 120, true, new Date(2026, 7, 3, 10));
  store.recordSample(sample, 180, false, new Date(2026, 7, 9, 10));
  store.recordSample(sample, 240, false, new Date(2026, 7, 10, 10));
  const weekly = store.saveLimit({
    appId: sample.id,
    appName: sample.name,
    period: 'week',
    limitMinutes: 60,
    warningMinutes: 5,
    enabled: true,
  });
  const monthlySite = store.saveLimit({
    appId: sample.id,
    appName: sample.name,
    siteDomain: 'example.com',
    period: 'month',
    limitMinutes: 60,
    warningMinutes: 5,
    enabled: true,
  });

  const sunday = new Date(2026, 7, 9, 20);
  assert.equal(store.getCurrentLimitUsage(weekly, sunday), 300);
  assert.equal(store.getCurrentLimitUsage(monthlySite, sunday), 300);
  const sundayDashboard = store.getDashboard(
    '2026-08-09',
    '2026-08-09',
    sunday,
  );
  assert.equal(sundayDashboard.todayUsage[sample.id], 180);
  assert.equal(sundayDashboard.limitUsage[weekly.id], 300);
  assert.equal(sundayDashboard.limitUsage[monthlySite.id], 300);

  const monday = new Date(2026, 7, 10, 20);
  assert.equal(store.getCurrentLimitUsage(weekly, monday), 240);
  assert.equal(store.getCurrentLimitUsage(monthlySite, monday), 540);
});

test('period markers reset with the local period while pause remains daily', (t) => {
  const store = createStore(t);
  const limit = store.saveLimit({
    appId: 'com.example.Editor',
    appName: 'Editor',
    period: 'week',
    limitMinutes: 60,
    warningMinutes: 5,
    enabled: true,
  });
  store.markLimitNotification(limit.id, 'warning', new Date(2026, 7, 9));
  assert.equal(store.getLimit(limit.id).lastWarningDate, '2026-08-03');
  assert.equal(
    store.pauseLimitToday(limit.id, new Date(2026, 7, 9)).pausedDate,
    '2026-08-09',
  );
  store.markLimitNotification(limit.id, 'reached', new Date(2026, 7, 10));
  assert.equal(store.getLimit(limit.id).lastReachedDate, '2026-08-10');
});

test('legacy input defaults to day and preserves the previous period on edit', (t) => {
  const store = createStore(t);
  const input = {
    appId: 'com.example.Editor',
    appName: 'Editor',
    dailyLimitMinutes: 30,
    warningMinutes: 5,
    enabled: true,
  };
  const daily = store.saveLimit(input);
  assert.equal(daily.period, 'day');
  assert.equal(daily.limitMinutes, 30);

  store.saveLimit({ ...input, period: 'week', limitMinutes: 90 });
  const edited = store.saveLimit({ ...input, dailyLimitMinutes: 120 });
  assert.equal(edited.period, 'week');
  assert.equal(edited.limitMinutes, 120);
});

test('limit periods enforce application and database bounds', (t) => {
  const store = createStore(t);
  const input = {
    appId: 'com.example.Editor',
    appName: 'Editor',
    warningMinutes: 5,
    enabled: true,
  };
  for (const [period, limitMinutes] of [
    ['day', 1441],
    ['week', 10081],
    ['month', 44641],
    ['year', 60],
  ]) {
    assert.throws(
      () => store.saveLimit({ ...input, period, limitMinutes }),
      (error) => error?.code === 'invalidLimit',
    );
  }
  store.saveLimit({ ...input, period: 'month', limitMinutes: 44640 });
  assert.throws(() =>
    store.database.exec(
      "UPDATE limits SET warning_minutes = limit_minutes WHERE app_id = 'com.example.Editor'",
    ),
  );
});

test('migration v8 preserves v7 limits as daily limits', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'limit-store-test-'));
  const databasePath = path.join(directory, 'usage-data.sqlite3');
  const originalStore = new UsageStore(databasePath);
  originalStore.saveLimit({
    appId: 'com.example.Editor',
    appName: 'Editor',
    limitMinutes: 30,
    warningMinutes: 5,
    enabled: true,
  });
  originalStore.markLimitNotification(
    'com.example.Editor',
    'warning',
    new Date(2026, 7, 9),
  );
  originalStore.close();

  const legacyDatabase = new DatabaseSync(databasePath);
  rebuildLegacyLimitsTable(legacyDatabase);
  legacyDatabase
    .prepare('UPDATE limits SET warning_minutes = ? WHERE app_id = ?')
    .run(30, 'com.example.Editor');
  legacyDatabase.exec(`
    DELETE FROM schema_migrations WHERE version >= 8;
    PRAGMA user_version = 7;
  `);
  legacyDatabase.close();

  const migratedStore = new UsageStore(databasePath);
  t.after(() => {
    migratedStore.close();
    fs.rmSync(directory, { force: true, recursive: true });
  });
  assert.deepEqual(migratedStore.getLimit('com.example.Editor'), {
    id: 'com.example.Editor',
    appId: 'com.example.Editor',
    appName: 'Editor',
    siteDomain: null,
    period: 'day',
    limitMinutes: 30,
    warningMinutes: 29,
    enabled: true,
    lastWarningDate: '2026-08-09',
    lastReachedDate: null,
    pausedDate: null,
  });
  assert.equal(
    migratedStore.database.prepare('PRAGMA user_version').get().user_version,
    8,
  );
  assert.equal(
    migratedStore.database.prepare('PRAGMA integrity_check').get()
      .integrity_check,
    'ok',
  );
  assert.equal(
    fs
      .readdirSync(directory)
      .some((fileName) => fileName.includes('.backup-v7-')),
    true,
  );
});

test('migration adds site targets while preserving existing app limits', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'limit-store-test-'));
  const databasePath = path.join(directory, 'usage-data.sqlite3');
  const originalStore = new UsageStore(databasePath);
  originalStore.saveLimit({
    appId: 'com.example.Browser',
    appName: 'Example Browser',
    limitMinutes: 30,
    warningMinutes: 5,
    enabled: true,
  });
  originalStore.close();

  const legacyDatabase = new DatabaseSync(databasePath);
  rebuildLegacyLimitsTable(legacyDatabase, { siteTargets: false });
  legacyDatabase.exec(`
    ALTER TABLE settings DROP COLUMN notifications_enabled;
    DELETE FROM schema_migrations WHERE version >= 4;
    PRAGMA user_version = 3;
  `);
  legacyDatabase.close();

  const migratedStore = new UsageStore(databasePath);
  t.after(() => {
    migratedStore.close();
    fs.rmSync(directory, { force: true, recursive: true });
  });

  assert.deepEqual(migratedStore.getLimit('com.example.Browser'), {
    id: 'com.example.Browser',
    appId: 'com.example.Browser',
    appName: 'Example Browser',
    siteDomain: null,
    period: 'day',
    limitMinutes: 30,
    warningMinutes: 5,
    enabled: true,
    lastWarningDate: null,
    lastReachedDate: null,
    pausedDate: null,
  });
  assert.equal(
    migratedStore.database.prepare('PRAGMA user_version').get().user_version,
    8,
  );
});

test('migration retries notifications marked by the previous delivery path', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'limit-store-test-'));
  const databasePath = path.join(directory, 'usage-data.sqlite3');
  const originalStore = new UsageStore(databasePath);
  originalStore.saveLimit({
    appId: 'com.example.Editor',
    appName: 'Example Editor',
    limitMinutes: 30,
    warningMinutes: 5,
    enabled: true,
  });
  originalStore.markLimitNotification(
    'com.example.Editor',
    'warning',
    new Date(2026, 7, 9),
  );
  originalStore.markLimitNotification(
    'com.example.Editor',
    'reached',
    new Date(2026, 7, 9),
  );
  originalStore.close();

  const legacyDatabase = new DatabaseSync(databasePath);
  rebuildLegacyLimitsTable(legacyDatabase);
  legacyDatabase.exec(`
    ALTER TABLE settings DROP COLUMN notifications_enabled;
    DELETE FROM schema_migrations WHERE version >= 5;
    PRAGMA user_version = 4;
  `);
  legacyDatabase.close();

  const migratedStore = new UsageStore(databasePath);
  t.after(() => {
    migratedStore.close();
    fs.rmSync(directory, { force: true, recursive: true });
  });

  assert.equal(
    migratedStore.getLimit('com.example.Editor').lastWarningDate,
    null,
  );
  assert.equal(
    migratedStore.getLimit('com.example.Editor').lastReachedDate,
    null,
  );
  assert.equal(
    migratedStore.database.prepare('PRAGMA user_version').get().user_version,
    8,
  );
});

test('migration enables the notification preference for existing users', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'limit-store-test-'));
  const databasePath = path.join(directory, 'usage-data.sqlite3');
  const originalStore = new UsageStore(databasePath);
  originalStore.close();

  const legacyDatabase = new DatabaseSync(databasePath);
  rebuildLegacyLimitsTable(legacyDatabase);
  legacyDatabase.exec(`
    ALTER TABLE settings DROP COLUMN notifications_enabled;
    DELETE FROM schema_migrations WHERE version >= 6;
    PRAGMA user_version = 5;
  `);
  legacyDatabase.close();

  const migratedStore = new UsageStore(databasePath);
  t.after(() => {
    migratedStore.close();
    fs.rmSync(directory, { force: true, recursive: true });
  });

  assert.equal(migratedStore.getSettings().notificationsEnabled, true);
  assert.equal(
    migratedStore.database.prepare('PRAGMA user_version').get().user_version,
    8,
  );
});

test('migration replaces legacy site-limit ids with bounded canonical ids', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'limit-store-test-'));
  const databasePath = path.join(directory, 'usage-data.sqlite3');
  const originalStore = new UsageStore(databasePath);
  const siteLimit = originalStore.saveLimit({
    appId: 'com.example.Browser',
    appName: 'Example Browser',
    siteDomain: 'example.com',
    limitMinutes: 20,
    warningMinutes: 5,
    enabled: true,
  });
  originalStore.close();

  const legacyId = 'site:["com.example.Browser","example.com"]';
  const legacyDatabase = new DatabaseSync(databasePath);
  rebuildLegacyLimitsTable(legacyDatabase);
  legacyDatabase
    .prepare('UPDATE limits SET app_id = ? WHERE app_id = ?')
    .run(legacyId, siteLimit.id);
  legacyDatabase.exec(`
    DELETE FROM schema_migrations WHERE version >= 7;
    PRAGMA user_version = 6;
  `);
  legacyDatabase.close();

  const migratedStore = new UsageStore(databasePath);
  t.after(() => {
    migratedStore.close();
    fs.rmSync(directory, { force: true, recursive: true });
  });

  const [migratedLimit] = migratedStore.getLimits();
  assert.match(migratedLimit.id, /^limit-site:v1:[A-Za-z0-9_-]{43}$/);
  assert.equal(migratedLimit.id, siteLimit.id);
  assert.equal(migratedStore.getLimit(legacyId), null);
});

test('site-limit ids stay bounded and cannot collide with app ids', (t) => {
  const store = createStore(t);
  const longAppId = `C:\\${'a'.repeat(509)}`;
  const siteLimit = store.saveLimit({
    appId: longAppId,
    appName: 'Long Browser',
    siteDomain: 'example.com',
    limitMinutes: 30,
    warningMinutes: 5,
    enabled: true,
  });

  assert.ok(siteLimit.id.length < 64);
  assert.equal(store.pauseLimitToday(siteLimit.id)?.id, siteLimit.id);
  store.deleteLimit(siteLimit.id);
  assert.equal(store.getLimit(siteLimit.id), null);

  assert.throws(
    () =>
      store.saveLimit({
        appId: siteLimit.id,
        appName: 'Reserved id',
        limitMinutes: 30,
        warningMinutes: 5,
        enabled: true,
      }),
    (error) => error?.code === 'invalidAppData',
  );
});

test('limit input requires safe string application metadata', (t) => {
  const store = createStore(t);
  const input = {
    appName: 'Example',
    limitMinutes: 30,
    warningMinutes: 5,
    enabled: true,
  };

  assert.throws(
    () => store.saveLimit({ ...input, appId: { value: 'object' } }),
    (error) => error?.code === 'selectApp',
  );
  assert.throws(
    () => store.saveLimit({ ...input, appId: 'com.example.App\n' }),
    (error) => error?.code === 'invalidAppData',
  );
});

test('changing warning time resets only the warning delivery marker', (t) => {
  const store = createStore(t);
  const input = {
    appId: 'com.example.Editor',
    appName: 'Example Editor',
    limitMinutes: 30,
    warningMinutes: 5,
    enabled: true,
  };
  store.saveLimit(input);
  const date = new Date(2026, 7, 9);
  store.markLimitNotification(input.appId, 'warning', date);
  store.markLimitNotification(input.appId, 'reached', date);

  const updated = store.saveLimit({ ...input, warningMinutes: 10 });

  assert.equal(updated.lastWarningDate, null);
  assert.equal(updated.lastReachedDate, '2026-08-09');
});

test('imports the legacy JSON once and keeps it as a backup', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'limit-store-test-'));
  const databasePath = path.join(directory, 'usage-data.sqlite3');
  const legacyJsonPath = path.join(directory, 'usage-data.json');
  fs.writeFileSync(
    legacyJsonPath,
    JSON.stringify({
      schemaVersion: 2,
      usageByDay: {
        '2026-08-04': {
          'com.example.Editor': {
            id: 'com.example.Editor',
            name: 'Example Editor',
            category: 'Розробка',
            seconds: 600,
            launches: 2,
            hourly: { 9: 600 },
            sites: {},
            lastTitle: '',
            lastSeenAt: '2026-08-04T09:10:00.000Z',
          },
        },
      },
      limits: {
        'com.example.Editor': {
          appId: 'com.example.Editor',
          appName: 'Example Editor',
          dailyLimitMinutes: 25,
          warningMinutes: 5,
          enabled: true,
        },
      },
      settings: {
        trackingEnabled: false,
        websiteTrackingEnabled: false,
        launchAtLogin: true,
        idleThresholdSeconds: 90,
      },
    }),
  );

  let store = new UsageStore(databasePath, { legacyJsonPath });
  t.after(() => {
    store.close();
    fs.rmSync(directory, { force: true, recursive: true });
  });

  assert.equal(store.getSettings().trackingEnabled, false);
  assert.equal(store.getSettings().notificationsEnabled, true);
  assert.equal(store.getLimit('com.example.Editor').period, 'day');
  assert.equal(store.getLimit('com.example.Editor').limitMinutes, 25);
  assert.equal(
    store.getTodayUsage('com.example.Editor', new Date(2026, 7, 4)),
    600,
  );
  assert.equal(fs.existsSync(legacyJsonPath), true);
  assert.equal(
    fs.readFileSync(databasePath).subarray(0, 15).toString(),
    'SQLite format 3',
  );

  store.close();
  fs.writeFileSync(
    legacyJsonPath,
    JSON.stringify({
      schemaVersion: 2,
      usageByDay: {},
      limits: {},
      settings: { trackingEnabled: true },
    }),
  );
  store = new UsageStore(databasePath, { legacyJsonPath });
  assert.equal(store.getSettings().trackingEnabled, false);
  assert.equal(
    store.getTodayUsage('com.example.Editor', new Date(2026, 7, 4)),
    600,
  );
});

test('parameterized writes treat SQL injection payloads as plain data', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'limit-store-test-'));
  const databasePath = path.join(directory, 'usage-data.sqlite3');
  const store = new UsageStore(databasePath);
  const payload = "example'); DROP TABLE limits; --";
  t.after(() => {
    store.close();
    fs.rmSync(directory, { force: true, recursive: true });
  });

  store.saveLimit({
    appId: payload,
    appName: payload,
    limitMinutes: 45,
    warningMinutes: 5,
    enabled: true,
  });
  store.recordSample(
    { id: payload, name: payload, title: '', site: null },
    10,
    true,
    new Date(2026, 7, 5, 12, 0, 0),
  );

  assert.equal(store.getLimit(payload).appName, payload);
  assert.equal(
    store.database
      .prepare(
        "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'limits'",
      )
      .get().count,
    1,
  );
  assert.equal(
    store.database.prepare('PRAGMA integrity_check').get().integrity_check,
    'ok',
  );
});

test('refuses a newer schema without replacing the database', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'limit-store-test-'));
  const databasePath = path.join(directory, 'usage-data.sqlite3');
  const store = new UsageStore(databasePath);
  store.database
    .prepare(
      `INSERT OR REPLACE INTO schema_migrations (version, name, applied_at)
       VALUES (?, ?, ?)`,
    )
    .run(999, 'future_schema', new Date().toISOString());
  store.close();
  t.after(() => {
    fs.rmSync(directory, { force: true, recursive: true });
  });

  assert.throws(() => new UsageStore(databasePath), /новішою версією Limit/);
  assert.equal(fs.existsSync(databasePath), true);
  assert.equal(
    fs
      .readdirSync(directory)
      .some((fileName) => fileName.includes('.corrupt-')),
    false,
  );
});

test('backs up a corrupt database before creating a clean replacement', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'limit-store-test-'));
  const databasePath = path.join(directory, 'usage-data.sqlite3');
  fs.writeFileSync(databasePath, 'not a sqlite database');
  const store = new UsageStore(databasePath);
  t.after(() => {
    store.close();
    fs.rmSync(directory, { force: true, recursive: true });
  });

  assert.equal(store.getStorageStatus().recoveryCreated, true);
  assert.equal(
    fs
      .readdirSync(directory)
      .some((fileName) => fileName.includes('.corrupt-')),
    true,
  );
  assert.equal(
    store.database.prepare('PRAGMA integrity_check').get().integrity_check,
    'ok',
  );
});
