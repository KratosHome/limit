const fs = require('node:fs');
const path = require('node:path');

function parseReleaseVersion(value) {
  if (
    typeof value !== 'string' ||
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)
  )
    throw new Error(
      'Release versions must be stable major.minor.patch numbers',
    );
  const parts = value.split('.').map(Number);
  if (parts.some((part) => !Number.isSafeInteger(part) || part > 65535))
    throw new Error(
      'Release version components must fit Windows file versions (0–65535)',
    );
  return parts;
}

function deriveReleaseVersion(baseVersion, runNumber) {
  const [major, minor, patch] = parseReleaseVersion(baseVersion);
  if (!/^[1-9]\d*$/.test(String(runNumber)))
    throw new Error('GITHUB_RUN_NUMBER must be a positive integer');
  const version = `${major}.${minor}.${patch + Number(runNumber)}`;
  parseReleaseVersion(version);
  return version;
}

function compareReleaseVersions(left, right) {
  const first = parseReleaseVersion(left);
  const second = parseReleaseVersion(right);
  for (let index = 0; index < first.length; index += 1) {
    if (first[index] !== second[index])
      return Math.sign(first[index] - second[index]);
  }
  return 0;
}

function writeReleaseVersion(projectRoot, version) {
  parseReleaseVersion(version);
  const packagePath = path.join(projectRoot, 'package.json');
  const lockPath = path.join(projectRoot, 'package-lock.json');
  const metadata = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  if (!lock.packages?.[''])
    throw new Error('The npm lockfile is missing root package metadata');
  metadata.version = version;
  lock.version = version;
  lock.packages[''].version = version;
  fs.writeFileSync(packagePath, `${JSON.stringify(metadata, null, 2)}\n`);
  fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
}

if (require.main === module) {
  const projectRoot = path.resolve(__dirname, '..');
  const metadata = JSON.parse(
    fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'),
  );
  const version = deriveReleaseVersion(
    metadata.version,
    process.env.GITHUB_RUN_NUMBER,
  );
  if (process.argv.includes('--write'))
    writeReleaseVersion(projectRoot, version);
  if (process.env.GITHUB_OUTPUT)
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
  console.log(version);
}

module.exports = {
  compareReleaseVersions,
  deriveReleaseVersion,
  parseReleaseVersion,
  writeReleaseVersion,
};
