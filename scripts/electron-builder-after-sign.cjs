const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function run(command, arguments_) {
  const result = childProcess.spawnSync(command, arguments_, {
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} завершився з кодом ${result.status}`);
}

module.exports = async function afterSign(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );
  if (
    !fs.existsSync(appPath) ||
    !fs.lstatSync(appPath).isDirectory() ||
    fs.lstatSync(appPath).isSymbolicLink()
  ) {
    throw new Error('Очікував звичайний каталог підписаного Limit.app');
  }
  const realOutputDirectory = fs.realpathSync(context.appOutDir);
  const realAppPath = fs.realpathSync(appPath);
  if (!realAppPath.startsWith(`${realOutputDirectory}${path.sep}`))
    throw new Error('Неприпустимий шлях до підписаного Limit.app');

  run('codesign', [
    '--verify',
    '--deep',
    '--strict',
    '--verbose=2',
    realAppPath,
  ]);
  run('xcrun', ['stapler', 'validate', realAppPath]);
  run('spctl', ['--assess', '--type', 'execute', '--verbose=2', realAppPath]);
};
