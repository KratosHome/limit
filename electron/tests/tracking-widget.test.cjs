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
  const display = {
    cursor: { x: 2200, y: 300 },
    anchor: { x: 2500, y: 80, width: 24, height: 20 },
    nearest: { workArea: { x: 1920, y: 100, width: 1440, height: 900 } },
    matching: { workArea: { x: 1920, y: 100, width: 1440, height: 900 } },
    matched: [],
    nearestPoints: [],
  };
  let mainWindowOpened = 0;

  class BrowserWindow extends EventEmitter {
    constructor(config) {
      super();
      this.config = config;
      this.destroyed = false;
      this.showCount = 0;
      this.showInactiveCount = 0;
      this.hideCount = 0;
      this.visible = false;
      this.focused = false;
      this.bounds = {
        x: config.x,
        y: config.y,
        width: config.width,
        height: config.height,
      };
      this.boundsChanges = [];
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
      this.showInactiveCount += 1;
      this.visible = true;
    }
    show() {
      this.showCount += 1;
      this.visible = true;
      this.focus();
    }
    focus() {
      this.focused = true;
      this.emit('focus');
    }
    hide() {
      this.hideCount += 1;
      this.visible = false;
      this.focused = false;
    }
    isVisible() {
      return this.visible;
    }
    isFocused() {
      return this.focused;
    }
    setBounds(bounds) {
      this.bounds = { ...this.bounds, ...bounds };
      this.boundsChanges.push(this.bounds);
    }
    getBounds() {
      return this.bounds;
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
      this.visible = false;
      this.focused = false;
      this.emit('closed');
    }
    destroy() {
      this.destroyCount += 1;
      this.destroyed = true;
      this.visible = false;
      this.focused = false;
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
      getCursorScreenPoint: () => display.cursor,
      getDisplayNearestPoint: (point) => {
        display.nearestPoints.push(point);
        return display.nearest;
      },
      getDisplayMatching: (bounds) => {
        display.matched.push(bounds);
        return display.matching;
      },
    },
    getAnchorBounds: () => display.anchor,
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
    display,
    get mainWindowOpened() {
      return mainWindowOpened;
    },
    get event() {
      const contents = windows.at(-1).webContents;
      return { sender: contents, senderFrame: contents.mainFrame };
    },
  };
}

test('the Mac widget is an isolated menu-bar panel anchored to the tray and reused', () => {
  const h = createHarness();
  assert.equal(h.widget.show(), true);
  const window = h.windows[0];
  assert.equal(window.config.alwaysOnTop, true);
  assert.equal(window.config.skipTaskbar, true);
  assert.equal(window.config.show, false);
  assert.equal(window.config.resizable, false);
  assert.equal(window.config.type, 'panel');
  assert.equal(window.config.movable, false);
  assert.equal(window.config.width, 340);
  assert.equal(window.config.height, 180);
  assert.equal(window.config.x, 2342);
  assert.equal(window.config.y, 106);
  assert.deepEqual(h.display.matched[0], h.display.anchor);
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
  assert.equal(window.showInactiveCount, 0);
  assert.equal(window.isFocused(), true);
  assert.equal(h.widget.show(), true);
  assert.equal(h.windows.length, 1);
  assert.equal(window.showCount, 2);
  assert.deepEqual(h.changes, []);
});

test('Mac reopening follows tray moves and clamps the panel inside its display', () => {
  const h = createHarness();
  h.widget.show();
  const window = h.windows[0];
  window.emit('ready-to-show');
  h.widget.hide();
  h.display.matching = {
    bounds: { x: -1920, y: 0, width: 1920, height: 1080 },
    workArea: { x: -1920, y: 24, width: 1920, height: 1056 },
  };
  h.display.anchor = { x: -24, y: 0, width: 24, height: 24 };
  h.widget.show();
  assert.deepEqual(window.bounds, { x: -348, y: 30, width: 340, height: 180 });
  assert.equal(h.windows.length, 1);
  assert.deepEqual(h.display.matched.at(-1), h.display.anchor);
  h.widget.hide();
  h.display.anchor = { x: -1920, y: 1070, width: 24, height: 24 };
  h.widget.show();
  assert.deepEqual(window.bounds, {
    x: -1912,
    y: 892,
    width: 340,
    height: 180,
  });
});

for (const anchor of [null, { x: 0, y: 0, width: 0, height: 0 }]) {
  test(`Mac ${anchor ? 'zero-sized' : 'missing'} tray bounds fall back to the nearest display's top-right`, () => {
    const h = createHarness({ getAnchorBounds: () => anchor });
    h.widget.show();
    const window = h.windows[0];
    assert.deepEqual(window.bounds, {
      x: 3000,
      y: 106,
      width: 340,
      height: 180,
    });
    assert.deepEqual(h.display.nearestPoints[0], h.display.cursor);
    assert.equal(h.display.matched.length, 0);
  });
}

test('Mac startup ignores tray bounds below the display until a real anchor is available', () => {
  const h = createHarness();
  const display = {
    bounds: { x: 0, y: 0, width: 3440, height: 1440 },
    workArea: { x: 0, y: 30, width: 3440, height: 1320 },
  };
  h.display.nearest = display;
  h.display.matching = display;
  h.display.cursor = { x: 2900, y: 15 };
  h.display.anchor = { x: 0, y: 1440, width: 34, height: 0 };
  h.widget.show();
  const window = h.windows[0];
  const fallback = { x: 3080, y: 36, width: 340, height: 180 };
  assert.deepEqual(window.bounds, fallback);

  h.display.anchor = { x: 0, y: 1440, width: 34, height: 30 };
  window.emit('ready-to-show');
  assert.deepEqual(window.bounds, fallback);
  assert.equal(window.isVisible(), true);
  assert.deepEqual(h.display.nearestPoints.at(-1), h.display.cursor);

  h.widget.hide();
  h.display.anchor = { x: 2875, y: 0, width: 34, height: 30 };
  h.widget.show();
  assert.deepEqual(window.bounds, { x: 2722, y: 36, width: 340, height: 180 });
  assert.equal(h.windows.length, 1);
});

test('Mac keeps the last on-display tray anchor through transient invalid bounds', () => {
  const h = createHarness();
  const display = {
    bounds: { x: 0, y: 0, width: 3440, height: 1440 },
    workArea: { x: 0, y: 30, width: 3440, height: 1320 },
  };
  h.display.nearest = display;
  h.display.matching = display;
  h.display.anchor = { x: 2875, y: 0, width: 34, height: 30 };
  h.widget.show();
  const window = h.windows[0];
  window.emit('ready-to-show');
  const anchored = { x: 2722, y: 36, width: 340, height: 180 };
  assert.deepEqual(window.bounds, anchored);

  for (const transient of [
    null,
    { x: 0, y: 1440, width: 34, height: 0 },
    { x: 0, y: 1440, width: 34, height: 30 },
    { x: -9000, y: -9000, width: 34, height: 30 },
    { x: Number.NaN, y: 0, width: 34, height: 30 },
  ]) {
    h.widget.hide();
    h.display.anchor = transient;
    h.widget.show();
    assert.deepEqual(window.bounds, anchored);
    assert.equal(window.isVisible(), true);
  }
  assert.equal(h.windows.length, 1);
  assert.equal(h.display.nearestPoints.length, 0);
});

test('Mac falls back when the cached tray anchor belongs to a disconnected display', () => {
  const h = createHarness();
  h.display.matching = {
    bounds: { x: 1920, y: 80, width: 1440, height: 920 },
    workArea: { x: 1920, y: 100, width: 1440, height: 900 },
  };
  h.widget.show();
  const window = h.windows[0];
  window.emit('ready-to-show');
  assert.deepEqual(window.bounds, { x: 2342, y: 106, width: 340, height: 180 });

  h.widget.hide();
  const remainingDisplay = {
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 0, y: 24, width: 1920, height: 1056 },
  };
  h.display.matching = remainingDisplay;
  h.display.nearest = remainingDisplay;
  h.display.cursor = { x: 1700, y: 12 };
  h.display.anchor = null;
  h.widget.show();
  assert.deepEqual(window.bounds, { x: 1560, y: 30, width: 340, height: 180 });
  assert.deepEqual(h.display.nearestPoints.at(-1), h.display.cursor);

  h.widget.hide();
  h.display.anchor = { x: 1400, y: 0, width: 24, height: 24 };
  h.widget.show();
  assert.deepEqual(window.bounds, { x: 1242, y: 30, width: 340, height: 180 });
  assert.equal(h.windows.length, 1);
});

test('a physically small Mac display bounds both panel dimensions and margins', () => {
  const h = createHarness({ getAnchorBounds: () => null });
  h.display.nearest = { workArea: { x: 100, y: 50, width: 200, height: 120 } };
  h.widget.show();
  assert.deepEqual(h.windows[0].bounds, {
    x: 108,
    y: 56,
    width: 184,
    height: 106,
  });
});

test('Windows keeps the inactive floating bottom-right window and close destroys it', () => {
  const h = createHarness({ platform: 'win32' });
  h.widget.show();
  const window = h.windows[0];
  assert.equal(window.config.type, undefined);
  assert.notEqual(window.config.movable, false);
  assert.deepEqual(window.bounds, { x: 3000, y: 800, width: 340, height: 180 });
  window.emit('ready-to-show');
  assert.equal(window.showInactiveCount, 1);
  assert.equal(window.showCount, 0);
  assert.equal(window.isFocused(), false);
  h.widget.show();
  assert.equal(window.showInactiveCount, 2);
  h.handlers.get('tracking-widget:close')(h.event);
  assert.equal(window.closeCount, 1);
  assert.equal(window.isDestroyed(), true);
  h.widget.show();
  assert.equal(h.windows.length, 2);
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
  window.destroy();
  for (const handler of h.handlers.values()) {
    assert.throws(() => handler(event, true), /IPC sender/);
  }
});

test('Mac actions accept only boolean tracking changes and hide without changing tracking', () => {
  const h = createHarness();
  h.widget.show();
  h.windows[0].emit('ready-to-show');
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
  assert.equal(h.windows[0].isVisible(), false);
  h.widget.show();
  assert.equal(h.windows[0].isVisible(), true);
  assert.equal(h.handlers.get('tracking-widget:close')(event), true);
  assert.equal(h.windows[0].isVisible(), false);
  assert.equal(h.windows[0].closeCount, 0);
  assert.equal(h.windows[0].isDestroyed(), false);
  assert.equal(h.state.trackingEnabled, false);
  assert.deepEqual(h.changes, [true, false]);
  assert.equal(h.widget.show(), true);
  assert.equal(h.windows.length, 1);
});

test('Mac toggle alternates visible state and keeps the same loaded panel', () => {
  const h = createHarness();
  h.widget.toggle();
  const window = h.windows[0];
  window.emit('ready-to-show');
  assert.equal(window.isVisible(), true);
  h.widget.toggle();
  assert.equal(window.isVisible(), false);
  h.widget.toggle();
  assert.equal(window.isVisible(), true);
  assert.equal(h.windows.length, 1);
  assert.deepEqual(h.changes, []);
});

for (const dismiss of ['hide', 'toggle']) {
  test(`${dismiss} before ready cancels presentation, and repeated show cannot reveal an unloaded panel`, () => {
    const h = createHarness();
    h.widget.show();
    h.widget.show();
    const window = h.windows[0];
    assert.equal(h.windows.length, 1);
    assert.equal(window.showCount, 0);
    h.widget[dismiss]();
    window.emit('ready-to-show');
    assert.equal(window.isVisible(), false);
    assert.equal(window.showCount, 0);
    h.widget.show();
    assert.equal(window.showCount, 1);
    assert.equal(window.isVisible(), true);
  });
}

test('ready-to-show from a destroyed older panel cannot reveal either window early', () => {
  const h = createHarness();
  h.widget.show();
  const obsolete = h.windows[0];
  obsolete.destroy();
  h.widget.show();
  const current = h.windows[1];
  obsolete.emit('ready-to-show');
  assert.equal(obsolete.showCount, 0);
  assert.equal(current.showCount, 0);
  current.emit('ready-to-show');
  assert.equal(current.showCount, 1);
});

test('Mac blur outside the tray immediately hides the panel', () => {
  const h = createHarness();
  h.widget.show();
  const window = h.windows[0];
  window.emit('ready-to-show');
  window.focused = false;
  window.emit('blur');
  assert.equal(window.isVisible(), false);
  assert.equal(window.isDestroyed(), false);
  assert.deepEqual(h.changes, []);
});

test('Mac tray blur waits 200ms before hiding a still-unfocused panel', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = createHarness();
  t.after(() => h.widget.dispose());
  h.display.cursor = { x: 2512, y: 90 };
  h.widget.show();
  const window = h.windows[0];
  window.emit('ready-to-show');
  window.focused = false;
  window.emit('blur');
  assert.equal(window.isVisible(), true);
  t.mock.timers.tick(199);
  assert.equal(window.isVisible(), true);
  t.mock.timers.tick(1);
  assert.equal(window.isVisible(), false);
});

test('a tray click after blur closes once instead of reopening the panel', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = createHarness();
  t.after(() => h.widget.dispose());
  h.display.cursor = { x: 2512, y: 90 };
  h.widget.show();
  const window = h.windows[0];
  window.emit('ready-to-show');
  window.focused = false;
  window.emit('blur');
  h.widget.toggle();
  assert.equal(window.isVisible(), false);
  const hidden = window.hideCount;
  t.mock.timers.tick(200);
  assert.equal(window.hideCount, hidden);
  assert.equal(window.showCount, 1);
});

test('the delayed Mac blur rechecks focus before hiding', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = createHarness();
  t.after(() => h.widget.dispose());
  h.display.cursor = { x: 2512, y: 90 };
  h.widget.show();
  const window = h.windows[0];
  window.emit('ready-to-show');
  window.focused = false;
  window.emit('blur');
  // Focus may already have changed before the native focus event is delivered.
  window.focused = true;
  t.mock.timers.tick(200);
  assert.equal(window.isVisible(), true);
  assert.equal(window.hideCount, 0);
});

for (const action of ['show', 'hide', 'focus', 'dispose']) {
  test(`${action} cancels a delayed tray blur from the previous interaction`, (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const h = createHarness();
    t.after(() => h.widget.dispose());
    h.display.cursor = { x: 2512, y: 90 };
    h.widget.show();
    const window = h.windows[0];
    window.emit('ready-to-show');
    window.focused = false;
    window.emit('blur');
    if (action === 'focus') window.focus();
    else h.widget[action]();
    const hidden = window.hideCount;
    // A late event must not let the old timer dismiss a newer presentation.
    window.focused = false;
    t.mock.timers.tick(200);
    assert.equal(window.hideCount, hidden);
    assert.equal(window.isDestroyed(), action === 'dispose');
  });
}

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
  assert.equal(h.windows[0].isDestroyed(), true);
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
