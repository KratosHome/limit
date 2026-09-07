const childProcess = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const {
  compareReleaseVersions,
  parseReleaseVersion,
} = require('./release-version.cjs');

function requiredReleaseFiles(version) {
  parseReleaseVersion(version);
  return {
    windows: `Limit-${version}-win-x64.exe`,
    macDmg: `Limit-${version}-mac-universal.dmg`,
    macZip: `Limit-${version}-mac-universal.zip`,
  };
}

async function fileIntegrity(directory, name) {
  const filename = path.join(directory, name);
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0)
    throw new Error(
      `Release artifact must be a nonempty regular file: ${name}`,
    );
  const hash = crypto.createHash('sha512');
  for await (const chunk of fs.createReadStream(filename)) hash.update(chunk);
  return { size: stat.size, sha512: hash.digest('base64') };
}

async function validateReleaseArtifacts(directory, version) {
  const files = requiredReleaseFiles(version);
  const integrity = new Map();
  for (const name of Object.values(files))
    integrity.set(name, await fileIntegrity(directory, name));
  for (const [metadataName, expectedNames, primaryName] of [
    ['latest.yml', [files.windows], files.windows],
    ['latest-mac.yml', [files.macZip, files.macDmg], files.macZip],
  ]) {
    await fileIntegrity(directory, metadataName);
    const metadata = yaml.load(
      fs.readFileSync(path.join(directory, metadataName), 'utf8'),
    );
    if (metadata?.version !== version || !Array.isArray(metadata.files))
      throw new Error(`Incorrect release version or files in ${metadataName}`);
    if (metadata.files.length !== expectedNames.length)
      throw new Error(`Unexpected artifact list in ${metadataName}`);
    const found = new Set();
    for (const entry of metadata.files) {
      if (!expectedNames.includes(entry?.url) || found.has(entry.url))
        throw new Error(
          `Unexpected or duplicate artifact URL in ${metadataName}`,
        );
      const actual = integrity.get(entry.url);
      if (entry.sha512 !== actual.sha512 || entry.size !== actual.size)
        throw new Error(`Artifact checksum or size mismatch: ${entry.url}`);
      found.add(entry.url);
    }
    if (
      metadata.path !== primaryName ||
      metadata.sha512 !== integrity.get(primaryName).sha512
    )
      throw new Error(`Incorrect primary update artifact in ${metadataName}`);
  }
  const assets = [...Object.values(files), 'latest.yml', 'latest-mac.yml'];
  for (const name of Object.values(files)) {
    const blockmap = `${name}.blockmap`;
    if (fs.existsSync(path.join(directory, blockmap))) {
      await fileIntegrity(directory, blockmap);
      assets.push(blockmap);
    }
  }
  return assets.map((name) => path.join(directory, name));
}

function executeGitHub(arguments_) {
  return childProcess.execFileSync('gh', arguments_, {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
}

async function publishRelease({
  directory,
  version,
  repository,
  commit,
  execute = executeGitHub,
}) {
  if (repository !== 'KratosHome/limit')
    throw new Error('Unexpected release repository');
  if (!/^[a-f0-9]{40}$/.test(commit || ''))
    throw new Error('A full release commit SHA is required');
  const assets = await validateReleaseArtifacts(directory, version);
  const tag = `v${version}`;
  const releases = JSON.parse(
    execute([
      'release',
      'list',
      '--repo',
      repository,
      '--limit',
      '100',
      '--json',
      'tagName,isDraft,isPrerelease',
    ]),
  );
  for (const release of releases) {
    if (
      release.isDraft ||
      release.isPrerelease ||
      !/^v\d+\.\d+\.\d+$/.test(release.tagName)
    )
      continue;
    if (compareReleaseVersions(version, release.tagName.slice(1)) <= 0)
      throw new Error(
        `Version ${version} must be newer than published ${release.tagName}`,
      );
  }
  const existing = releases.find((release) => release.tagName === tag);
  if (existing) {
    const draft = JSON.parse(
      execute([
        'release',
        'view',
        tag,
        '--repo',
        repository,
        '--json',
        'isDraft,targetCommitish',
      ]),
    );
    if (!draft.isDraft || draft.targetCommitish !== commit)
      throw new Error('An existing release cannot be replaced by this build');
  } else {
    execute([
      'release',
      'create',
      tag,
      '--repo',
      repository,
      '--target',
      commit,
      '--draft',
      '--title',
      `Limit ${version}`,
      '--generate-notes',
    ]);
  }
  execute([
    'release',
    'upload',
    tag,
    ...assets,
    '--repo',
    repository,
    '--clobber',
  ]);
  const uploaded = JSON.parse(
    execute(['release', 'view', tag, '--repo', repository, '--json', 'assets']),
  ).assets;
  if (
    uploaded.length !== assets.length ||
    assets.some(
      (filename) =>
        !uploaded.some(
          (asset) =>
            asset.name === path.basename(filename) &&
            asset.size === fs.statSync(filename).size,
        ),
    )
  )
    throw new Error(
      'Uploaded release assets are incomplete; the release remains a draft',
    );
  execute([
    'release',
    'edit',
    tag,
    '--repo',
    repository,
    '--draft=false',
    '--latest',
  ]);
  return `https://github.com/${repository}/releases/tag/${tag}`;
}

if (require.main === module) {
  publishRelease({
    directory: path.resolve(process.env.RELEASE_DIRECTORY || 'release/publish'),
    version: process.env.RELEASE_VERSION,
    repository: process.env.GITHUB_REPOSITORY,
    commit: process.env.GITHUB_SHA,
  })
    .then((url) => console.log(url))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

module.exports = {
  publishRelease,
  requiredReleaseFiles,
  validateReleaseArtifacts,
};
