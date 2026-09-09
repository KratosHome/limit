const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const updaterModule = require('../app-updater.cjs');

function mainHarness() {
  const handlers = new Map();
  const opened = [];
  let quits = 0;
  let dialogs = 0;
  let openError = '';
  const electron = {
    app: {
      isPackaged: true,
      getPath: () => '/tmp',
      setPath: () => {},
      requestSingleInstanceLock: () => true,
      on: () => {},
      whenReady: () => new Promise(() => {}),
      getVersion: () => '0.1.0',
      quit: () => quits++,
    },
    ipcMain: {
      handle: (channel, handler) => handlers.set(channel, handler),
      on: () => {},
    },
    shell: {
      openPath: async (filePath) => {
        opened.push(filePath);
        return openError;
      },
    },
    dialog: { showMessageBox: () => dialogs++ },
  };
  const context = vm.createContext({
    require: (name) => {
      if (name === 'electron') return electron;
      if (name === './app-updater.cjs') return updaterModule;
      if (name.startsWith('node:')) return require(name);
      return {};
    },
    process: { platform: 'darwin', env: {} },
    console: { error: () => {} },
    __dirname: path.resolve(__dirname, '..'),
  });
  const source = fs.readFileSync(path.join(__dirname, '../main.cjs'), 'utf8');
  const api = vm.runInContext(
    `${source}\n;({ setup(updater, window) { appUpdater = updater; mainWindow = window; registerIpc(); } })`,
    context,
  );
  const frame = { url: 'file:///app/index.html' };
  const contents = { mainFrame: frame, getURL: () => frame.url };
  const event = { sender: contents, senderFrame: frame };
  return {
    handlers,
    event,
    opened,
    setup: (updater) => api.setup(updater, { webContents: contents }),
    setOpenError: (error) => (openError = error),
    get quits() {
      return quits;
    },
    get dialogs() {
      return dialogs;
    },
  };
}

test('update IPC trusts only the main frame and exposes only public state', async () => {
  const h = mainHarness();
  let checks = 0;
  h.setup({
    getState: () => ({
      status: 'installer-ready',
      version: '0.2.0',
      filePath: '/private/verified-update.dmg',
    }),
    checkForUpdates: () => {
      checks++;
      return Promise.resolve(true);
    },
  });
  const getState = h.handlers.get('updates:get-state');
  assert.deepEqual(getState(h.event), {
    status: 'installer-ready',
    currentVersion: '0.1.0',
    version: '0.2.0',
  });
  for (const channel of [
    'updates:get-state',
    'updates:check',
    'updates:download',
    'updates:install',
    'updates:open-installer',
  ]) {
    const handler = h.handlers.get(channel);
    assert.equal(typeof handler, 'function');
    assert.throws(() => handler({ ...h.event, sender: {} }), /IPC sender/);
    assert.throws(
      () =>
        handler({ ...h.event, senderFrame: { url: h.event.senderFrame.url } }),
      /IPC sender/,
    );
  }
  assert.equal(checks, 0);
  assert.equal(await h.handlers.get('updates:check')(h.event), true);
  assert.equal(checks, 1);
  assert.deepEqual(h.opened, []);
  assert.equal(h.dialogs, 0);
});

test('installer opens only on an explicit request using the verified main-process path', async () => {
  const h = mainHarness();
  let state = { status: 'available', version: '0.2.0' };
  h.setup({ getState: () => state });
  const open = h.handlers.get('updates:open-installer');
  assert.equal(await open(h.event, '/tmp/arbitrary-file'), false);
  assert.deepEqual(h.opened, []);
  state = {
    ...state,
    status: 'installer-ready',
    filePath: '/private/verified.dmg',
  };
  h.setOpenError('Unable to open');
  assert.equal(await open(h.event), false);
  assert.equal(h.quits, 0);
  assert.equal(h.dialogs, 0);
  assert.equal(state.status, 'installer-ready');
  h.setOpenError('');
  const request = open(h.event, '/tmp/arbitrary-file');
  assert.equal(open(h.event), request);
  assert.equal(await request, true);
  assert.deepEqual(h.opened, [
    '/private/verified.dmg',
    '/private/verified.dmg',
  ]);
  assert.equal(h.quits, 1);
  assert.equal(h.dialogs, 0);
});

test('preload exposes narrow update actions and cleans up state subscriptions', async () => {
  const invocations = [];
  const listeners = new Map();
  let api;
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../preload.cjs'), 'utf8'),
    {
      require: () => ({
        contextBridge: { exposeInMainWorld: (_name, value) => (api = value) },
        ipcRenderer: {
          invoke: (...args) => {
            invocations.push(args);
            return Promise.resolve(true);
          },
          on: (channel, callback) => listeners.set(channel, callback),
          removeListener: (channel, callback) => {
            assert.equal(listeners.get(channel), callback);
            listeners.delete(channel);
          },
        },
      }),
    },
  );
  for (const [method, channel] of [
    ['getAppUpdateState', 'updates:get-state'],
    ['checkForAppUpdates', 'updates:check'],
    ['downloadAppUpdate', 'updates:download'],
    ['installAppUpdate', 'updates:install'],
    ['openAppUpdateInstaller', 'updates:open-installer'],
  ]) {
    await api[method]('/tmp/arbitrary-file');
    assert.deepEqual(invocations.at(-1), [channel]);
  }
  const received = [];
  const unsubscribe = api.onAppUpdateState((...args) => received.push(args));
  const state = { status: 'available', version: '0.2.0' };
  listeners.get('updates:state')({ sender: 'private event' }, state);
  assert.deepEqual(received, [[state]]);
  unsubscribe();
  assert.equal(listeners.size, 0);
  api.onAppUpdateState(null)();
  assert.equal(listeners.size, 0);
});

test('the installer IPC refuses cached equal, older or invalid versions', async () => {
  for (const version of ['0.0.9', '0.1.0', 'invalid', undefined]) {
    const h = mainHarness();
    h.setup({
      getState: () => ({
        status: 'installer-ready',
        version,
        filePath: '/private/cached.dmg',
      }),
    });
    assert.equal(
      await h.handlers.get('updates:open-installer')(h.event),
      false,
    );
    assert.deepEqual(h.opened, []);
    assert.equal(h.quits, 0);
  }
});
