const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const errors = require('../errors.cjs');
const { UsageStore, localDay, enumerateDays } = require('../store.cjs');

const channels = [
  'activity:days',
  'activity:update',
  'activity:delete',
  'activity:delete-site',
];
const appId = 'com.example.App';
const domain = 'example.com';
const day = '2026-09-09';
const range = { from: day, to: day };
const plain = (value) => JSON.parse(JSON.stringify(value));

function mainHarness(store, { today } = {}) {
  const handlers = new Map();
  const messages = [];
  const sideEffects = [];
  const loggedErrors = [];
  const failures = { send: null, widget: null };
  const electron = {
    app: {
      isPackaged: true,
      getPath: () => '/tmp',
      getAppPath: () => '/nonexistent-limit-test',
      setPath: () => {},
      requestSingleInstanceLock: () => true,
      on: () => {},
      whenReady: () => new Promise(() => {}),
    },
    ipcMain: {
      handle: (channel, handler) => handlers.set(channel, handler),
      on: () => {},
    },
  };
  const context = vm.createContext({
    require: (name) => {
      if (name === 'electron') return electron;
      if (name === './errors.cjs') return errors;
      if (name === './support.cjs') return require('../support.cjs');
      if (name === './support-config.cjs')
        return require('../support-config.cjs');
      if (name === './store.cjs')
        return {
          ...require('../store.cjs'),
          localDay: (date) =>
            date === undefined && today ? today : localDay(date),
        };
      if (name === './limit-notification-rules.cjs')
        return require('../limit-notification-rules.cjs');
      if (name.startsWith('node:')) return require(name);
      return {};
    },
    process: { platform: 'darwin', env: {} },
    console: { error: (...args) => loggedErrors.push(args) },
    __dirname: path.resolve(__dirname, '..'),
  });
  const api = vm.runInContext(
    `${fs.readFileSync(path.join(__dirname, '../main.cjs'), 'utf8')}
    ;({
      validateRange,
      setup(nextStore, nextTracker, window, widget) {
        store = nextStore;
        tracker = nextTracker;
        mainWindow = window;
        trackingWidget = widget;
        appIconCache.set('${appId}', 'cached');
        appIconMissCache.set('${appId}', 'missed');
        appIconCache.set('other', 'unrelated');
        registerIpc();
      },
      cacheState() {
        return {
          icon: appIconCache.has('${appId}'),
          missed: appIconMissCache.has('${appId}'),
          unrelated: appIconCache.has('other'),
          limits: Array.from(limitNotificationRevisions.keys()),
        };
      },
    })`,
    context,
  );
  const url = 'file:///app/index.html';
  const frame = { url };
  const contents = {
    mainFrame: frame,
    getURL: () => url,
    send: (...args) => {
      if (failures.send) throw failures.send;
      messages.push(plain(args));
    },
  };
  api.setup(
    store,
    { resetActivity: () => sideEffects.push('reset') },
    { webContents: contents, isDestroyed: () => false },
    {
      refresh: () => {
        if (failures.widget) throw failures.widget;
        sideEffects.push('widget');
      },
    },
  );
  return {
    handlers,
    event: { sender: contents, senderFrame: frame },
    messages,
    sideEffects,
    loggedErrors,
    failures,
    validateRange: (input) => plain(api.validateRange(input)),
    cacheState: () => plain(api.cacheState()),
  };
}

test('dashboard ranges preserve 365 calendar days across DST and clamp longer ranges from the end date', () => {
  const previousTimezone = process.env.TZ;
  process.env.TZ = 'Europe/Kyiv';
  try {
    const h = mainHarness(mockStore(), { today: '2026-10-25' });
    const maximumRange = { from: '2025-10-25', to: '2026-10-25' };
    assert.ok(
      (new Date('2026-10-25T12:00:00') - new Date('2025-10-25T12:00:00')) /
        86_400_000 >
        365,
      'the fixture spans the autumn DST change by an extra hour',
    );
    assert.deepEqual(h.validateRange(maximumRange), maximumRange);
    for (const from of ['2025-10-24', '2024-12-01']) {
      const clamped = h.validateRange({ from, to: maximumRange.to });
      assert.deepEqual(clamped, maximumRange);
      // Both endpoints are included, matching the existing today-minus-365 UI.
      assert.equal(enumerateDays(clamped.from, clamped.to).length, 366);
    }
    assert.deepEqual(
      h.validateRange({ from: '2023-01-01', to: '2024-03-01' }),
      { from: '2023-03-02', to: '2024-03-01' },
    );
    assert.deepEqual(
      h.validateRange({ from: '2026-10-25', to: '2025-10-25' }),
      maximumRange,
    );
    assert.deepEqual(
      h.validateRange({ from: '2026-10-25', to: '2026-10-25' }),
      { from: '2026-10-25', to: '2026-10-25' },
    );
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
});

function mockStore() {
  const calls = [];
  const entry = {
    appId,
    day,
    seconds: 60,
    name: 'Example',
    revision: 'revision',
  };
  return {
    calls,
    entry,
    getActivityDays: (...args) => {
      calls.push(['days', ...args]);
      return [entry];
    },
    updateActivity: (input) => {
      calls.push(['update', input]);
      return { ...entry, seconds: input.seconds };
    },
    deleteActivity: (input) => {
      calls.push(['delete', input]);
      return true;
    },
    deleteSiteUsage: (input) => {
      calls.push(['delete-site', input]);
      return true;
    },
    getLimits: () => [
      { id: 'app-limit', appId },
      { id: 'site-limit', appId, siteDomain: 'example.com' },
      { id: 'unrelated-limit', appId: 'other' },
    ],
  };
}

test('all activity IPC rejects other renderers, widget frames, subframes and stale URLs', () => {
  const store = mockStore();
  const h = mainHarness(store);
  const widgetFrame = { url: 'file:///app/index.html?widget=tracking' };
  for (const channel of channels) {
    const handler = h.handlers.get(channel);
    assert.equal(typeof handler, 'function');
    assert.throws(() => handler({ sender: {}, senderFrame: {} }), /IPC sender/);
    assert.throws(
      () =>
        handler({
          sender: { mainFrame: widgetFrame },
          senderFrame: widgetFrame,
        }),
      /IPC sender/,
    );
    assert.throws(
      () =>
        handler({ ...h.event, senderFrame: { url: h.event.senderFrame.url } }),
      /IPC sender/,
    );
    h.event.senderFrame.url = 'https://example.com';
    assert.throws(() => handler(h.event), /IPC sender/);
    h.event.senderFrame.url = 'file:///app/index.html';
  }
  assert.deepEqual(store.calls, []);
  assert.deepEqual(h.sideEffects, []);
  assert.deepEqual(h.messages, []);
});

test('successful activity IPC forwards scoped arguments and refreshes only after a mutation', () => {
  const store = mockStore();
  const h = mainHarness(store);
  const input = { appId, day, seconds: 120, expectedRevision: 'revision' };
  assert.deepEqual(h.handlers.get('activity:days')(h.event, appId, range), {
    ok: true,
    data: [store.entry],
  });
  assert.deepEqual(h.sideEffects, []);
  assert.deepEqual(h.messages, []);

  assert.deepEqual(h.handlers.get('activity:update')(h.event, input), {
    ok: true,
    data: { ...store.entry, seconds: 120 },
  });
  assert.deepEqual(h.handlers.get('activity:delete')(h.event, input), {
    ok: true,
    data: true,
  });
  const siteInput = { appId, domain, range };
  assert.deepEqual(h.handlers.get('activity:delete-site')(h.event, siteInput), {
    ok: true,
    data: true,
  });
  assert.deepEqual(store.calls, [
    ['days', appId, range],
    ['update', input],
    ['delete', input],
    ['delete-site', siteInput],
  ]);
  assert.deepEqual(h.sideEffects, [
    'reset',
    'widget',
    'reset',
    'widget',
    'reset',
    'widget',
  ]);
  assert.deepEqual(h.messages, [
    ['data:updated', { reason: 'activity-edit' }],
    ['data:updated', { reason: 'activity-edit' }],
    ['data:updated', { reason: 'activity-edit' }],
  ]);
  assert.deepEqual(h.cacheState(), {
    icon: false,
    missed: false,
    unrelated: true,
    limits: ['app-limit', 'site-limit'],
  });
});

test('activity IPC returns safe validation/conflict/storage errors without successful-edit side effects', () => {
  for (const [method, channel, error, expectedCode] of [
    [
      'getActivityDays',
      'activity:days',
      new errors.AppError(errors.ERROR_CODES.INVALID_ACTIVITY),
      'invalidActivity',
    ],
    [
      'updateActivity',
      'activity:update',
      new errors.AppError(errors.ERROR_CODES.ACTIVITY_CONFLICT),
      'activityConflict',
    ],
    [
      'deleteActivity',
      'activity:delete',
      new errors.AppError(errors.ERROR_CODES.ACTIVITY_NOT_FOUND),
      'activityNotFound',
    ],
    [
      'updateActivity',
      'activity:update',
      new Error('SQL write to /private/user/database failed'),
      'storageSave',
    ],
    [
      'deleteSiteUsage',
      'activity:delete-site',
      new errors.AppError(errors.ERROR_CODES.INVALID_ACTIVITY),
      'invalidActivity',
    ],
    [
      'deleteSiteUsage',
      'activity:delete-site',
      new Error('SQL delete from /private/user/database failed'),
      'storageSave',
    ],
  ]) {
    const store = mockStore();
    store[method] = () => {
      throw error;
    };
    const h = mainHarness(store);
    assert.deepEqual(h.handlers.get(channel)(h.event, {}), {
      ok: false,
      error: { code: expectedCode },
    });
    assert.deepEqual(h.sideEffects, []);
    assert.deepEqual(h.messages, []);
    assert.deepEqual(h.cacheState(), {
      icon: true,
      missed: true,
      unrelated: true,
      limits: [],
    });
  }
});

test('deleting missing site usage returns false without becoming an IPC error', () => {
  const store = mockStore();
  store.deleteSiteUsage = () => false;
  const h = mainHarness(store);
  assert.deepEqual(
    h.handlers.get('activity:delete-site')(h.event, { appId, domain, range }),
    { ok: true, data: false },
  );
  assert.deepEqual(h.sideEffects, ['reset', 'widget']);
});

test('post-commit renderer/widget failures cannot report an already-saved activity change as failed', (t) => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'limit-activity-ipc-test-'),
  );
  const store = new UsageStore(path.join(directory, 'usage.sqlite3'));
  t.after(() => {
    store.close();
    fs.rmSync(directory, { force: true, recursive: true });
  });
  store.recordSample(
    { id: appId, name: 'Example' },
    100,
    true,
    new Date(2026, 8, 9, 10),
  );
  const h = mainHarness(store);
  const entry = store.getActivityDays(appId, range)[0];
  h.failures.send = new Error('Renderer was destroyed');
  const edited = h.handlers.get('activity:update')(h.event, {
    appId,
    day,
    seconds: 60,
    expectedRevision: entry.revision,
  });
  assert.equal(store.getActivityDays(appId, range)[0].seconds, 60);
  assert.equal(edited.ok, true);
  assert.equal(edited.data.seconds, 60);

  h.failures.send = null;
  h.failures.widget = new Error('Widget was destroyed');
  const deleted = h.handlers.get('activity:delete')(h.event, {
    appId,
    day,
    expectedRevision: edited.data.revision,
  });
  assert.equal(store.getActivityDays(appId, range).length, 0);
  assert.deepEqual(deleted, { ok: true, data: true });
  assert.equal(h.loggedErrors.length, 2);
});

function preloadHarness(file, invoke) {
  const exposed = new Map();
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '..', file), 'utf8'),
    {
      require: (name) => {
        assert.equal(name, 'electron');
        return {
          contextBridge: {
            exposeInMainWorld: (name, api) => exposed.set(name, api),
          },
          ipcRenderer: { invoke },
        };
      },
    },
  );
  return exposed;
}

test('site deletion passes through preload and trusted IPC without deleting browser time or other site history', async (t) => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'limit-site-ipc-test-'),
  );
  const store = new UsageStore(path.join(directory, 'usage.sqlite3'));
  t.after(() => {
    store.close();
    fs.rmSync(directory, { force: true, recursive: true });
  });
  store.updateSettings({ websiteTrackingEnabled: true });
  for (const [id, siteDomain, seconds, date] of [
    [appId, domain, 100, new Date(2026, 8, 9, 10)],
    [appId, 'other.example', 40, new Date(2026, 8, 9, 11)],
    [appId, domain, 90, new Date(2026, 8, 8, 10)],
    ['other', domain, 30, new Date(2026, 8, 9, 10)],
  ]) {
    store.recordSample(
      { id, name: 'Example Browser', site: { domain: siteDomain } },
      seconds,
      true,
      date,
    );
  }
  const browserBefore = plain(store.data.usageByDay[day][appId]);
  const h = mainHarness(store);
  const api = preloadHarness('preload.cjs', (channel, input) =>
    Promise.resolve(h.handlers.get(channel)(h.event, input)),
  ).get('limitApi');

  assert.equal(await api.deleteSiteUsage({ appId, domain, range }), true);

  const browserAfter = plain(store.data.usageByDay[day][appId]);
  delete browserBefore.sites[domain];
  assert.deepEqual(browserAfter, browserBefore);
  assert.equal(
    store.data.usageByDay['2026-09-08'][appId].sites[domain].seconds,
    90,
  );
  assert.equal(store.data.usageByDay[day].other.sites[domain].seconds, 30);
  assert.deepEqual(h.sideEffects, ['reset', 'widget']);
  assert.deepEqual(h.messages, [['data:updated', { reason: 'activity-edit' }]]);
  assert.equal(await api.deleteSiteUsage({ appId, domain, range }), false);
});

test('main preload forwards activity arguments, unwraps data and retains known safe error codes', async () => {
  const invocations = [];
  let response = { ok: true, data: [{ day, appId, seconds: 60 }] };
  const api = preloadHarness('preload.cjs', (...args) => {
    invocations.push(args);
    return Promise.resolve(response);
  }).get('limitApi');
  assert.deepEqual(await api.getActivityDays(appId, range), response.data);
  const input = { appId, day, seconds: 60, expectedRevision: 'revision' };
  response = { ok: true, data: { day, appId, seconds: 60 } };
  assert.deepEqual(await api.updateActivity(input), response.data);
  response = { ok: true, data: true };
  assert.equal(await api.deleteActivity(input), true);
  const siteInput = { appId, domain, range };
  assert.equal(await api.deleteSiteUsage(siteInput), true);
  assert.deepEqual(invocations, [
    ['activity:days', appId, range],
    ['activity:update', input],
    ['activity:delete', input],
    ['activity:delete-site', siteInput],
  ]);
  for (const code of [
    'invalidActivity',
    'activityConflict',
    'activityNotFound',
    'storageSave',
  ]) {
    response = { ok: false, error: { code } };
    await assert.rejects(api.updateActivity(input), { message: code });
    await assert.rejects(api.deleteSiteUsage(siteInput), { message: code });
  }
});

test('widget preload exposes no main activity API or editing actions', () => {
  const exposed = preloadHarness('tracking-widget-preload.cjs', () =>
    Promise.resolve(true),
  );
  assert.deepEqual([...exposed.keys()], ['trackingWidgetApi']);
  const widgetApi = exposed.get('trackingWidgetApi');
  for (const method of [
    'getActivityDays',
    'updateActivity',
    'deleteActivity',
    'deleteSiteUsage',
  ]) {
    assert.equal(widgetApi[method], undefined);
  }
});
