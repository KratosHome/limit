const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const {
  createAppUpdater,
  publicAppUpdateState,
} = require('../app-updater.cjs');

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

function manualUpdateInfo() {
  return {
    version: '0.2.0',
    tag: 'v0.2.0',
    files: [
      {
        url: 'Limit-0.2.0-mac-universal.dmg',
        sha512: Buffer.alloc(64, 7).toString('base64'),
        size: 1024,
      },
    ],
  };
}

test('checks on startup and every four hours without forcing a restart', async () => {
  const h = harness();
  await h.controller.start();
  await h.controller.checkForUpdates();
  assert.equal(h.checks, 1);
  assert.equal(h.updater.autoDownload, false);
  assert.equal(h.updater.autoInstallOnAppQuit, false);
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

test('native updates wait for download and install clicks, with shared progress', async () => {
  const h = harness();
  const download = deferred();
  let downloads = 0;
  h.updater.checkForUpdates = async () => {
    h.updater.emit('update-available', { version: '0.2.0' });
    return { isUpdateAvailable: true };
  };
  h.updater.downloadUpdate = () => {
    downloads += 1;
    return download.promise;
  };
  await h.controller.start();
  await h.controller.checkForUpdates();
  assert.deepEqual(h.controller.getState(), {
    status: 'available',
    version: '0.2.0',
  });
  assert.equal(downloads, 0);
  assert.equal(h.controller.installUpdate(), false);
  assert.equal(h.updater.autoDownload, false);
  assert.equal(h.updater.autoInstallOnAppQuit, false);

  const first = h.controller.downloadUpdate();
  assert.equal(h.controller.downloadUpdate(), first);
  await Promise.resolve();
  assert.equal(downloads, 1);
  assert.equal(await h.controller.checkForUpdates(), false);
  h.updater.emit('download-progress', { percent: 25 });
  assert.deepEqual(h.controller.getState(), {
    status: 'downloading',
    version: '0.2.0',
    percent: 25,
  });
  h.updater.emit('update-downloaded', { version: '0.2.0' });
  download.resolve(['/tmp/Limit-0.2.0.exe']);
  assert.equal(await first, true);
  assert.equal(h.installs, 0);
  assert.equal(await h.controller.checkForUpdates(), false);
  assert.deepEqual(h.controller.getState(), {
    status: 'downloaded',
    version: '0.2.0',
  });
  assert.equal(Object.isFrozen(h.controller.getState()), true);
  assert.notEqual(h.controller.getState(), h.controller.getState());
  assert.equal(await h.controller.downloadUpdate(), true);
  assert.equal(downloads, 1);
  assert.equal(h.controller.installUpdate(), true);
  assert.equal(h.installs, 1);
  h.controller.dispose();
});

test('failed native downloads retry on click and do not trigger a new release check', async () => {
  const h = harness();
  await h.controller.start();
  await h.controller.checkForUpdates();
  const checksBeforeDownload = h.checks;
  let downloads = 0;
  h.updater.emit('update-available', { version: '0.2.0' });
  h.updater.downloadUpdate = async () => {
    downloads += 1;
    if (downloads === 1) throw new Error('offline');
    return ['/tmp/Limit-0.2.0.exe'];
  };
  assert.equal(await h.controller.downloadUpdate(), null);
  assert.deepEqual(h.controller.getState(), {
    status: 'error',
    version: '0.2.0',
    errorAction: 'download',
  });
  assert.equal(await h.controller.downloadUpdate(), true);
  assert.equal(h.checks, checksBeforeDownload);
  assert.equal(downloads, 2);
  assert.equal(h.installs, 0);
  h.controller.dispose();
});

test('public update snapshots flatten release information and hide installer paths', async () => {
  const h = harness({
    manualInstall: true,
    downloadInstaller: async () => '/private/update.dmg',
  });
  await h.controller.start();
  await h.controller.checkForUpdates();
  h.updater.emit('update-available', {
    ...manualUpdateInfo(),
    releaseName: 'Polished updates',
    releaseDate: '2026-09-09T10:00:00Z',
    releaseNotes: [
      { version: '0.2.0', note: 'First change' },
      { version: '0.1.1', note: 'Second change' },
      { note: 42 },
    ],
  });
  await h.controller.downloadUpdate();
  assert.deepEqual(publicAppUpdateState(h.controller.getState(), '0.1.0'), {
    status: 'installer-ready',
    currentVersion: '0.1.0',
    version: '0.2.0',
    releaseName: 'Polished updates',
    releaseDate: '2026-09-09T10:00:00Z',
    releaseNotes: 'First change\n\nSecond change',
  });
  assert.deepEqual(publicAppUpdateState(undefined, '0.1.0'), {
    status: 'disabled',
    currentVersion: '0.1.0',
  });
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

test('manual download shares one transfer, preserves metadata and exposes the verified installer', async () => {
  const transfer = deferred();
  const info = manualUpdateInfo();
  const expectedInfo = structuredClone(info);
  const calls = [];
  let checks = 0;
  const h = harness({
    manualInstall: true,
    downloadInstaller: (metadata, options) => {
      calls.push({ metadata, options });
      return transfer.promise;
    },
  });
  h.updater.downloadUpdate = () => {
    throw new Error('Manual DMG download must not invoke native Squirrel');
  };
  h.updater.checkForUpdates = async () => {
    checks += 1;
    h.updater.emit('update-available', info);
    return { isUpdateAvailable: true, updateInfo: info };
  };
  await h.controller.start();
  await h.controller.checkForUpdates();
  assert.equal(h.updater.autoDownload, false);
  assert.equal(h.updater.autoInstallOnAppQuit, false);

  // Providers may reuse their result object for a later check. The clicked
  // installer must remain tied to the version and checksum already announced.
  info.version = '0.9.0';
  info.files[0].url = 'changed.dmg';
  info.files[0].sha512 = 'changed-checksum';
  const first = h.controller.downloadUpdate();
  assert.equal(h.controller.downloadUpdate(), first);
  assert.deepEqual(h.controller.getState(), {
    status: 'downloading',
    version: '0.2.0',
    percent: 0,
  });
  await Promise.resolve();
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].metadata, expectedInfo);
  assert.equal(calls[0].options.signal.aborted, false);
  calls[0].options.onProgress(42);
  assert.deepEqual(h.controller.getState(), {
    status: 'downloading',
    version: '0.2.0',
    percent: 42,
  });
  const timer = [...h.intervals.values()][0];
  timer.callback();
  assert.equal(await h.controller.checkForUpdates(), false);
  assert.equal(checks, 1);
  assert.equal(h.controller.installUpdate(), false);

  const filePath = '/Users/test/Downloads/Limit-0.2.0-mac-universal.dmg';
  transfer.resolve(filePath);
  assert.equal(await first, filePath);
  assert.deepEqual(h.controller.getState(), {
    status: 'installer-ready',
    version: '0.2.0',
    filePath,
  });
  assert.equal(await h.controller.downloadUpdate(), filePath);
  assert.equal(calls.length, 1);
  timer.callback();
  assert.equal(await h.controller.checkForUpdates(), false);
  assert.equal(checks, 1);
  assert.equal(h.controller.installUpdate(), false);
  assert.equal(h.installs, 0);
  h.controller.dispose();
});

test('failed manual transfers can retry the same installer without another release check', async () => {
  const calls = [];
  const filePath = '/Users/test/Downloads/Limit-0.2.0-mac-universal.dmg';
  const h = harness({
    manualInstall: true,
    downloadInstaller: async (info, options) => {
      calls.push({ info, options });
      if (calls.length === 1) throw new Error('download interrupted');
      return filePath;
    },
  });
  await h.controller.start();
  await h.controller.checkForUpdates();
  h.updater.emit('update-available', manualUpdateInfo());
  assert.equal(await h.controller.downloadUpdate(), null);
  assert.deepEqual(h.controller.getState(), {
    status: 'error',
    version: '0.2.0',
    errorAction: 'download',
  });
  assert.equal(h.errors.length, 1);
  assert.equal(await h.controller.downloadUpdate(), filePath);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].info, calls[1].info);
  assert.notEqual(calls[0].options.signal, calls[1].options.signal);
  assert.equal(calls[1].options.signal.aborted, false);
  assert.equal(h.checks, 1);
  assert.equal(h.controller.getState().status, 'installer-ready');
  h.controller.dispose();
});

test('disposal aborts a manual transfer and suppresses late progress and errors', async () => {
  const transfer = deferred();
  let options;
  const h = harness({
    manualInstall: true,
    downloadInstaller: (_info, request) => {
      options = request;
      request.signal.addEventListener('abort', () =>
        transfer.reject(new Error('aborted')),
      );
      return transfer.promise;
    },
  });
  await h.controller.start();
  await h.controller.checkForUpdates();
  h.updater.emit('update-available', manualUpdateInfo());
  const attempt = h.controller.downloadUpdate();
  await Promise.resolve();
  const stateCount = h.states.length;
  h.controller.dispose();
  assert.equal(options.signal.aborted, true);
  options.onProgress(90);
  assert.equal(await attempt, null);
  assert.equal(h.states.length, stateCount);
  assert.equal(h.errors.length, 0);
  assert.equal(h.intervals.size, 0);
  assert.equal(h.updater.listenerCount('error'), 0);
  assert.equal(await h.controller.downloadUpdate(), null);
});

test('disposal immediately after clicking download prevents the transfer from starting', async () => {
  let transfers = 0;
  const h = harness({
    manualInstall: true,
    downloadInstaller: async () => {
      transfers += 1;
      return '/Users/test/Downloads/update.dmg';
    },
  });
  await h.controller.start();
  await h.controller.checkForUpdates();
  h.updater.emit('update-available', manualUpdateInfo());
  const attempt = h.controller.downloadUpdate();
  const stateCount = h.states.length;
  h.controller.dispose();
  assert.equal(await attempt, null);
  assert.equal(transfers, 0);
  assert.equal(h.states.length, stateCount);
  assert.equal(h.errors.length, 0);
});

test('manual transfer is unavailable in disabled and development modes', async () => {
  for (const options of [
    { manualInstall: true, enabled: false },
    {
      manualInstall: true,
      app: { isPackaged: false, whenReady: () => Promise.resolve() },
    },
  ]) {
    let transfers = 0;
    const h = harness({
      ...options,
      downloadInstaller: async () => {
        transfers += 1;
        return '/Users/test/Downloads/update.dmg';
      },
    });
    assert.equal(await h.controller.downloadUpdate(), null);
    await h.controller.start();
    await h.controller.checkForUpdates();
    h.updater.emit('update-available', manualUpdateInfo());
    assert.equal(await h.controller.downloadUpdate(), null);
    assert.equal(transfers, 0);
    h.controller.dispose();
  }
});

test('manual transfer requires an available release and a configured downloader', async () => {
  let transfers = 0;
  const h = harness({
    manualInstall: true,
    downloadInstaller: async () => {
      transfers += 1;
      return '/Users/test/Downloads/update.dmg';
    },
  });
  await h.controller.start();
  await h.controller.checkForUpdates();
  assert.equal(await h.controller.downloadUpdate(), null);
  h.updater.emit('update-available', manualUpdateInfo());
  h.updater.emit('update-not-available', { version: '0.1.0' });
  assert.equal(await h.controller.downloadUpdate(), null);
  assert.equal(transfers, 0);
  h.controller.dispose();

  const missingDownloader = harness({ manualInstall: true });
  await missingDownloader.controller.start();
  await missingDownloader.controller.checkForUpdates();
  missingDownloader.updater.emit('update-available', manualUpdateInfo());
  assert.equal(await missingDownloader.controller.downloadUpdate(), null);
  assert.equal(missingDownloader.controller.getState().status, 'available');
  missingDownloader.controller.dispose();
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
    assert.equal(h.controller.getState().errorAction, 'install');
    assert.equal(await h.controller.checkForUpdates(), false);
    h.updater.quitAndInstall = () => {};
    assert.equal(h.controller.installUpdate(), true);
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

test('closing during a native download suppresses late state and observes its errors', async () => {
  const h = harness();
  const download = deferred();
  h.updater.downloadUpdate = () => download.promise;
  await h.controller.start();
  await h.controller.checkForUpdates();
  h.updater.emit('update-available', { version: '0.2.0' });
  const attempt = h.controller.downloadUpdate();
  await Promise.resolve();
  const stateCount = h.states.length;
  assert.equal(h.controller.dispose(), null);
  const error = new Error('closed connection');
  h.updater.emit('error', error);
  h.updater.emit('download-progress', { percent: 75 });
  download.reject(error);
  assert.equal(await attempt, null);
  assert.equal(h.states.length, stateCount);
  assert.equal(h.updater.listenerCount('error'), 0);
  assert.equal(h.installs, 0);
});

test('a delayed install error retains the downloaded payload for an install retry', async () => {
  let canClose = false;
  const h = harness({
    prepareToQuit: () => {
      canClose = true;
      return () => {
        canClose = false;
      };
    },
  });
  let downloads = 0;
  h.updater.downloadUpdate = async () => {
    downloads++;
    return ['/tmp/update.exe'];
  };
  await h.controller.start();
  await h.controller.checkForUpdates();
  h.updater.emit('update-available', { version: '0.2.0' });
  await h.controller.downloadUpdate();
  assert.equal(h.controller.installUpdate(), true);
  assert.equal(canClose, true);
  await Promise.resolve();
  h.updater.emit('error', new Error('installer could not start'));
  assert.equal(canClose, false);
  assert.deepEqual(publicAppUpdateState(h.controller.getState(), '0.1.0'), {
    status: 'error',
    errorAction: 'install',
    version: '0.2.0',
    currentVersion: '0.1.0',
  });
  assert.equal(await h.controller.checkForUpdates(), false);
  assert.equal(await h.controller.downloadUpdate(), true);
  assert.equal(downloads, 1);
  assert.equal(h.controller.installUpdate(), true);
  assert.equal(h.installs, 2);
  assert.equal(canClose, true);
  h.controller.dispose();
});

test('late release check events and failures never overwrite a clicked download', async () => {
  for (const manualInstall of [true, false]) {
    for (const fails of [false, true]) {
      const check = deferred();
      const transfer = deferred();
      const h = harness({
        manualInstall,
        downloadInstaller: () => transfer.promise,
      });
      h.updater.checkForUpdates = () => {
        h.updater.emit('update-available', manualUpdateInfo());
        return check.promise;
      };
      h.updater.downloadUpdate = () => transfer.promise;
      await h.controller.start();
      const checking = h.controller.checkForUpdates();
      const downloading = h.controller.downloadUpdate();
      await Promise.resolve();
      const stateCount = h.states.length;
      h.updater.emit('checking-for-update');
      h.updater.emit('update-not-available');
      h.updater.emit('update-available', { version: '0.3.0' });
      if (fails) {
        const error = new Error('late release response failed');
        h.updater.emit('error', error);
        check.reject(error);
      } else {
        check.resolve({ isUpdateAvailable: true });
      }
      assert.equal(await checking, !fails);
      assert.equal(h.states.length, stateCount);
      assert.deepEqual(h.controller.getState(), {
        status: 'downloading',
        version: '0.2.0',
        percent: 0,
      });
      transfer.resolve(manualInstall ? '/tmp/update.dmg' : ['/tmp/update.exe']);
      await downloading;
      assert.equal(h.controller.getState().version, '0.2.0');
      assert.equal(
        h.controller.getState().status,
        manualInstall ? 'installer-ready' : 'downloaded',
      );
      h.controller.dispose();
    }
  }
});
