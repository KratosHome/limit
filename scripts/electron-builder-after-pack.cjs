const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { flipFuses, FuseV1Options, FuseVersion } = require('@electron/fuses');
const { Arch } = require('electron-builder');

const electronFuseConfig = {
  version: FuseVersion.V1,
  strictlyRequireAllFuses: true,
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableCookieEncryption]: true,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
  [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: false,
  [FuseV1Options.GrantFileProtocolExtraPrivileges]: true,
  [FuseV1Options.WasmTrapHandlers]: true,
};

function resourceRelativePath(context, ...parts) {
  return context.electronPlatformName === 'darwin'
    ? [
        `${context.packager.appInfo.productFilename}.app`,
        'Contents',
        'Resources',
        ...parts,
      ]
    : ['resources', ...parts];
}

function copyGetWindowsFile(
  context,
  sourceRelativePath,
  destinationRelativePath,
  { executable = false } = {},
) {
  const projectRoot = path.resolve(__dirname, '..');
  const sourceRoot = fs.realpathSync(
    path.join(projectRoot, 'node_modules', 'get-windows'),
  );
  const sourcePath = path.join(sourceRoot, ...sourceRelativePath);
  if (
    !fs.existsSync(sourcePath) ||
    !fs.lstatSync(sourcePath).isFile() ||
    fs.lstatSync(sourcePath).isSymbolicLink()
  ) {
    throw new Error(`Не знайдено get-windows/${sourceRelativePath.join('/')}`);
  }
  const realSourcePath = fs.realpathSync(sourcePath);
  if (!realSourcePath.startsWith(`${sourceRoot}${path.sep}`))
    throw new Error('Неприпустимий шлях до get-windows source');

  const realOutputDirectory = fs.realpathSync(context.appOutDir);
  const relativeOutputPath = resourceRelativePath(
    context,
    'get-windows',
    ...destinationRelativePath,
  );
  const destinationPath = path.join(realOutputDirectory, ...relativeOutputPath);
  const destinationDirectory = path.dirname(destinationPath);
  fs.mkdirSync(destinationDirectory, { recursive: true });
  if (
    !fs
      .realpathSync(destinationDirectory)
      .startsWith(`${realOutputDirectory}${path.sep}`) ||
    (fs.existsSync(destinationPath) &&
      fs.lstatSync(destinationPath).isSymbolicLink())
  ) {
    throw new Error('Неприпустимий шлях до packaged get-windows file');
  }
  fs.copyFileSync(realSourcePath, destinationPath);
  fs.chmodSync(destinationPath, executable ? 0o755 : 0o644);
}

function copyGetWindowsRuntime(context) {
  copyGetWindowsFile(context, ['license'], ['license']);
  copyGetWindowsFile(context, ['package.json'], ['package.json']);
  if (context.electronPlatformName === 'darwin') {
    copyGetWindowsFile(context, ['main'], ['main'], { executable: true });
  } else if (context.electronPlatformName === 'win32') {
    const bindingPath = [
      'lib',
      'binding',
      'napi-9-win32-unknown-x64',
      'node-get-windows.node',
    ];
    copyGetWindowsFile(context, bindingPath, bindingPath);
  } else if (context.electronPlatformName === 'linux') {
    copyGetWindowsFile(context, ['lib', 'linux.js'], ['lib', 'linux.js']);
  }
}

function validateWindowsBinding(context) {
  if (context.arch !== Arch.x64)
    throw new Error('Windows package підтримує лише x64');
  const realBindingPath = validatePackagedFile(
    context,
    resourceRelativePath(
      context,
      'get-windows',
      'lib',
      'binding',
      'napi-9-win32-unknown-x64',
      'node-get-windows.node',
    ),
    'Windows x64 get-windows binding',
  );

  const executable = fs.readFileSync(realBindingPath);
  const peOffset = executable.length >= 64 ? executable.readUInt32LE(0x3c) : -1;
  const hasValidHeader =
    executable.subarray(0, 2).equals(Buffer.from('MZ')) &&
    peOffset >= 0 &&
    peOffset + 6 <= executable.length &&
    executable.subarray(peOffset, peOffset + 4).equals(Buffer.from('PE\0\0'));
  const machine = hasValidHeader ? executable.readUInt16LE(peOffset + 4) : 0;
  if (!hasValidHeader || machine !== 0x8664)
    throw new Error('Windows get-windows binding не є PE x64 binary');
}

function validatePackagedFile(context, relativePath, description) {
  const filePath = path.join(context.appOutDir, ...relativePath);
  if (
    !fs.existsSync(filePath) ||
    !fs.lstatSync(filePath).isFile() ||
    fs.lstatSync(filePath).isSymbolicLink()
  ) {
    throw new Error(`Не знайдено ${description} у package`);
  }
  const realOutputDirectory = fs.realpathSync(context.appOutDir);
  const realFilePath = fs.realpathSync(filePath);
  if (!realFilePath.startsWith(`${realOutputDirectory}${path.sep}`))
    throw new Error(`Неприпустимий шлях до ${description}`);
  return realFilePath;
}

function packagedElectronPath(context) {
  const productFilename = context.packager.appInfo.productFilename;
  if (context.electronPlatformName === 'darwin')
    return path.join(context.appOutDir, `${productFilename}.app`);
  if (context.electronPlatformName === 'win32')
    return path.join(context.appOutDir, `${productFilename}.exe`);

  const linuxExecutableName =
    context.packager.executableName ||
    context.packager.config?.linux?.executableName ||
    context.packager.config?.executableName ||
    context.packager.appInfo.sanitizedName.toLowerCase();
  return path.join(context.appOutDir, linuxExecutableName);
}

async function applyElectronFuses(context) {
  const electronPath = packagedElectronPath(context);
  if (
    !fs.existsSync(electronPath) ||
    fs.lstatSync(electronPath).isSymbolicLink() ||
    (context.electronPlatformName === 'darwin'
      ? !fs.lstatSync(electronPath).isDirectory()
      : !fs.lstatSync(electronPath).isFile())
  ) {
    throw new Error('Не знайдено packaged Electron executable для fuses');
  }
  await flipFuses(electronPath, electronFuseConfig);
}

module.exports = async function afterPack(context) {
  if (
    context.electronPlatformName === 'darwin' ||
    context.electronPlatformName === 'win32' ||
    context.electronPlatformName === 'linux'
  ) {
    copyGetWindowsRuntime(context);
  }
  if (context.electronPlatformName === 'win32') {
    validateWindowsBinding(context);
    await applyElectronFuses(context);
    return;
  }
  if (context.electronPlatformName === 'linux') {
    validatePackagedFile(
      context,
      resourceRelativePath(context, 'get-windows', 'lib', 'linux.js'),
      'Linux get-windows provider',
    );
    await applyElectronFuses(context);
    return;
  }
  if (context.electronPlatformName !== 'darwin') return;

  const projectRoot = path.resolve(__dirname, '..');
  const sourcePath = path.join(
    projectRoot,
    'electron',
    'native',
    'macos-notification-permission.mm',
  );
  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );
  const outputPath = path.join(
    appPath,
    'Contents',
    'MacOS',
    'LimitNotificationPermission.node',
  );
  if (
    !fs.existsSync(appPath) ||
    !fs.lstatSync(appPath).isDirectory() ||
    fs.lstatSync(appPath).isSymbolicLink()
  ) {
    throw new Error('Очікував звичайний каталог packaged Limit.app');
  }
  const realAppOutDir = fs.realpathSync(context.appOutDir);
  const realAppPath = fs.realpathSync(appPath);

  if (
    !realAppPath.startsWith(`${realAppOutDir}${path.sep}`) ||
    path.basename(realAppPath) !==
      `${context.packager.appInfo.productFilename}.app`
  ) {
    throw new Error('Неприпустимий шлях до packaged Limit.app');
  }
  if (!fs.existsSync(sourcePath) || !fs.lstatSync(sourcePath).isFile()) {
    throw new Error('Не знайдено macOS notification permission helper source');
  }

  const architectures =
    context.arch === Arch.arm64
      ? ['arm64']
      : context.arch === Arch.x64
        ? ['x86_64']
        : context.arch === Arch.universal
          ? ['arm64', 'x86_64']
          : null;
  if (!architectures)
    throw new Error(`Непідтримувана macOS архітектура: ${context.arch}`);
  const trackerPath = validatePackagedFile(
    context,
    resourceRelativePath(context, 'get-windows', 'main'),
    'macOS get-windows tracker',
  );
  const trackerArchitectureCheck = childProcess.spawnSync(
    'xcrun',
    ['lipo', trackerPath, '-verify_arch', ...architectures],
    { cwd: projectRoot, stdio: 'inherit' },
  );
  if (trackerArchitectureCheck.error) throw trackerArchitectureCheck.error;
  if (trackerArchitectureCheck.status !== 0)
    throw new Error('macOS get-windows tracker має неправильну архітектуру');

  const nodeHeaderCandidates = [
    path.resolve(path.dirname(process.execPath), '..', 'include', 'node'),
    '/opt/homebrew/include/node',
    '/usr/local/include/node',
  ];
  const nodeHeadersPath = nodeHeaderCandidates.find((candidate) =>
    fs.existsSync(path.join(candidate, 'node_api.h')),
  );
  if (!nodeHeadersPath)
    throw new Error('Не знайдено N-API headers для Node.js');

  const arguments_ = [
    'clang++',
    '-bundle',
    '-undefined',
    'dynamic_lookup',
    '-std=c++17',
    '-fobjc-arc',
    '-fblocks',
    '-mmacosx-version-min=12.0',
    '-I',
    nodeHeadersPath,
    '-framework',
    'Foundation',
    '-framework',
    'UserNotifications',
  ];
  for (const architecture of architectures) {
    arguments_.push('-arch', architecture);
  }
  arguments_.push(sourcePath, '-o', outputPath);

  const result = childProcess.spawnSync('xcrun', arguments_, {
    cwd: projectRoot,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`xcrun clang++ завершився з кодом ${result.status}`);

  fs.chmodSync(outputPath, 0o755);
  await applyElectronFuses(context);
};

module.exports.electronFuseConfig = electronFuseConfig;
module.exports.packagedElectronPath = packagedElectronPath;
module.exports.validateWindowsBinding = validateWindowsBinding;
