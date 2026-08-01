const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { promisify } = require('node:util');
const { pathToFileURL } = require('node:url');

const execFile = promisify(childProcess.execFile);

function packageDirectory() {
  return path.dirname(require.resolve('get-windows'));
}

function unpackedPath(filePath) {
  const asarSegment = `${path.sep}app.asar${path.sep}`;
  return filePath.includes(asarSegment)
    ? filePath.replace(asarSegment, `${path.sep}app.asar.unpacked${path.sep}`)
    : filePath;
}

function findWindowsBinding(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = findWindowsBinding(target);
      if (nested) return nested;
    } else if (entry.name === 'node-get-windows.node') {
      return target;
    }
  }
  return null;
}

async function loadActiveWindowProvider(platform = process.platform) {
  const root = packageDirectory();

  if (platform === 'darwin') {
    const binary = unpackedPath(path.join(root, 'main'));
    return async () => {
      const { stdout } = await execFile(binary, [
        '--no-accessibility-permission',
        '--no-screen-recording-permission',
      ]);
      return JSON.parse(stdout);
    };
  }

  if (platform === 'linux') {
    if (process.env.WAYLAND_DISPLAY) {
      throw new Error('Wayland does not expose a global foreground-window API');
    }
    const moduleUrl = pathToFileURL(path.join(root, 'lib', 'linux.js')).href;
    const module = await import(moduleUrl);
    return async () => {
      const result = await module.activeWindow();
      if (!result) throw new Error('X11 foreground tracking is unavailable; xprop/xwininfo may be missing');
      return result;
    };
  }

  if (platform === 'win32') {
    const bindingRoot = unpackedPath(path.join(root, 'lib', 'binding'));
    const bindingPath = findWindowsBinding(bindingRoot);
    if (!bindingPath) throw new Error('Native foreground-window binding is missing');
    const addon = require(bindingPath);
    return async () => addon.getActiveWindow();
  }

  throw new Error('Foreground tracking is unavailable on this platform');
}

module.exports = {
  loadActiveWindowProvider,
  unpackedPath,
};
