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
