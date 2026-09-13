const childProcess = require('node:child_process');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const {
  findSignedDevelopmentProcesses,
} = require('./signed-macos-dev-processes.cjs');

async function stopSignedDevelopment({
  platform = process.platform,
  projectRoot = path.resolve(__dirname, '..'),
  findProcesses = () =>
    findSignedDevelopmentProcesses(projectRoot, childProcess.spawnSync),
  signalProcess = (pid, signal) => process.kill(pid, signal),
  sleep = delay,
  now = () => performance.now(),
  timeoutMs = 10_000,
  pollIntervalMs = 100,
  log = console.log,
} = {}) {
  if (platform !== 'darwin') return;
  const running = findProcesses();
  if (!running.length) return;
  const deadline = now() + timeoutMs;
  log('Завершую попередній Limit Development перед оновленням dev-збірки…');
  for (const { pid, command } of running) {
    // Recheck ownership immediately before signalling in case a PID was reused.
    if (
      !findProcesses().some(
        (item) => item.pid === pid && item.command === command,
      )
    )
      continue;
    try {
      signalProcess(pid, 'SIGTERM');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }

  for (;;) {
    const remainingProcesses = findProcesses();
    if (!remainingProcesses.length) return;
    const remainingMs = deadline - now();
    if (remainingMs <= 0)
      throw new Error(
        `Limit Development не завершився за ${timeoutMs / 1000} с. Збірку зупинено. Завершіть його через tray і повторіть npm run dev. PID: ${remainingProcesses.map(({ pid }) => pid).join(', ')}`,
      );
    // Never force-kill or signal a process that appeared while waiting.
    await sleep(Math.min(pollIntervalMs, remainingMs));
  }
}

if (require.main === module) {
  stopSignedDevelopment().catch((error) => {
    console.error('Не вдалося підготувати dev-запуск:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { stopSignedDevelopment };
