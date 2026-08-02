const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { UsageStore } = require('./store.cjs');

function createStore() {
  return new UsageStore(
    path.join(
      os.tmpdir(),
      `limit-store-test-${process.pid}-${Math.random()}.json`,
    ),
  );
}

test('getAppIconSource keeps an older usable path while using the latest name', () => {
  const store = createStore();
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

test('getAppIconSource marks a limit-only id as untracked', () => {
  const store = createStore();
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

test('getKnownApps exposes only renderer-safe application metadata', () => {
  const store = createStore();
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

test('aggregate exposes per-app usage for every hourly timeline point', () => {
  const store = createStore();
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
