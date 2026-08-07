const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
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
        lastSeenAt: '2026-08-02T10:00:00.000Z',
      },
    },
  };

  assert.deepEqual(store.getKnownApps(), [
    {
      id: 'com.example.App',
      name: 'Example',
      category: 'Інше',
      lastSeenAt: '2026-08-02T10:00:00.000Z',
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
  firstStore.updateSettings({ language: 'en', websiteTrackingEnabled: true });
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
    dailyLimitMinutes: 30,
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
  assert.equal(reopenedStore.getSettings().language, 'en');
  assert.equal(reopenedStore.getTodayUsage('com.example.Browser', date), 125);
  assert.deepEqual(
    reopenedStore.aggregate('2026-08-05', '2026-08-05').apps[0].sites,
    [{ domain: 'example.com', seconds: 125 }],
  );
  assert.equal(
    reopenedStore.getLimit('com.example.Browser').dailyLimitMinutes,
    30,
  );
  assert.equal(
    reopenedStore.database.prepare('PRAGMA user_version').get().user_version,
    2,
  );
  assert.deepEqual(
    reopenedStore.database
      .prepare('SELECT version, name FROM schema_migrations')
      .all()
      .map(({ version, name }) => ({ version, name })),
    [
      { version: 1, name: 'initial_schema' },
      { version: 2, name: 'settings_language' },
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
      limits: {},
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
    dailyLimitMinutes: 45,
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
