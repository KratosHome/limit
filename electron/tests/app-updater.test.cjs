const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const { createAppUpdater } = require('../app-updater.cjs');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function harness(options = {}) {
  const updater = new EventEmitter();
  const intervals = new Map();
  const states = [];
  const errors = [];
  let checks = 0;
  let installs = 0;
  updater.checkForUpdates = async () => {
    checks += 1;
    updater.emit('checking-for-update');
    updater.emit('update-not-available', { version: '0.1.0' });
    return { isUpdateAvailable: false };
  };
  updater.quitAndInstall = () => {
    installs += 1;
  };
  const controller = createAppUpdater({
    app: { isPackaged: true, whenReady: () => Promise.resolve() },
    autoUpdater: updater,
    enabled: true,
    onStateChange: (state) => states.push(state),
    logger: { error: (...args) => errors.push(args) },
    timers: {
      setInterval: (callback, milliseconds) => {
        const timer = {};
        intervals.set(timer, { callback, milliseconds });
        return timer;
      },
      clearInterval: (timer) => intervals.delete(timer),
    },
    ...options,
  });
  return {
    controller,
    updater,
    intervals,
    states,
    errors,
    get checks() {
      return checks;
    },
    get installs() {
      return installs;
    },
  };
}

test('checks on startup and every four hours without forcing a restart', async () => {
  const h = harness();
  await h.controller.start();
  await h.controller.checkForUpdates();
  assert.equal(h.checks, 1);
  assert.equal(h.updater.autoDownload, true);
  assert.equal(h.updater.autoInstallOnAppQuit, true);
  assert.equal(h.intervals.size, 1);
  const timer = [...h.intervals.values()][0];
  assert.equal(timer.milliseconds, 4 * 60 * 60_000);
  timer.callback();
  await h.controller.checkForUpdates();
  assert.equal(h.checks, 2);
  assert.equal(h.installs, 0);
  assert.deepEqual(h.controller.getState(), { status: 'idle' });
  await h.controller.start();
  assert.equal(h.intervals.size, 1);
  h.controller.dispose();
  assert.equal(h.intervals.size, 0);
});

test('downloads in the background and keeps the downloaded update until quit', async () => {
  const h = harness();
  const download = deferred();
  let checks = 0;
  h.updater.checkForUpdates = async () => {
    checks += 1;
    h.updater.emit('update-available', { version: '0.2.0' });
    return { downloadPromise: download.promise };
  };
  await h.controller.start();
  const first = h.controller.checkForUpdates();
  assert.equal(h.controller.checkForUpdates(), first);
  assert.deepEqual(h.controller.getState(), {
    status: 'downloading',
    version: '0.2.0',
  });
  h.updater.emit('download-progress', { percent: 25 });
  assert.equal(checks, 1);
  h.updater.emit('update-downloaded', { version: '0.2.0' });
  download.resolve(['/tmp/Limit-0.2.0.exe']);
  await first;
  assert.equal(h.installs, 0);
  assert.equal(await h.controller.checkForUpdates(), false);
  assert.equal(checks, 1);
  assert.deepEqual(h.controller.getState(), {
    status: 'downloaded',
    version: '0.2.0',
  });
  assert.equal(Object.isFrozen(h.controller.getState()), true);
  assert.notEqual(h.controller.getState(), h.controller.getState());
  h.controller.dispose();
});

test('manual mode checks for newer releases without downloading or installing', async () => {
  let quitPreparations = 0;
  const h = harness({
    manualInstall: true,
    prepareToQuit: () => {
      quitPreparations += 1;
    },
  });
  let checks = 0;
  let downloads = 0;
  h.updater.downloadUpdate = async () => {
    downloads += 1;
    return ['/tmp/update.zip'];
  };
  h.updater.checkForUpdates = async () => {
    checks += 1;
    const version = `0.${checks + 1}.0`;
    h.updater.emit('update-available', { version });
    return {
      isUpdateAvailable: true,
      downloadPromise: h.updater.autoDownload
        ? h.updater.downloadUpdate()
        : null,
    };
  };
  await h.controller.start();
  await h.controller.checkForUpdates();
  assert.equal(h.updater.autoDownload, false);
  assert.equal(h.updater.autoInstallOnAppQuit, false);
  assert.deepEqual(h.controller.getState(), {
    status: 'available',
    version: '0.2.0',
  });
  assert.equal(h.controller.installUpdate(), false);

  await h.controller.checkForUpdates();
  assert.deepEqual(h.controller.getState(), {
    status: 'available',
    version: '0.3.0',
  });
  const timer = [...h.intervals.values()][0];
  timer.callback();
  await h.controller.checkForUpdates();
  assert.deepEqual(h.controller.getState(), {
    status: 'available',
    version: '0.4.0',
  });
  assert.equal(checks, 3);
  assert.equal(downloads, 0);
  assert.equal(h.installs, 0);
  assert.equal(quitPreparations, 0);
  assert.equal(
    h.states.some((state) => state.status === 'downloading'),
    false,
  );
  assert.equal(
    h.states.some((state) => state.status === 'downloaded'),
    false,
  );
  h.controller.dispose();
});

test('manual mode retries failed release checks without enabling native installation', async () => {
  const h = harness({ manualInstall: true });
  let checks = 0;
  h.updater.checkForUpdates = async () => {
    checks += 1;
    if (checks === 1) throw new Error('release server unavailable');
    h.updater.emit('update-available', { version: '0.2.0' });
    return { isUpdateAvailable: true };
  };
  await h.controller.start();
  assert.equal(await h.controller.checkForUpdates(), false);
  assert.equal(h.controller.getState().status, 'error');
  assert.equal(await h.controller.checkForUpdates(), true);
  assert.deepEqual(h.controller.getState(), {
    status: 'available',
    version: '0.2.0',
  });
  h.updater.emit('download-progress', { percent: 100 });
  h.updater.emit('update-downloaded', { version: '0.2.0' });
  assert.equal(h.controller.getState().status, 'available');
  assert.equal(h.controller.installUpdate(), false);
  assert.equal(h.installs, 0);
  assert.equal(h.updater.autoDownload, false);
  assert.equal(h.updater.autoInstallOnAppQuit, false);
  h.controller.dispose();
});

test('failed checks and downloads are caught and can be retried', async () => {
  const h = harness();
  let checks = 0;
  h.updater.checkForUpdates = async () => {
    checks += 1;
    const error = new Error(checks === 1 ? 'offline' : 'download interrupted');
    if (checks === 1) {
      h.updater.emit('error', error);
      throw error;
    }
    if (checks === 2) {
      h.updater.emit('update-available', { version: '0.2.0' });
      return { downloadPromise: Promise.reject(error) };
    }
    h.updater.emit('update-not-available');
    return { isUpdateAvailable: false };
  };
  await h.controller.start();
  assert.equal(await h.controller.checkForUpdates(), false);
  assert.equal(h.controller.getState().status, 'error');
  assert.equal(await h.controller.checkForUpdates(), false);
  assert.equal(h.controller.getState().status, 'error');
  assert.equal(await h.controller.checkForUpdates(), true);
  assert.equal(h.controller.getState().status, 'idle');
  assert.equal(h.errors.length, 2);
  h.controller.dispose();
});

test('restart action allows tray windows to close before invoking the installer', async () => {
  const order = [];
  const h = harness({ prepareToQuit: () => order.push('allow-close') });
  h.updater.quitAndInstall = (...args) => {
    order.push('install');
    assert.deepEqual(args, [false, true]);
  };
  await h.controller.start();
  await h.controller.checkForUpdates();
  assert.equal(h.controller.installUpdate(), false);
  h.updater.emit('update-downloaded', { version: '0.2.0' });
  assert.equal(h.controller.installUpdate(), true);
  assert.equal(h.controller.installUpdate(), false);
  assert.deepEqual(order, ['allow-close', 'install']);
  h.controller.dispose();
});

test('install failures restore tray behavior for thrown and emitted errors', async () => {
  for (const failure of ['throw', 'event']) {
    let canClose = false;
    const h = harness({
      prepareToQuit: () => {
        canClose = true;
        return () => {
          canClose = false;
        };
      },
    });
    await h.controller.start();
    await h.controller.checkForUpdates();
    h.updater.emit('update-downloaded', { version: '0.2.0' });
    h.updater.quitAndInstall = () => {
      assert.equal(canClose, true);
      if (failure === 'throw') throw new Error('installer missing');
      h.updater.emit('error', new Error('installer missing'));
    };
    assert.equal(h.controller.installUpdate(), false);
    assert.equal(canClose, false);
    assert.equal(h.controller.getState().status, 'error');
    assert.equal(await h.controller.checkForUpdates(), true);
    h.controller.dispose();
  }
});

test('development and disabled builds never configure the updater or schedule checks', async () => {
  for (const options of [
    { enabled: false },
    {
      app: {
        isPackaged: false,
        whenReady: () => {
          throw new Error('unused');
        },
      },
    },
  ]) {
    const h = harness(options);
    await h.controller.start();
    assert.equal(await h.controller.checkForUpdates(), false);
    assert.equal(h.controller.installUpdate(), false);
    assert.deepEqual(h.controller.getState(), { status: 'disabled' });
    assert.equal(h.checks, 0);
    assert.equal(h.intervals.size, 0);
    assert.equal(h.updater.autoDownload, undefined);
    assert.equal(h.updater.listenerCount('error'), 0);
    h.controller.dispose();
  }
});

test('disposal before app readiness prevents startup work', async () => {
  const ready = deferred();
  const h = harness({
    app: { isPackaged: true, whenReady: () => ready.promise },
  });
  const start = h.controller.start();
  h.controller.dispose();
  ready.resolve();
  await start;
  assert.equal(h.checks, 0);
  assert.equal(h.intervals.size, 0);
  assert.equal(h.updater.listenerCount('error'), 0);
});

test('disposal safely handles an in-flight failure without notifying the UI', async () => {
  const download = deferred();
  const h = harness();
  h.updater.checkForUpdates = async () => ({
    downloadPromise: download.promise,
  });
  await h.controller.start();
  const attempt = h.controller.checkForUpdates();
  const statesBeforeDispose = h.states.length;
  h.controller.dispose();
  const error = new Error('closed connection');
  h.updater.emit('error', error);
  download.reject(error);
  assert.equal(await attempt, false);
  assert.equal(h.states.length, statesBeforeDispose);
  assert.equal(h.updater.listenerCount('error'), 0);
  assert.equal(h.intervals.size, 0);
});
