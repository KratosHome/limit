const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

if (process.platform !== 'darwin') {
  throw new Error('Локальний ad-hoc підпис доступний лише на macOS');
}

const projectRoot = path.resolve(__dirname, '..');
const releaseRoot = path.join(projectRoot, 'release');
const entitlementsPath = path.join(
  projectRoot,
  'build',
  'entitlements.mac.plist',
);
const candidates =
  process.arch === 'arm64'
    ? [path.join(releaseRoot, 'mac-arm64', 'Limit.app')]
    : [
        path.join(releaseRoot, 'mac', 'Limit.app'),
        path.join(releaseRoot, 'mac-x64', 'Limit.app'),
      ];
const appPath = candidates.find((candidate) => fs.existsSync(candidate));

if (!appPath)
  throw new Error(
    'Не знайдено packaged Limit.app. Спочатку виконайте npm run package.',
  );
if (!fs.existsSync(entitlementsPath))
  throw new Error('Не знайдено build/entitlements.mac.plist');
if (
  !fs.lstatSync(appPath).isDirectory() ||
  fs.lstatSync(appPath).isSymbolicLink()
) {
  throw new Error('Очікував звичайний каталог Limit.app у release');
}

const realReleaseRoot = fs.realpathSync(releaseRoot);
const realAppPath = fs.realpathSync(appPath);
if (
  !realAppPath.startsWith(`${realReleaseRoot}${path.sep}`) ||
  path.basename(realAppPath) !== 'Limit.app'
) {
  throw new Error('Неприпустимий шлях до Limit.app');
}

function run(command, arguments_) {
  const result = childProcess.spawnSync(command, arguments_, {
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} завершився з кодом ${result.status}`);
}

run('codesign', [
  '--force',
  '--deep',
  '--sign',
  '-',
  '--entitlements',
  entitlementsPath,
  realAppPath,
]);
run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', realAppPath]);

console.log(`Локальний підпис готовий: ${realAppPath}`);
console.log(
  'Цей ad-hoc підпис призначений лише для локальної розробки; для розповсюдження потрібен чинний Developer ID.',
);
