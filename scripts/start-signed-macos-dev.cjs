const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

if (process.platform !== 'darwin') {
  throw new Error('Підписаний dev-запуск доступний лише на macOS');
}

const allowedArguments = new Set(['--notification-test']);
for (const argument of process.argv.slice(2)) {
  if (!allowedArguments.has(argument))
    throw new Error(`Невідомий аргумент: ${argument}`);
}

const projectRoot = path.resolve(__dirname, '..');
const releaseRoot = path.join(projectRoot, 'release');
const candidates =
  process.arch === 'arm64'
    ? [
        path.join(releaseRoot, 'mac-arm64', 'Limit.app'),
        path.join(releaseRoot, 'mac-universal', 'Limit.app'),
      ]
    : [
        path.join(releaseRoot, 'mac', 'Limit.app'),
        path.join(releaseRoot, 'mac-x64', 'Limit.app'),
        path.join(releaseRoot, 'mac-universal', 'Limit.app'),
      ];
const appPath = candidates.find((candidate) => fs.existsSync(candidate));

if (!appPath)
  throw new Error(
    'Не знайдено packaged Limit.app. Спочатку виконайте npm run package:mac:local.',
  );
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

const executablePath = path.join(realAppPath, 'Contents', 'MacOS', 'Limit');
if (
  !fs.existsSync(executablePath) ||
  !fs.lstatSync(executablePath).isFile() ||
  fs.lstatSync(executablePath).isSymbolicLink()
) {
  throw new Error('Не знайдено виконуваний файл packaged Limit.app');
}

const verification = childProcess.spawnSync(
  'codesign',
  ['--verify', '--deep', '--strict', realAppPath],
  { stdio: 'inherit' },
);
if (verification.error) throw verification.error;
if (verification.status !== 0)
  throw new Error('Limit.app не має чинного локального підпису');

const childEnvironment = { ...process.env };
delete childEnvironment.ELECTRON_RENDERER_URL;
childEnvironment.LIMIT_SIGNED_DEVELOPMENT = '1';
const isNotificationTest = process.argv.includes('--notification-test');
const notificationTestId = String(process.pid);
if (isNotificationTest) {
  childEnvironment.LIMIT_SYSTEM_NOTIFICATION_TEST = '1';
  childEnvironment.LIMIT_SYSTEM_NOTIFICATION_TEST_ID = notificationTestId;
} else {
  delete childEnvironment.LIMIT_SYSTEM_NOTIFICATION_TEST;
  delete childEnvironment.LIMIT_SYSTEM_NOTIFICATION_TEST_ID;
}

console.log(`Запускаю підписаний Limit.app: ${realAppPath}`);
const child = childProcess.spawn(executablePath, [], {
  cwd: projectRoot,
  env: childEnvironment,
  stdio: 'inherit',
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    if (!child.killed) child.kill(signal);
  });
}

child.once('error', (error) => {
  console.error('Не вдалося запустити підписаний Limit.app:', error);
  process.exitCode = 1;
});

child.once('exit', (code, signal) => {
  if (isNotificationTest) {
    const testDirectory = path.join(
      os.tmpdir(),
      `Limit Notification Test ${notificationTestId}`,
    );
    try {
      if (fs.existsSync(testDirectory)) {
        const metadata = fs.lstatSync(testDirectory);
        const realTempDirectory = fs.realpathSync(os.tmpdir());
        const realTestDirectory = fs.realpathSync(testDirectory);
        if (
          metadata.isDirectory() &&
          !metadata.isSymbolicLink() &&
          path.dirname(realTestDirectory) === realTempDirectory &&
          path.basename(realTestDirectory) ===
            `Limit Notification Test ${notificationTestId}`
        ) {
          fs.rmSync(realTestDirectory, { recursive: true });
        } else {
          console.warn('Пропускаю очищення неприпустимого test-каталогу');
        }
      }
    } catch (error) {
      console.warn('Не вдалося очистити notification test-каталог:', error);
    }
  }
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
