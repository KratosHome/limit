const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');

const execFile = promisify(childProcess.execFile);
const MAX_PATH_LENGTH = 4096;

function platformPath(platform) {
  return platform === 'win32' ? path.win32 : path.posix;
}

function fileIconSize(platform) {
  return platform === 'darwin' ? 'normal' : 'large';
}

function appBundlePath(filePath) {
  const match = /\.app(?:[\\/]|$)/i.exec(filePath);
  return match ? filePath.slice(0, match.index + 4) : filePath;
}

function existingIconPath(value, platform, existsSync = fs.existsSync) {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > MAX_PATH_LENGTH ||
    value.includes('\0')
  )
    return null;
  const pathApi = platformPath(platform);
  if (!pathApi.isAbsolute(value)) return null;
  if (platform === 'win32' && /^[\\/]{2}/.test(value)) return null;
  const iconPath = platform === 'darwin' ? appBundlePath(value) : value;
  return existsSync(iconPath) ? iconPath : null;
}

function safeApplicationName(value) {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  if (
    !name ||
    name.length > 160 ||
    name === '.' ||
    name === '..' ||
    /[\\/\0]/.test(name)
  )
    return null;
  const basename = name.toLowerCase().endsWith('.app')
    ? name.slice(0, -4)
    : name;
  return basename && basename !== '.' && basename !== '..' ? basename : null;
}

function macApplicationRoots(userHome = os.homedir()) {
  return [
    '/Applications',
    path.join(userHome, 'Applications'),
    '/System/Applications',
    '/System/Applications/Utilities',
    '/System/Library/CoreServices',
    '/System/Volumes/Preboot/Cryptexes/App/System/Applications',
    '/System/Volumes/Preboot/Cryptexes/App/System/Applications/Utilities',
  ];
}

function applicationPathFromName(
  appName,
  { existsSync = fs.existsSync, roots = macApplicationRoots() } = {},
) {
  const name = safeApplicationName(appName);
  if (!name) return null;
  const pathApi = platformPath('darwin');
  for (const root of roots) {
    const candidate = pathApi.join(root, `${name}.app`);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function validBundleId(value) {
  return (
    typeof value === 'string' &&
    value.length <= 512 &&
    value.includes('.') &&
    /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value)
  );
}

async function applicationPathFromBundleId(
  appId,
  { execute = execFile, existsSync = fs.existsSync } = {},
) {
  if (!validBundleId(appId)) return null;
  try {
    const { stdout } = await execute(
      '/usr/bin/mdfind',
      [`kMDItemCFBundleIdentifier == "${appId}"`],
      { maxBuffer: 1024 * 1024, timeout: 3000 },
    );
    const matches = String(stdout || '')
      .split(/\r?\n/)
      .map((candidate) => existingIconPath(candidate, 'darwin', existsSync))
      .filter(Boolean)
      .sort((left, right) => left.length - right.length);
    return matches[0] || null;
  } catch {
    return null;
  }
}

async function bundleIdFromApplicationPath(
  applicationPath,
  { execute = execFile } = {},
) {
  if (typeof applicationPath !== 'string' || !applicationPath.endsWith('.app'))
    return null;
  try {
    const { stdout } = await execute(
      '/usr/libexec/PlistBuddy',
      [
        '-c',
        'Print :CFBundleIdentifier',
        platformPath('darwin').join(applicationPath, 'Contents', 'Info.plist'),
      ],
      { maxBuffer: 64 * 1024, timeout: 3000 },
    );
    const bundleId = String(stdout || '').trim();
    return validBundleId(bundleId) ? bundleId : null;
  } catch {
    return null;
  }
}

async function resolveApplicationIconPath(
  {
    appId,
    appName,
    allowAppIdPath = false,
    executablePath,
    platform = process.platform,
    userHome = os.homedir(),
  },
  dependencies = {},
) {
  const existsSync = dependencies.existsSync || fs.existsSync;
  const recordedPath = existingIconPath(executablePath, platform, existsSync);
  if (recordedPath) return recordedPath;

  // On Windows and Linux the historical app id is commonly the executable path.
  // Only trust it when the id came from tracked usage, never from a user-created limit.
  if (allowAppIdPath) {
    const idPath = existingIconPath(appId, platform, existsSync);
    if (idPath) return idPath;
  }
  if (platform !== 'darwin') return null;

  const execute = dependencies.execute || execFile;
  const bundlePath = await applicationPathFromBundleId(appId, {
    execute,
    existsSync,
  });
  if (bundlePath) return bundlePath;

  const namedPath = applicationPathFromName(appName, {
    existsSync,
    roots: dependencies.roots || macApplicationRoots(userHome),
  });
  if (!namedPath) return null;

  // Spotlight can be disabled. Keep the name fallback, but reject an explicit
  // bundle-id mismatch so an equally named app cannot supply the wrong icon.
  const candidateBundleId = await bundleIdFromApplicationPath(namedPath, {
    execute,
  });
  if (
    candidateBundleId &&
    validBundleId(appId) &&
    candidateBundleId.toLowerCase() !== appId.toLowerCase()
  )
    return null;
  return namedPath;
}

module.exports = {
  appBundlePath,
  applicationPathFromBundleId,
  applicationPathFromName,
  bundleIdFromApplicationPath,
  existingIconPath,
  fileIconSize,
  macApplicationRoots,
  resolveApplicationIconPath,
  safeApplicationName,
  validBundleId,
};
