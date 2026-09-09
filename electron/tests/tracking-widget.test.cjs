const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const { setImmediate: nextTurn } = require('node:timers/promises');
const { pathToFileURL } = require('node:url');
const test = require('node:test');
const vm = require('node:vm');
const { createTrackingWidget } = require('../tracking-widget.cjs');

const CHANNELS = [
  'tracking-widget:get',
  'tracking-widget:set-enabled',
  'tracking-widget:open-main',
  'tracking-widget:close',
];

function createHarness(options = {}) {
  const windows = [];
  const handlers = new Map();
  const removedHandlers = [];
  const changes = [];
  const state = { trackingEnabled: false, activityState: 'paused' };
  const loading = { error: null };
  let mainWindowOpened = 0;

  class BrowserWindow extends EventEmitter {
    constructor(config) {
      super();
      this.config = config;
      this.destroyed = false;
      this.showCount = 0;
      this.closeCount = 0;
      this.destroyCount = 0;
      this.messages = [];
      this.webContents = new EventEmitter();
      this.webContents.mainFrame = { url: '' };
      this.webContents.getURL = () => this.url;
      this.webContents.send = (...args) => this.messages.push(args);
      this.webContents.setWindowOpenHandler = (handler) => {
        this.windowOpenHandler = handler;
      };
      windows.push(this);
    }
    isDestroyed() {
      return this.destroyed;
    }
    showInactive() {
      this.showCount += 1;
    }
    setVisibleOnAllWorkspaces(...args) {
      this.workspaces = args;
    }
    loadURL(url) {
      this.loadedURL = url;
      return this.load(url);
    }
    loadFile(file, fileOptions) {
      this.loadedFile = [file, fileOptions];
      return this.load(
        `${pathToFileURL(file).href}?widget=${fileOptions.query.widget}`,
      );
    }
    load(url) {
      this.url = url;
      this.webContents.mainFrame.url = url;
      return loading.error ? Promise.reject(loading.error) : Promise.resolve();
    }
    close() {
      this.closeCount += 1;
      this.destroyed = true;
      this.emit('closed');
    }
    destroy() {
      this.destroyCount += 1;
      this.destroyed = true;
      this.emit('closed');
    }
  }

  const widget = createTrackingWidget({
    BrowserWindow,
    ipcMain: {
      handle: (channel, handler) => handlers.set(channel, handler),
      removeHandler: (channel) => {
        handlers.delete(channel);
        removedHandlers.push(channel);
      },
    },
    screen: {
      getCursorScreenPoint: () => ({ x: 2200, y: 300 }),
      getDisplayNearestPoint: () => ({
        workArea: { x: 1920, y: 100, width: 1440, height: 900 },
      }),
    },
    getState: () => ({ ...state }),
    setTrackingEnabled: (enabled) => {
      changes.push(enabled);
      state.trackingEnabled = enabled;
      state.activityState = enabled ? 'unknown' : 'paused';
    },
    showMainWindow: () => {
      mainWindowOpened += 1;
    },
    platform: 'darwin',
    ...options,
  });

  return {
    widget,
    windows,
    handlers,
    removedHandlers,
    changes,
    state,
    loading,
    get mainWindowOpened() {
      return mainWindowOpened;
    },
    get event() {
      const contents = windows.at(-1).webContents;
      return { sender: contents, senderFrame: contents.mainFrame };
    },
  };
}

test('the widget is an isolated floating window and reuses its existing instance', () => {
  const h = createHarness();
  assert.equal(h.widget.show(), true);
  const window = h.windows[0];
  assert.equal(window.config.alwaysOnTop, true);
  assert.equal(window.config.skipTaskbar, true);
  assert.equal(window.config.show, false);
  assert.equal(window.config.resizable, false);
  assert.equal(window.config.x, 3000);
  assert.equal(window.config.y, 800);
  assert.deepEqual(window.config.webPreferences, {
    preload: path.resolve(__dirname, '../tracking-widget-preload.cjs'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webviewTag: false,
    allowRunningInsecureContent: false,
  });
  assert.deepEqual(window.workspaces, [true, { visibleOnFullScreen: true }]);
  assert.deepEqual(window.loadedFile, [
    path.resolve(__dirname, '../../dist/index.html'),
    { query: { widget: 'tracking' } },
  ]);
  assert.equal(window.showCount, 0);
  window.emit('ready-to-show');
  assert.equal(window.showCount, 1);
  assert.equal(h.widget.show(), true);
  assert.equal(h.windows.length, 1);
  assert.equal(window.showCount, 2);
  assert.deepEqual(h.changes, []);
});

test('the widget blocks new windows and navigation and can load the development renderer', () => {
  const h = createHarness({
    rendererUrl: 'http://127.0.0.1:5173',
    platform: 'win32',
  });
  h.widget.show();
  const window = h.windows[0];
  assert.equal(window.loadedURL, 'http://127.0.0.1:5173/?widget=tracking');
  assert.equal(window.workspaces, undefined);
  assert.deepEqual(window.windowOpenHandler({ url: 'https://example.com' }), {
    action: 'deny',
  });
  let prevented = false;
  window.webContents.emit('will-navigate', {
    preventDefault: () => {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
});

test('every widget IPC rejects other renderers, subframes, stale URLs, and closed windows', () => {
  const h = createHarness();
  assert.deepEqual([...h.handlers.keys()], CHANNELS);
  for (const handler of h.handlers.values()) {
    assert.throws(() => handler({}), /IPC sender/);
  }
  h.widget.show();
  const window = h.windows[0];
  const event = h.event;
  for (const handler of h.handlers.values()) {
    assert.throws(() => handler({ ...event, sender: {} }, true), /IPC sender/);
    assert.throws(
      () =>
        handler(
          { ...event, senderFrame: { url: event.senderFrame.url } },
          true,
        ),
      /IPC sender/,
    );
    window.webContents.mainFrame.url = 'https://example.com';
    assert.throws(() => handler(event, true), /IPC sender/);
    window.webContents.mainFrame.url = window.url;
  }
  assert.deepEqual(h.changes, []);
  assert.equal(h.mainWindowOpened, 0);
  assert.equal(window.closeCount, 0);
  window.close();
  for (const handler of h.handlers.values()) {
    assert.throws(() => handler(event, true), /IPC sender/);
  }
});

test('widget actions accept only boolean tracking changes and closing preserves tracking state', () => {
  const h = createHarness();
  h.widget.show();
  const event = h.event;
  const setEnabled = h.handlers.get('tracking-widget:set-enabled');
  for (const invalid of [undefined, null, 0, 1, 'true', [], {}]) {
    assert.throws(() => setEnabled(event, invalid), /Некоректне/);
  }
  assert.deepEqual(h.changes, []);
  assert.equal(setEnabled(event, true).trackingEnabled, true);
  assert.equal(setEnabled(event, false).trackingEnabled, false);
  assert.deepEqual(h.changes, [true, false]);
  assert.deepEqual(h.handlers.get('tracking-widget:get')(event), h.state);
  assert.equal(h.handlers.get('tracking-widget:open-main')(event), true);
  assert.equal(h.mainWindowOpened, 1);
  assert.equal(h.handlers.get('tracking-widget:close')(event), true);
  assert.equal(h.windows[0].closeCount, 1);
  assert.equal(h.state.trackingEnabled, false);
  assert.deepEqual(h.changes, [true, false]);
  assert.equal(h.widget.show(), true);
  assert.equal(h.windows.length, 2);
});

test('refresh delivers current state only to an open widget and disposal is final and idempotent', () => {
  const h = createHarness();
  h.widget.refresh();
  h.widget.show();
  const window = h.windows[0];
  h.state.trackingEnabled = true;
  h.state.activityState = 'active';
  h.widget.refresh();
  assert.deepEqual(window.messages, [['tracking-widget:state', h.state]]);
  const staleHandler = h.handlers.get('tracking-widget:get');
  const staleEvent = h.event;
  h.widget.dispose();
  h.widget.dispose();
  window.emit('ready-to-show');
  assert.equal(window.destroyCount, 1);
  assert.equal(window.showCount, 0);
  assert.deepEqual(h.removedHandlers, CHANNELS);
  assert.equal(h.handlers.size, 0);
  assert.throws(() => staleHandler(staleEvent), /IPC sender/);
  h.widget.refresh();
  assert.equal(window.messages.length, 1);
  assert.equal(h.widget.show(), false);
  assert.equal(h.windows.length, 1);
  assert.deepEqual(h.changes, []);
});

test('a failed renderer load closes the widget without changing tracking and permits a retry', async () => {
  const h = createHarness();
  h.loading.error = new Error('Renderer could not load');
  h.widget.show();
  await nextTurn();
  assert.equal(h.windows[0].closeCount, 1);
  assert.deepEqual(h.changes, []);
  h.loading.error = null;
  assert.equal(h.widget.show(), true);
  assert.equal(h.windows.length, 2);
});

test('the widget preload exposes only tracking controls and cleans up each state subscription', async () => {
  const renderer = new EventEmitter();
  const invocations = [];
  const exposed = [];
  renderer.invoke = (...args) => {
    invocations.push(args);
    return Promise.resolve(true);
  };
  vm.runInNewContext(
    fs.readFileSync(
      path.join(__dirname, '../tracking-widget-preload.cjs'),
      'utf8',
    ),
    {
      require: (name) => {
        assert.equal(name, 'electron');
        return {
          contextBridge: {
            exposeInMainWorld: (name, api) => exposed.push({ name, api }),
          },
          ipcRenderer: renderer,
        };
      },
    },
  );
  assert.equal(exposed.length, 1);
  assert.equal(exposed[0].name, 'trackingWidgetApi');
  const { api } = exposed[0];
  assert.deepEqual(Object.keys(api).sort(), [
    'close',
    'getState',
    'onState',
    'openMainWindow',
    'setTrackingEnabled',
  ]);
  await api.getState();
  await api.setTrackingEnabled(false);
  await api.openMainWindow();
  await api.close();
  assert.deepEqual(invocations, [
    ['tracking-widget:get'],
    ['tracking-widget:set-enabled', false],
    ['tracking-widget:open-main'],
    ['tracking-widget:close'],
  ]);

  const first = [];
  const second = [];
  const unsubscribeFirst = api.onState((...args) => first.push(args));
  const unsubscribeSecond = api.onState((...args) => second.push(args));
  const state = { trackingEnabled: false };
  const nativeEvent = { sender: 'private renderer' };
  renderer.emit('tracking-widget:state', nativeEvent, state);
  assert.deepEqual(first, [[state]]);
  assert.deepEqual(second, [[state]]);
  unsubscribeFirst();
  unsubscribeFirst();
  renderer.emit('tracking-widget:state', nativeEvent, state);
  assert.equal(first.length, 1);
  assert.equal(second.length, 2);
  unsubscribeSecond();
  assert.equal(renderer.listenerCount('tracking-widget:state'), 0);
  const noop = api.onState(null);
  assert.equal(typeof noop, 'function');
  noop();
  assert.equal(renderer.listenerCount('tracking-widget:state'), 0);
});
