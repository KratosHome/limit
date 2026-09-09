const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { Platform } = require('electron-builder');
const {
  getAppUpdatePublishConfiguration,
} = require('app-builder-lib/out/publish/PublishManager');
const { scripts } = require('../../package.json');
const { collectInstallers } = require('../../scripts/collect-installers.cjs');

function installerFixture(t) {
  const projectRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'limit-local-installers-test-'),
  );
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  for (const folder of ['local', 'publish']) {
    const directory = path.join(projectRoot, 'release', folder);
    fs.mkdirSync(directory, { recursive: true });
    for (const platform of ['win-x64.exe', 'mac-universal.dmg']) {
      const prefix = folder === 'local' ? 'Limit-Local' : 'Limit';
      fs.writeFileSync(
        path.join(directory, `${prefix}-0.1.0-${platform}`),
        folder === 'local' ? 'new unpublished code' : 'old released code',
      );
    }
  }
  return { projectRoot, packageVersion: '0.1.0' };
}

test('installer build commands produce local apps without a production update feed', async () => {
  for (const platform of ['win', 'mac']) {
    const command = scripts[`installers:${platform}`];
    const configurationPath = command.match(/--config (\S+)/)?.[1];
    assert.ok(
      configurationPath,
      'The installer build must select its configuration',
    );
    const config = require(path.resolve(__dirname, '../..', configurationPath));
    assert.equal(config.extraMetadata.limitAutoUpdate, false);
    assert.equal(config.directories.output, 'release/local');
    assert.match(config.artifactName, /^Limit-Local-/);
    assert.match(command, /--publish never/);
    assert.match(command, /collect-installers\.cjs --local/);
    const packager = {
      config,
      platform: platform === 'win' ? Platform.WINDOWS : Platform.MAC,
      platformSpecificBuildOptions: config[platform],
      info: {
        config,
        repositoryInfo: Promise.resolve({
          type: 'github',
          user: 'KratosHome',
          project: 'limit',
        }),
      },
    };
    assert.equal(
      await getAppUpdatePublishConfiguration(packager, null, null, true),
      null,
      'A known GitHub repository must not re-enable the production feed',
    );
  }
});

test('local collection uses fresh local artifacts without replacing release installers', (t) => {
  const fixture = installerFixture(t);
  const released = collectInstallers(fixture);
  const local = collectInstallers({ ...fixture, arguments_: ['--local'] });
  assert.equal(local.length, 2);
  for (const filename of local) {
    assert.match(path.basename(filename), /^Limit-Local-/);
    assert.equal(fs.readFileSync(filename, 'utf8'), 'new unpublished code');
  }
  for (const filename of released)
    assert.equal(fs.readFileSync(filename, 'utf8'), 'old released code');
});

test('local collection respects the selected platform and never falls back to an older release', (t) => {
  const fixture = installerFixture(t);
  fs.unlinkSync(
    path.join(
      fixture.projectRoot,
      'release/local/Limit-Local-0.1.0-win-x64.exe',
    ),
  );
  const mac = collectInstallers({
    ...fixture,
    arguments_: ['--local', '--mac'],
  });
  assert.equal(mac.length, 1);
  assert.match(mac[0], /mac-universal\.dmg$/);
  assert.throws(() =>
    collectInstallers({ ...fixture, arguments_: ['--local', '--win'] }),
  );
});
