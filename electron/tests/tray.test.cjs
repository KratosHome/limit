const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function harness(platform) {
  const calls = [];
  const trays = [];
  const settings = { trackingEnabled: true, language: 'en' };
  let updateState = { status: 'idle' };
  class Tray extends EventEmitter {
    constructor(icon) {
      super();
      this.icon = icon;
      this.contextMenus = [];
      this.popups = [];
      trays.push(this);
    }
    setToolTip(text) {
      this.tooltip = text;
    }
    setContextMenu(menu) {
      this.contextMenus.push(menu);
    }
    popUpContextMenu(menu) {
      calls.push('context-menu');
      this.popups.push(menu);
    }
    setIgnoreDoubleClickEvents(value) {
      this.ignoreDoubleClicks = value;
    }
    getBounds() {
      return { x: 100, y: 0, width: 24, height: 24 };
    }
  }
  const image = {
    setTemplateImage: (value) => {
      image.template = value;
    },
  };
  const context = vm.createContext({
    Buffer,
    process: { platform, env: {} },
    console,
    __dirname: path.resolve(__dirname, '..'),
    require(name) {
      if (name === 'electron')
        return {
          app: {
            isPackaged: true,
            getPath: () => '/tmp',
            setPath: () => {},
            setAppUserModelId: () => {},
            requestSingleInstanceLock: () => true,
            on: () => {},
            whenReady: () => new Promise(() => {}),
            getVersion: () => '0.1.0',
            quit: () => calls.push('quit'),
          },
          Menu: { buildFromTemplate: (items) => ({ items }) },
          nativeImage: { createFromBitmap: () => image },
          Tray,
        };
      if (name === './i18n.cjs') return require('../i18n.cjs');
      if (name === './tray-icon.cjs') return require('../tray-icon.cjs');
      if (name.startsWith('node:')) return require(name);
      return {};
    },
  });
  const api = vm.runInContext(
    `${fs.readFileSync(path.join(__dirname, '../main.cjs'), 'utf8')}
    ;({
      setup(nextStore, widget, window, updater) {
        store = nextStore;
        trackingWidget = widget;
        mainWindow = window;
        appUpdater = updater;
        tracker = { getStatus: () => ({ activityState: 'active' }) };
        createTray();
      },
      refreshTrayMenu,
      trackingWidgetState,
    })`,
    context,
  );
  api.setup(
    { getSettings: () => settings },
    {
      toggle: () => calls.push('toggle-widget'),
      hide: () => calls.push('hide-widget'),
    },
    {
      isDestroyed: () => false,
      show: () => calls.push('show-main'),
      focus: () => calls.push('focus-main'),
    },
    {
      getState: () => updateState,
      downloadUpdate: async () => {
        calls.push('download-update');
        return true;
      },
      installUpdate: () => {
        calls.push('install-update');
        return true;
      },
      checkForUpdates: () => calls.push('check-update'),
    },
  );
  return {
    calls,
    settings,
    tray: trays[0],
    refresh: api.refreshTrayMenu,
    getWidgetState: api.trackingWidgetState,
    setUpdateState: (state) => (updateState = state),
  };
}

test('macOS tray clicks toggle the popover without attaching an automatic native menu', () => {
  const h = harness('darwin');
  assert.deepEqual(h.tray.contextMenus, []);
  assert.equal(h.tray.ignoreDoubleClicks, true);
  assert.equal(h.tray.icon.template, true);
  h.tray.emit('click');
  h.tray.emit('click');
  assert.deepEqual(h.calls, ['toggle-widget', 'toggle-widget']);
  assert.equal(h.getWidgetState().presentation, 'menu-bar');
});

test('macOS right-click hides the popover and retains current open, tracking, update and quit actions', async () => {
  const h = harness('darwin');
  h.settings.trackingEnabled = false;
  h.setUpdateState({ status: 'available', version: '0.2.0' });
  h.tray.emit('right-click');
  assert.deepEqual(h.calls, ['hide-widget', 'context-menu']);
  const menu = h.tray.popups.at(-1);
  assert.ok(menu.items.some((item) => item.label === 'Resume tracking'));
  menu.items.find((item) => item.label === 'Open Limit').click();
  menu.items.find((item) => item.label === 'Download update 0.2.0').click();
  await Promise.resolve();
  assert.ok(h.calls.includes('show-main'));
  assert.ok(h.calls.includes('download-update'));

  h.setUpdateState({ status: 'downloaded', version: '0.2.0' });
  h.refresh();
  h.tray.emit('right-click');
  const refreshed = h.tray.popups.at(-1);
  assert.notEqual(refreshed, menu);
  refreshed.items
    .find((item) => item.label === 'Restart and update to 0.2.0')
    .click();
  refreshed.items.find((item) => item.label === 'Quit').click();
  assert.ok(h.calls.includes('install-update'));
  assert.equal(h.calls.at(-1), 'quit');
  assert.deepEqual(h.tray.contextMenus, []);
});

for (const platform of ['win32', 'linux']) {
  test(`${platform} keeps its attached context menu and opens the main window on tray activation`, () => {
    const h = harness(platform);
    assert.equal(h.tray.contextMenus.length, 1);
    h.tray.emit('click');
    assert.deepEqual(h.calls, ['show-main', 'focus-main']);
    assert.equal(h.tray.listenerCount('right-click'), 0);
    h.refresh();
    assert.equal(h.tray.contextMenus.length, 2);
    assert.equal(h.getWidgetState().presentation, 'floating');
  });
}
