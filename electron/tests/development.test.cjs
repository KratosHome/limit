const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const developmentConfig = require('../../scripts/electron-builder.mac-development.cjs');

function temporaryProject(t) {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'limit-development-test-'),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function writeApp(root, output, productName) {
  const appPath = path.join(root, output, 'mac-arm64', `${productName}.app`);
  const executable = path.join(appPath, 'Contents', 'MacOS', productName);
  fs.mkdirSync(path.dirname(executable), { recursive: true });
  fs.writeFileSync(executable, '');
  return { appPath, executable };
}

function runScript(
  filename,
  root,
  { processList = '', signatureStatus = 0 } = {},
) {
  const scriptPath = path.resolve(__dirname, '../../scripts', filename);
  const scriptRequire = createRequire(scriptPath);
  const calls = [];
  const childProcess = {
    spawnSync(command, args) {
      calls.push({ command, args });
      return {
        status: command === 'codesign' ? signatureStatus : 0,
        stdout: command === 'ps' ? processList : '',
      };
    },
    spawn(command, args, options) {
      calls.push({ command, args, options });
      return new EventEmitter();
    },
  };
  const context = {
    require: (name) =>
      name === 'node:child_process' ? childProcess : scriptRequire(name),
    __dirname: path.join(root, 'scripts'),
    process: {
      platform: 'darwin',
      arch: 'arm64',
      argv: ['node', scriptPath],
      env: {},
      once() {},
    },
    console: { log() {}, error() {} },
  };
  vm.runInNewContext(fs.readFileSync(scriptPath, 'utf8'), context);
  return calls;
}

test('signed development has its own bundle identity without changing installable builds', () => {
  assert.equal(developmentConfig.appId, 'ua.limit.desktop.development');
  assert.equal(developmentConfig.productName, 'Limit Development');
  assert.equal(developmentConfig.mac.identity, '-');
  assert.equal(developmentConfig.extraMetadata.limitSignedDevelopment, true);
  assert.equal(developmentConfig.extraMetadata.limitAutoUpdate, false);
  assert.equal(developmentConfig.extraMetadata.limitMacNativeUpdate, false);
  for (const filename of ['base', 'installers', 'release', 'mac-signed']) {
    const config = require(`../../scripts/electron-builder.${filename}.cjs`);
    assert.equal(config.appId, 'ua.limit.desktop');
    assert.equal(config.productName, 'Limit');
    assert.notEqual(
      config.directories.output,
      developmentConfig.directories.output,
    );
    assert.notEqual(config.extraMetadata.limitSignedDevelopment, true);
  }
  assert.match(
    require('../../package.json').scripts['package:mac:local'],
    /--config scripts\/electron-builder\.mac-development\.cjs/,
  );
});

test('the dev launcher verifies and starts only its isolated bundle', (t) => {
  const root = temporaryProject(t);
  writeApp(root, 'release', 'Limit');
  const development = writeApp(
    root,
    developmentConfig.directories.output,
    developmentConfig.productName,
  );
  const calls = runScript('start-signed-macos-dev.cjs', root);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].command, 'codesign');
  assert.equal(calls[0].args.at(-1), fs.realpathSync(development.appPath));
  assert.equal(calls[1].command, fs.realpathSync(development.executable));
  assert.equal(calls[1].options.env.LIMIT_SIGNED_DEVELOPMENT, '1');
  assert.throws(
    () => runScript('start-signed-macos-dev.cjs', root, { signatureStatus: 1 }),
    /не має чинного локального підпису/,
  );
});

test('the dev launcher never falls back to an old production-identity bundle', (t) => {
  const root = temporaryProject(t);
  writeApp(root, 'release', 'Limit');
  assert.throws(
    () => runScript('start-signed-macos-dev.cjs', root),
    /Не знайдено packaged Limit Development\.app/,
  );
});

test('the rebuild guard blocks the development process and permits production to keep running', (t) => {
  const root = temporaryProject(t);
  const production = writeApp(root, 'release', 'Limit');
  const development = writeApp(
    root,
    developmentConfig.directories.output,
    developmentConfig.productName,
  );
  const processList = `100 ${production.executable}\n`;
  assert.doesNotThrow(() =>
    runScript('assert-signed-macos-dev-not-running.cjs', root, { processList }),
  );
  assert.throws(
    () =>
      runScript('assert-signed-macos-dev-not-running.cjs', root, {
        processList: `${processList}200 ${development.executable}\n`,
      }),
    /Завершіть Limit Development/,
  );
});

function mainHarness(
  t,
  {
    metadata = {},
    env = {},
    platform = 'darwin',
    isPackaged = true,
    startupError = null,
  } = {},
) {
  const root = temporaryProject(t);
  const resourcesPath = path.join(root, 'Contents', 'Resources');
  const helperPath = path.join(
    resourcesPath,
    'native',
    'LimitNotificationPermission.node',
  );
  fs.mkdirSync(path.dirname(helperPath), { recursive: true });
  fs.writeFileSync(helperPath, '');
  const paths = new Map();
  const settings = {
    bundleIdentifier: 'ua.limit.desktop',
    authorizationStatus: 'authorized',
    alertSetting: 'enabled',
    notificationCenterSetting: 'enabled',
    soundSetting: 'enabled',
  };
  const processEvents = new EventEmitter();
  const appEvents = new EventEmitter();
  const dialogs = [];
  let quitCount = 0;
  const electron = {
    app: {
      isPackaged,
      getPath: () => root,
      setPath: (name, value) => paths.set(name, value),
      requestSingleInstanceLock: () => true,
      setAppUserModelId() {},
      getPreferredSystemLanguages: () => ['uk-UA'],
      whenReady: () =>
        startupError ? Promise.reject(startupError) : new Promise(() => {}),
      on: appEvents.on.bind(appEvents),
      quit: () => {
        quitCount += 1;
        appEvents.emit('before-quit', { preventDefault() {} });
      },
    },
    dialog: {
      showErrorBox: (title, detail) => dialogs.push({ title, detail }),
    },
  };
  const source = fs.readFileSync(path.join(__dirname, '../main.cjs'), 'utf8');
  const api = vm.runInNewContext(
    `${source}\n;({ getMacOSNotificationSettings, setShutdownResources(value) {
      tasks = value.tasks;
      tracker = value.tracker;
      store = value.store;
    } })`,
    {
      require(name) {
        if (name === 'electron') return electron;
        if (name === '../package.json') return metadata;
        if (name === './i18n.cjs') return require('../i18n.cjs');
        if (name === fs.realpathSync(helperPath))
          return { getNotificationSettings: async () => settings };
        return name.startsWith('node:') ? require(name) : {};
      },
      process: {
        platform,
        env,
        resourcesPath,
        on: processEvents.on.bind(processEvents),
      },
      __dirname: path.resolve(__dirname, '..'),
    },
  );
  return {
    paths,
    root,
    settings,
    api,
    processEvents,
    dialogs,
    quitCount: () => quitCount,
  };
}

test('startup failures show the reason and quit instead of leaving a hidden process', async (t) => {
  const h = mainHarness(t, {
    startupError: new Error('База створена новішою версією Limit (schema 99)'),
  });
  await new Promise(setImmediate);
  assert.equal(h.dialogs.length, 1);
  assert.equal(h.dialogs[0].title, 'Не вдалося запустити Limit');
  assert.match(h.dialogs[0].detail, /schema 99/);
  assert.equal(h.quitCount(), 1);
});

test('dev termination flushes task and activity timers before closing storage', (t) => {
  for (const signal of ['SIGINT', 'SIGTERM']) {
    const h = mainHarness(t, { metadata: developmentConfig.extraMetadata });
    const cleanup = [];
    h.api.setShutdownResources({
      tasks: { dispose: () => cleanup.push('task checkpoint') },
      tracker: { stop: () => cleanup.push('activity checkpoint') },
      store: { close: () => cleanup.push('close database') },
    });
    assert.equal(h.processEvents.emit(signal), true);
    assert.deepEqual(cleanup, [
      'task checkpoint',
      'activity checkpoint',
      'close database',
    ]);
  }
  const production = mainHarness(t);
  assert.equal(production.processEvents.listenerCount('SIGINT'), 0);
  assert.equal(production.processEvents.listenerCount('SIGTERM'), 0);
});

test('opening the packaged development app directly preserves separate data storage', (t) => {
  for (const [options, directory] of [
    [{ metadata: developmentConfig.extraMetadata }, 'Limit Development'],
    [{ env: { LIMIT_SIGNED_DEVELOPMENT: '1' } }, 'Limit Development'],
    [{}, 'Limit'],
    [{ metadata: { limitSignedDevelopment: 'true' } }, 'Limit'],
    [
      { metadata: developmentConfig.extraMetadata, isPackaged: false },
      'Limit UI Development',
    ],
    [{ metadata: developmentConfig.extraMetadata, platform: 'win32' }, 'Limit'],
  ]) {
    const h = mainHarness(t, options);
    assert.equal(h.paths.get('userData'), path.join(h.root, directory));
  }
});

test('notification settings accept only the current production or development identity', async (t) => {
  for (const development of [false, true]) {
    const expectedId = development
      ? developmentConfig.appId
      : 'ua.limit.desktop';
    const h = mainHarness(t, {
      metadata: development ? developmentConfig.extraMetadata : {},
    });
    h.settings.bundleIdentifier = expectedId;
    assert.equal(
      (await h.api.getMacOSNotificationSettings()).bundleIdentifier,
      expectedId,
    );
    h.settings.bundleIdentifier = development
      ? 'ua.limit.desktop'
      : developmentConfig.appId;
    await assert.rejects(
      h.api.getMacOSNotificationSettings(),
      /unexpected helper response/,
    );
  }
});
