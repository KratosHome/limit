const childProcess = require('node:child_process');
const path = require('node:path');
const developmentConfig = require('./electron-builder.mac-development.cjs');
const {
  findSignedDevelopmentProcesses,
} = require('./signed-macos-dev-processes.cjs');

if (process.platform !== 'darwin') process.exit(0);

const projectRoot = path.resolve(__dirname, '..');
const running = findSignedDevelopmentProcesses(
  projectRoot,
  childProcess.spawnSync,
);

if (running.length > 0) {
  const processSummary = running
    .map(({ pid, command }) => `${pid}: ${command}`)
    .join('\n');
  throw new Error(
    `Завершіть ${developmentConfig.productName} через tray перед повторною збіркою:\n${processSummary}`,
  );
}
