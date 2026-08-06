const assert = require('node:assert/strict');
const test = require('node:test');
const {
  appBundlePath,
  applicationPathFromBundleId,
  existingIconPath,
  fileIconSize,
  resolveApplicationIconPath,
  safeApplicationName,
} = require('./app-icon.cjs');

test('appBundlePath returns the outer macOS application bundle', () => {
  assert.equal(
    appBundlePath(
      '/Applications/Steam.app/Contents/MacOS/Steam Helper.app/Contents/MacOS/helper',
    ),
    '/Applications/Steam.app',
  );
  assert.equal(appBundlePath('/Applications/Arc.app'), '/Applications/Arc.app');
});

test('fileIconSize avoids the unsupported large size on macOS', () => {
  assert.equal(fileIconSize('darwin'), 'normal');
  assert.equal(fileIconSize('linux'), 'large');
  assert.equal(fileIconSize('win32'), 'large');
});

test('resolveApplicationIconPath prefers a recorded path', async () => {
  const result = await resolveApplicationIconPath(
    {
      appId: 'com.example.App',
      appName: 'Example',
      executablePath: '/Custom/Example.app/Contents/MacOS/Example',
      platform: 'darwin',
    },
    {
      existsSync: (candidate) => candidate === '/Custom/Example.app',
    },
  );
  assert.equal(result, '/Custom/Example.app');
});

test('resolveApplicationIconPath finds a historical macOS app by name', async () => {
  const result = await resolveApplicationIconPath(
    {
      appId: 'com.google.Chrome',
      appName: 'Google Chrome',
      executablePath: null,
      platform: 'darwin',
    },
    {
      roots: ['/Applications'],
      existsSync: (candidate) =>
        candidate === '/Applications/Google Chrome.app',
      execute: async (executable) => ({
        stdout:
          executable === '/usr/libexec/PlistBuddy' ? 'com.google.Chrome\n' : '',
      }),
    },
  );
  assert.equal(result, '/Applications/Google Chrome.app');
});

test('applicationPathFromBundleId falls back to Spotlight metadata', async () => {
  const execute = async (executable, arguments_) => {
    assert.equal(executable, '/usr/bin/mdfind');
    assert.deepEqual(arguments_, [
      'kMDItemCFBundleIdentifier == "com.example.renamed"',
    ]);
    return { stdout: '/Applications/A Renamed App.app\n' };
  };
  const result = await applicationPathFromBundleId('com.example.renamed', {
    execute,
    existsSync: (candidate) => candidate === '/Applications/A Renamed App.app',
  });
  assert.equal(result, '/Applications/A Renamed App.app');
});

test('resolveApplicationIconPath uses an absolute historical id on Linux', async () => {
  const result = await resolveApplicationIconPath(
    {
      appId: '/usr/bin/example',
      appName: 'Example',
      executablePath: null,
      platform: 'linux',
      allowAppIdPath: true,
    },
    {
      existsSync: (candidate) => candidate === '/usr/bin/example',
    },
  );
  assert.equal(result, '/usr/bin/example');
});

test('resolveApplicationIconPath rejects a same-name app with another bundle id', async () => {
  const result = await resolveApplicationIconPath(
    {
      appId: 'com.example.Expected',
      appName: 'Example',
      executablePath: null,
      platform: 'darwin',
    },
    {
      roots: ['/Applications'],
      existsSync: (candidate) => candidate === '/Applications/Example.app',
      execute: async (executable) => ({
        stdout:
          executable === '/usr/libexec/PlistBuddy'
            ? 'com.example.Impostor\n'
            : '',
      }),
    },
  );
  assert.equal(result, null);
});

test('existingIconPath rejects Windows network and device paths', () => {
  const existsSync = () => true;
  assert.equal(
    existingIconPath('\\\\server\\share\\app.exe', 'win32', existsSync),
    null,
  );
  assert.equal(
    existingIconPath('\\\\?\\C:\\app.exe', 'win32', existsSync),
    null,
  );
  assert.equal(
    existingIconPath(
      'C:\\Program Files\\Example\\app.exe',
      'win32',
      existsSync,
    ),
    'C:\\Program Files\\Example\\app.exe',
  );
});

test('unsafe names and invalid bundle ids are ignored', async () => {
  assert.equal(safeApplicationName('../Example'), null);
  let executed = false;
  const result = await applicationPathFromBundleId('not a bundle id', {
    execute: async () => {
      executed = true;
      return { stdout: '' };
    },
  });
  assert.equal(result, null);
  assert.equal(executed, false);
});
