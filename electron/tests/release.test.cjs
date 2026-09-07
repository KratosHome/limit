const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const yaml = require('js-yaml');
const { Platform } = require('electron-builder');
const { WinPackager } = require('app-builder-lib/out/winPackager');
const {
  getAppUpdatePublishConfiguration,
} = require('app-builder-lib/out/publish/PublishManager');
const releaseConfig = require('../../scripts/electron-builder.release.cjs');
const {
  compareReleaseVersions,
  deriveReleaseVersion,
  writeReleaseVersion,
} = require('../../scripts/release-version.cjs');
const {
  publishRelease,
  requiredReleaseFiles,
  validateReleaseArtifacts,
} = require('../../scripts/release-publish.cjs');

function temporaryDirectory(t) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'limit-release-test-'),
  );
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function writeReleaseFixture(t, version = '0.1.42') {
  const directory = temporaryDirectory(t);
  const files = requiredReleaseFiles(version);
  const entries = {};
  for (const filename of Object.values(files)) {
    const content = Buffer.from(`Test artifact: ${filename}`);
    fs.writeFileSync(path.join(directory, filename), content);
    entries[filename] = {
      url: filename,
      sha512: crypto.createHash('sha512').update(content).digest('base64'),
      size: content.length,
    };
  }
  for (const [name, filenames] of [
    ['latest.yml', [files.windows]],
    ['latest-mac.yml', [files.macZip, files.macDmg]],
  ]) {
    fs.writeFileSync(
      path.join(directory, name),
      yaml.dump({
        version,
        files: filenames.map((filename) => entries[filename]),
        path: filenames[0],
        sha512: entries[filenames[0]].sha512,
      }),
    );
  }
  return { directory, files, version };
}

function fakeGitHub(
  directory,
  { releases = [], uploadedNames, existingCommit } = {},
) {
  const calls = [];
  return {
    calls,
    execute(arguments_) {
      calls.push(arguments_);
      if (arguments_[1] === 'list') return JSON.stringify(releases);
      if (arguments_.includes('isDraft,targetCommitish'))
        return JSON.stringify({
          isDraft: true,
          targetCommitish: existingCommit,
        });
      if (arguments_.includes('assets')) {
        const names = uploadedNames ?? fs.readdirSync(directory);
        return JSON.stringify({
          assets: names.map((name) => ({
            name,
            size: fs.statSync(path.join(directory, name)).size,
          })),
        });
      }
      return '';
    },
  };
}

const releaseCommit = 'a'.repeat(40);

test('release versions advance without changing the source base or re-run version', () => {
  assert.equal(deriveReleaseVersion('0.1.0', '42'), '0.1.42');
  assert.equal(deriveReleaseVersion('1.2.3', '42'), '1.2.45');
  assert.equal(compareReleaseVersions('0.1.100', '0.1.99'), 1);
  assert.equal(compareReleaseVersions('1.0.0', '0.99.65535'), 1);
  for (const value of ['0', '-1', '1.2', 'NaN', '65536'])
    assert.throws(() => deriveReleaseVersion('0.1.0', value));
  assert.throws(() => deriveReleaseVersion('0.1.0-beta.1', '1'));
});

test('CI version writes preserve npm dependency metadata and update both manifests', (t) => {
  const directory = temporaryDirectory(t);
  const dependency = { 'example-package': '^1.0.0' };
  fs.writeFileSync(
    path.join(directory, 'package.json'),
    JSON.stringify({ version: '0.1.0', dependencies: dependency }),
  );
  fs.writeFileSync(
    path.join(directory, 'package-lock.json'),
    JSON.stringify({
      version: '0.1.0',
      packages: {
        '': { version: '0.1.0', dependencies: dependency },
        'node_modules/example-package': { version: '1.0.2' },
      },
    }),
  );
  writeReleaseVersion(directory, '0.1.42');
  const metadata = JSON.parse(
    fs.readFileSync(path.join(directory, 'package.json')),
  );
  const lock = JSON.parse(
    fs.readFileSync(path.join(directory, 'package-lock.json')),
  );
  assert.equal(metadata.version, '0.1.42');
  assert.equal(lock.version, '0.1.42');
  assert.equal(lock.packages[''].version, '0.1.42');
  assert.deepEqual(metadata.dependencies, dependency);
  assert.equal(lock.packages['node_modules/example-package'].version, '1.0.2');
});

test('certificate-free Windows packaging keeps executable resource editing', async (t) => {
  const directory = temporaryDirectory(t);
  fs.writeFileSync(path.join(directory, 'Limit.exe'), 'test executable');
  const edited = [];
  const packager = {
    appInfo: { productFilename: 'Limit' },
    platformSpecificBuildOptions: releaseConfig.win,
    forceCodeSigning: releaseConfig.forceCodeSigning,
    signAndEditResources: async (filename) => edited.push(filename),
    shouldSignFile: () => true,
    get signingQueue() {
      throw new Error('Certificate signing must stay disabled');
    },
  };
  await WinPackager.prototype.signApp.call(
    packager,
    { appOutDir: directory },
    true,
  );
  assert.deepEqual(edited, [path.join(directory, 'Limit.exe')]);
  assert.equal(
    await WinPackager.prototype.signIf.call(packager, 'Limit.exe'),
    false,
  );
});

test('unsigned Windows updater metadata does not inherit a local certificate publisher', async () => {
  const packager = {
    config: releaseConfig,
    platform: Platform.WINDOWS,
    platformSpecificBuildOptions: releaseConfig.win,
    appInfo: { updaterCacheDirName: 'limit-updater' },
    info: { config: releaseConfig, appInfo: { channel: null } },
    expandMacro: (value) => value,
    get signingManager() {
      throw new Error(
        'Local signing identity must not affect updater metadata',
      );
    },
  };
  packager.isForceCodeSigningVerification = Object.getOwnPropertyDescriptor(
    WinPackager.prototype,
    'isForceCodeSigningVerification',
  ).get.call(packager);
  const config = await getAppUpdatePublishConfiguration(
    packager,
    null,
    null,
    true,
  );
  assert.equal(config.provider, 'github');
  assert.equal(config.owner, 'KratosHome');
  assert.equal(config.repo, 'limit');
  assert.equal(config.publisherName, undefined);
});

test('release validation requires matching Windows, universal Mac and updater metadata', async (t) => {
  const { directory, version, files } = writeReleaseFixture(t);
  const assets = await validateReleaseArtifacts(directory, version);
  assert.equal(assets.length, 5);
  fs.unlinkSync(path.join(directory, files.macZip));
  await assert.rejects(validateReleaseArtifacts(directory, version));
});

test('release validation rejects corrupt downloads and metadata from another version', async (t) => {
  const corrupt = writeReleaseFixture(t);
  fs.appendFileSync(
    path.join(corrupt.directory, corrupt.files.windows),
    'corrupt',
  );
  await assert.rejects(
    validateReleaseArtifacts(corrupt.directory, corrupt.version),
    /checksum or size/,
  );
  const stale = writeReleaseFixture(t);
  const metadataPath = path.join(stale.directory, 'latest-mac.yml');
  const metadata = yaml.load(fs.readFileSync(metadataPath, 'utf8'));
  metadata.version = '0.1.41';
  fs.writeFileSync(metadataPath, yaml.dump(metadata));
  await assert.rejects(
    validateReleaseArtifacts(stale.directory, stale.version),
    /Incorrect release version/,
  );
});

test('publishing keeps a release draft until both platforms and all assets are verified', async (t) => {
  const fixture = writeReleaseFixture(t);
  const github = fakeGitHub(fixture.directory);
  const url = await publishRelease({
    ...fixture,
    repository: 'KratosHome/limit',
    commit: releaseCommit,
    execute: github.execute,
  });
  assert.equal(url, 'https://github.com/KratosHome/limit/releases/tag/v0.1.42');
  assert.deepEqual(
    github.calls.map((call) => call[1]),
    ['list', 'create', 'upload', 'view', 'edit'],
  );
  assert.ok(github.calls[1].includes('--draft'));
  assert.ok(github.calls.at(-1).includes('--draft=false'));
});

test('publishing refuses non-increasing versions before creating or replacing a release', async (t) => {
  const fixture = writeReleaseFixture(t);
  for (const tagName of ['v0.1.42', 'v0.1.100', 'v1.0.0']) {
    const github = fakeGitHub(fixture.directory, {
      releases: [{ tagName, isDraft: false, isPrerelease: false }],
    });
    await assert.rejects(
      publishRelease({
        ...fixture,
        repository: 'KratosHome/limit',
        commit: releaseCommit,
        execute: github.execute,
      }),
      /must be newer/,
    );
    assert.equal(github.calls.length, 1);
  }
});

test('failed uploads never publish a partial release', async (t) => {
  const fixture = writeReleaseFixture(t);
  const github = fakeGitHub(fixture.directory, {
    uploadedNames: ['latest.yml'],
  });
  await assert.rejects(
    publishRelease({
      ...fixture,
      repository: 'KratosHome/limit',
      commit: releaseCommit,
      execute: github.execute,
    }),
    /remains a draft/,
  );
  assert.equal(
    github.calls.some((call) => call[1] === 'edit'),
    false,
  );
});

test('a failed draft may resume only for the same version and commit', async (t) => {
  const fixture = writeReleaseFixture(t);
  const releases = [
    { tagName: `v${fixture.version}`, isDraft: true, isPrerelease: false },
  ];
  const wrongCommit = fakeGitHub(fixture.directory, {
    releases,
    existingCommit: 'b'.repeat(40),
  });
  await assert.rejects(
    publishRelease({
      ...fixture,
      repository: 'KratosHome/limit',
      commit: releaseCommit,
      execute: wrongCommit.execute,
    }),
    /cannot be replaced/,
  );
  const github = fakeGitHub(fixture.directory, {
    releases,
    existingCommit: releaseCommit,
  });
  await publishRelease({
    ...fixture,
    repository: 'KratosHome/limit',
    commit: releaseCommit,
    execute: github.execute,
  });
  assert.equal(
    github.calls.some((call) => call[1] === 'create'),
    false,
  );
  assert.equal(github.calls.at(-1)[1], 'edit');
});
