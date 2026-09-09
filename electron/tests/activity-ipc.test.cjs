const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const errors = require('../errors.cjs');
const { UsageStore } = require('../store.cjs');

const channels = ['activity:days', 'activity:update', 'activity:delete'];
const appId = 'com.example.App';
const day = '2026-09-09';
const range = { from: day, to: day };
const plain = (value) => JSON.parse(JSON.stringify(value));

function mainHarness(store) {
  const handlers = new Map();
  const messages = [];
  const sideEffects = [];
  const loggedErrors = [];
  const failures = { send: null, widget: null };
  const electron = {
    app: {
      isPackaged: true,
      getPath: () => '/tmp',
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
    cacheState: () => plain(api.cacheState()),
  };
}

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
  assert.deepEqual(store.calls, [
    ['days', appId, range],
    ['update', input],
    ['delete', input],
  ]);
  assert.deepEqual(h.sideEffects, ['reset', 'widget', 'reset', 'widget']);
  assert.deepEqual(h.messages, [
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
  assert.deepEqual(invocations, [
    ['activity:days', appId, range],
    ['activity:update', input],
    ['activity:delete', input],
  ]);
  for (const code of [
    'invalidActivity',
    'activityConflict',
    'activityNotFound',
    'storageSave',
  ]) {
    response = { ok: false, error: { code } };
    await assert.rejects(api.updateActivity(input), { message: code });
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
  ]) {
    assert.equal(widgetApi[method], undefined);
  }
});
