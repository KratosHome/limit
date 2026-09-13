const path = require('node:path');
const developmentConfig = require('./electron-builder.mac-development.cjs');

function findSignedDevelopmentProcesses(projectRoot, spawnSync) {
  const executablePaths = ['mac-arm64', 'mac-x64', 'mac-universal', 'mac'].map(
    (directory) =>
      path.join(
        projectRoot,
        developmentConfig.directories.output,
        directory,
        `${developmentConfig.productName}.app`,
        'Contents',
        'MacOS',
        developmentConfig.productName,
      ),
  );
  // `comm` excludes arguments, so a similarly named executable cannot be
  // mistaken for this bundle's main executable followed by an argument.
  const processList = spawnSync('ps', ['-axo', 'pid=,comm='], {
    encoding: 'utf8',
    timeout: 2000,
    maxBuffer: 1024 * 1024,
  });
  if (processList.error) throw processList.error;
  if (processList.status !== 0 || typeof processList.stdout !== 'string')
    throw new Error('Не вдалося перевірити запущені процеси Limit');

  return processList.stdout
    .split('\n')
    .map((line) => line.match(/^\s*(\d+)\s+(.+)$/))
    .filter(Boolean)
    .map((match) => ({ pid: Number(match[1]), command: match[2] }))
    .filter(
      ({ pid, command }) =>
        Number.isSafeInteger(pid) &&
        pid > 0 &&
        executablePaths.includes(command),
    );
}

module.exports = { findSignedDevelopmentProcesses };
