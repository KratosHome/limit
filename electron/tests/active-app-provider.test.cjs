const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  findWindowsBinding,
  websiteTrackingErrorKind,
  windowsBindingPriority,
} = require('../active-app-provider.cjs');

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
