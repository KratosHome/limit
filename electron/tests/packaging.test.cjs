const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { FuseV1Options } = require('@electron/fuses');
const { Arch } = require('electron-builder');
const buildConfig = require('../../scripts/electron-builder.base.cjs');
const {
  electronFuseConfig,
  packagedElectronPath,
  validateWindowsBinding,
} = require('../../scripts/electron-builder-after-pack.cjs');

function writeWindowsBinding(outputDirectory, machine = 0x8664) {
  const bindingPath = path.join(
    outputDirectory,
    'resources',
    'get-windows',
    'lib',
    'binding',
    'napi-9-win32-unknown-x64',
    'node-get-windows.node',
  );
  fs.mkdirSync(path.dirname(bindingPath), { recursive: true });
  const executable = Buffer.alloc(128);
  executable.write('MZ');
  executable.writeUInt32LE(64, 0x3c);
  executable.write('PE\0\0', 64, 'binary');
  executable.writeUInt16LE(machine, 68);
  fs.writeFileSync(bindingPath, executable);
}

test('Windows packaging requires the unpacked PE x64 tracker binding', (t) => {
  const outputDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'limit-package-test-'),
  );
  t.after(() => fs.rmSync(outputDirectory, { recursive: true, force: true }));
  const context = { appOutDir: outputDirectory, arch: Arch.x64 };

  assert.throws(() => validateWindowsBinding(context), /Не знайдено/);
  writeWindowsBinding(outputDirectory, 0xaa64);
  assert.throws(() => validateWindowsBinding(context), /PE x64/);
  writeWindowsBinding(outputDirectory);
  assert.doesNotThrow(() => validateWindowsBinding(context));
});

test('packaging explicitly configures every Electron fuse', () => {
  assert.equal(electronFuseConfig.strictlyRequireAllFuses, true);
  for (const option of Object.values(FuseV1Options).filter(Number.isInteger)) {
    assert.equal(Object.hasOwn(electronFuseConfig, option), true);
  }
});

test('packaging keeps file protocol access for the ASAR renderer', () => {
  assert.equal(
    electronFuseConfig[FuseV1Options.GrantFileProtocolExtraPrivileges],
    true,
  );
});

test('packaging keeps only supported Electron runtime languages', () => {
  assert.deepEqual(buildConfig.electronLanguages, ['en-US', 'uk']);
});

test('packaging resolves platform executables from stable builder metadata', () => {
  const baseContext = {
    appOutDir: path.join(path.sep, 'package'),
    packager: {
      appInfo: { productFilename: 'Limit', sanitizedName: 'Limit App' },
    },
  };

  assert.equal(
    packagedElectronPath({
      ...baseContext,
      electronPlatformName: 'win32',
    }),
    path.join(path.sep, 'package', 'Limit.exe'),
  );
  assert.equal(
    packagedElectronPath({
      ...baseContext,
      electronPlatformName: 'darwin',
    }),
    path.join(path.sep, 'package', 'Limit.app'),
  );
  assert.equal(
    packagedElectronPath({
      ...baseContext,
      electronPlatformName: 'linux',
    }),
    path.join(path.sep, 'package', 'limit app'),
  );
});
