const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { promisify } = require('node:util');
const { pathToFileURL } = require('node:url');

const execFile = promisify(childProcess.execFile);

function websiteTrackingErrorKind(error) {
  const details = [error?.message, error?.stderr, error?.stdout]
    .filter((value) => typeof value === 'string')
    .join('\n');
  if (/accessibility|ax is not trusted/i.test(details))
    return 'accessibility-permission';
  if (/automation|not authorized|-1743/i.test(details))
    return 'automation-permission';
  return 'url-provider-error';
}

function packageDirectory() {
  return path.dirname(require.resolve('get-windows'));
}

function unpackedPath(filePath) {
  return filePath.replace(/([\\/])app\.asar([\\/])/, '$1app.asar.unpacked$2');
}

function windowsBindingPriority(directoryName, platform, arch, napiVersion) {
  const match = /^napi-(\d+)-([^-]+)-[^-]+-(.+)$/.exec(directoryName);
  if (!match) return null;
  const bindingNapiVersion = Number(match[1]);
  const bindingPlatform = match[2];
  const bindingArch = match[3];
  if (
    bindingPlatform !== platform ||
    bindingArch !== arch ||
    !Number.isInteger(bindingNapiVersion) ||
    bindingNapiVersion > napiVersion
  ) {
    return null;
  }
  return bindingNapiVersion;
}

function findWindowsBinding(
  directory,
  {
    platform = process.platform,
    arch = process.arch,
    napiVersion = Number(process.versions.napi || 0),
  } = {},
) {
  const candidates = fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const priority = windowsBindingPriority(
        entry.name,
        platform,
        arch,
        napiVersion,
      );
      if (priority === null) return null;
      const bindingPath = path.join(
        directory,
        entry.name,
        'node-get-windows.node',
      );
      return fs.existsSync(bindingPath) ? { bindingPath, priority } : null;
    })
    .filter(Boolean)
    .sort((left, right) => right.priority - left.priority);

  return candidates[0]?.bindingPath || null;
}

async function loadActiveWindowProvider(
  platform = process.platform,
  { execute = execFile } = {},
) {
  const root = packageDirectory();

  if (platform === 'darwin') {
    const binary = unpackedPath(path.join(root, 'main'));
    const appOnlyArguments = [
      '--no-accessibility-permission',
      '--no-screen-recording-permission',
    ];
    return async ({ websiteTrackingEnabled = false } = {}) => {
      const arguments_ = websiteTrackingEnabled
        ? ['--no-screen-recording-permission']
        : appOnlyArguments;

      try {
        const { stdout } = await execute(binary, arguments_);
        return JSON.parse(stdout);
      } catch (error) {
        if (!websiteTrackingEnabled) throw error;

        // URL lookup needs macOS Accessibility/Automation access. If it is
        // unavailable, retain foreground-app tracking without requesting URLs.
        const { stdout } = await execute(binary, appOnlyArguments);
        return {
          ...JSON.parse(stdout),
          websiteTrackingError: websiteTrackingErrorKind(error),
        };
      }
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
      if (!result)
        throw new Error(
          'X11 foreground tracking is unavailable; xprop/xwininfo may be missing',
        );
      return result;
    };
  }

  if (platform === 'win32') {
    const bindingRoot = unpackedPath(path.join(root, 'lib', 'binding'));
    const bindingPath = findWindowsBinding(bindingRoot);
    if (!bindingPath)
      throw new Error('Native foreground-window binding is missing');
    const addon = require(bindingPath);
    return async () => addon.getActiveWindow();
  }

  throw new Error('Foreground tracking is unavailable on this platform');
}

module.exports = {
  findWindowsBinding,
  loadActiveWindowProvider,
  unpackedPath,
  websiteTrackingErrorKind,
  windowsBindingPriority,
};
