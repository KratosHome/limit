const commonFiles = [
  'dist/**/*',
  'electron/**/*',
  '!electron/tests/**/*',
  '!electron/**/*.test.cjs',
  '!electron/native/**/*',
  'package.json',
];

module.exports = {
  appId: 'ua.limit.desktop',
  productName: 'Limit',
  afterPack: 'scripts/electron-builder-after-pack.cjs',
  asar: { smartUnpack: false },
  directories: { output: 'release' },
  artifactName: 'Limit-Local-${version}-${os}-${arch}.${ext}',
  extraMetadata: { limitAutoUpdate: false },
  electronLanguages: ['en-US', 'uk'],
  files: commonFiles,
  mac: {
    category: 'public.app-category.productivity',
    hardenedRuntime: true,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.inherit.plist',
    extraResources: [
      {
        from: 'build/locales',
        to: '.',
        filter: ['**/InfoPlist.strings'],
      },
    ],
    extendInfo: {
      NSAppleEventsUsageDescription:
        "Limit reads only the active tab's domain when website tracking is enabled.",
    },
  },
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
  },
  linux: {
    target: ['AppImage'],
    category: 'Utility',
  },
};
