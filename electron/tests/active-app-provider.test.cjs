const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  findWindowsBinding,
  loadActiveWindowProvider,
  websiteTrackingErrorKind,
  windowsBindingPriority,
} = require('../active-app-provider.cjs');
const { ActivityTracker } = require('../tracker.cjs');

function createBindingTree() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), `limit-binding-test-${process.pid}-`),
  );
  for (const directory of [
    'napi-9-darwin-unknown-arm64',
    'napi-8-win32-unknown-x64',
    'napi-9-win32-unknown-x64',
    'napi-10-win32-unknown-arm64',
  ]) {
    const target = path.join(root, directory);
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, 'node-get-windows.node'), '');
  }
  return root;
}

test('findWindowsBinding selects the compatible Windows addon', () => {
  const root = createBindingTree();

  assert.equal(
    findWindowsBinding(root, {
      platform: 'win32',
      arch: 'x64',
      napiVersion: 9,
    }),
    path.join(root, 'napi-9-win32-unknown-x64', 'node-get-windows.node'),
  );
});

test('findWindowsBinding falls back to the newest compatible napi version', () => {
  const root = createBindingTree();

  assert.equal(
    findWindowsBinding(root, {
      platform: 'win32',
      arch: 'x64',
      napiVersion: 8,
    }),
    path.join(root, 'napi-8-win32-unknown-x64', 'node-get-windows.node'),
  );
});

test('findWindowsBinding returns null when no compatible addon exists', () => {
  const root = createBindingTree();

  assert.equal(
    findWindowsBinding(root, {
      platform: 'win32',
      arch: 'arm64',
      napiVersion: 9,
    }),
    null,
  );
});

test('windowsBindingPriority rejects other platforms and newer napi versions', () => {
  assert.equal(
    windowsBindingPriority('napi-9-darwin-unknown-arm64', 'win32', 'x64', 9),
    null,
  );
  assert.equal(
    windowsBindingPriority('napi-10-win32-unknown-x64', 'win32', 'x64', 9),
    null,
  );
  assert.equal(
    windowsBindingPriority('napi-9-win32-unknown-x64', 'win32', 'x64', 9),
    9,
  );
});

test('websiteTrackingErrorKind categorizes macOS permission errors', () => {
  assert.equal(
    websiteTrackingErrorKind({ message: 'AX is not trusted' }),
    'accessibility-permission',
  );
  assert.equal(
    websiteTrackingErrorKind({ stderr: 'Not authorized to send Apple events' }),
    'automation-permission',
  );
});

test(
  'a stalled macOS URL helper falls back to app tracking and later polls recover',
  { timeout: 10000 },
  async (t) => {
    let helper;
    t.after(() => helper?.kill('SIGKILL'));
    let websiteReads = 0;
    let appReads = 0;
    let now = 1000;
    const samples = [];
    const browserWindow = {
      owner: { name: 'Safari', bundleId: 'com.apple.Safari', processId: 300 },
    };
    t.mock.method(performance, 'now', () => now);
    const provider = await loadActiveWindowProvider('darwin', {
      execute(_binary, args, options) {
        if (args.includes('--no-accessibility-permission')) {
          assert.equal(options.timeout, 4000);
          appReads += 1;
          return Promise.resolve({ stdout: JSON.stringify(browserWindow) });
        }
        assert.equal(options.timeout, 30000);
        websiteReads += 1;
        if (websiteReads === 1) {
          // Exercise execFile's real cancellation instead of simulating an error:
          // without a bounded read this never returns and every later tick skips.
          return new Promise((resolve, reject) => {
            helper = execFile(
              process.execPath,
              ['-e', 'setInterval(() => {}, 1000)'],
              // The configured consent budget is checked above; shorten only
              // this real child-process deadline to keep the regression fast.
              { ...options, timeout: 50 },
              (error, stdout) => {
                if (error) reject(error);
                else resolve({ stdout });
              },
            );
          });
        }
        return Promise.resolve({
          stdout: JSON.stringify({
            ...browserWindow,
            url: 'https://example.com/page',
          }),
        });
      },
    });
    const tracker = new ActivityTracker({
      store: {
        getSettings: () => ({
          trackingEnabled: true,
          websiteTrackingEnabled: true,
        }),
        recordSample: (sample) => samples.push(sample),
      },
      activeWindowProvider: provider,
      ownProcessId: 100,
    });

    await tracker.tick();
    assert.equal(helper.killed, true);
    assert.equal(appReads, 1);
    assert.equal(tracker.getStatus().currentApp.id, 'com.apple.Safari');
    assert.equal(tracker.getStatus().currentApp.site, null);
    assert.equal(tracker.getStatus().lastWebsiteError, 'url-provider-error');
    assert.equal(tracker.ticking, false);

    now = 6000;
    await tracker.tick();
    assert.equal(websiteReads, 2);
    assert.equal(tracker.getStatus().websitePermissionState, 'granted');
    assert.equal(tracker.getStatus().lastWebsiteError, null);
    assert.deepEqual(tracker.getStatus().currentApp.site, {
      domain: 'example.com',
    });
    now = 11000;
    await tracker.tick();
    assert.deepEqual(
      samples.map(({ site }) => site),
      [null, { domain: 'example.com' }],
    );
  },
);

test('macOS permission failures keep app tracking available and retry URL access', async () => {
  let allowed = false;
  const windowInfo = {
    owner: { name: 'Safari', bundleId: 'com.apple.Safari', processId: 300 },
  };
  const provider = await loadActiveWindowProvider('darwin', {
    async execute(_binary, args) {
      if (args.includes('--no-accessibility-permission'))
        return { stdout: JSON.stringify(windowInfo) };
      if (!allowed)
        throw Object.assign(new Error('Browser read failed'), {
          stderr: 'Not authorized to send Apple events. (-1743)',
        });
      return {
        stdout: JSON.stringify({ ...windowInfo, url: 'https://example.com' }),
      };
    },
  });
  assert.deepEqual(await provider({ websiteTrackingEnabled: true }), {
    ...windowInfo,
    websiteTrackingError: 'automation-permission',
  });
  allowed = true;
  assert.deepEqual(await provider({ websiteTrackingEnabled: true }), {
    ...windowInfo,
    url: 'https://example.com',
  });
});
