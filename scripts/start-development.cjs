const childProcess = require('node:child_process');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const scriptName = process.platform === 'darwin' ? 'dev:mac:signed' : 'dev:ui';
const npmCliPath = process.env.npm_execpath;
const usesWindowsNpmCli =
  process.platform === 'win32' &&
  typeof npmCliPath === 'string' &&
  path.isAbsolute(npmCliPath);
const executable = usesWindowsNpmCli
  ? process.execPath
  : process.platform === 'win32'
    ? process.env.ComSpec || 'cmd.exe'
    : 'npm';
const arguments_ = usesWindowsNpmCli
  ? [npmCliPath, 'run', scriptName]
  : process.platform === 'win32'
    ? ['/d', '/s', '/c', `npm run ${scriptName}`]
    : ['run', scriptName];

const child = childProcess.spawn(executable, arguments_, {
  cwd: projectRoot,
  env: process.env,
  stdio: 'inherit',
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    if (!child.killed) child.kill(signal);
  });
}

child.once('error', (error) => {
  console.error(`Не вдалося запустити ${scriptName}:`, error);
  process.exitCode = 1;
});

child.once('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
