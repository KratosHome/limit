const childProcess = require('node:child_process');
const path = require('node:path');

if (process.platform !== 'darwin') process.exit(0);

const projectRoot = path.resolve(__dirname, '..');
const executablePaths = ['mac-arm64', 'mac-x64', 'mac-universal', 'mac'].map(
  (directory) =>
    path.join(
      projectRoot,
      'release',
      directory,
      'Limit.app',
      'Contents',
      'MacOS',
      'Limit',
    ),
);
const processList = childProcess.spawnSync('ps', ['-axo', 'pid=,command='], {
  encoding: 'utf8',
});
if (processList.error) throw processList.error;
if (processList.status !== 0)
  throw new Error('Не вдалося перевірити запущені процеси Limit');

const running = processList.stdout
  .split('\n')
  .map((line) => line.match(/^\s*(\d+)\s+(.+)$/))
  .filter(Boolean)
  .map((match) => ({ pid: match[1], command: match[2] }))
  .filter(({ command }) =>
    executablePaths.some(
      (executablePath) =>
        command === executablePath || command.startsWith(`${executablePath} `),
    ),
  );

if (running.length > 0) {
  const processSummary = running
    .map(({ pid, command }) => `${pid}: ${command}`)
    .join('\n');
  throw new Error(
    `Завершіть підписаний Limit через tray перед повторною збіркою:\n${processSummary}`,
  );
}
