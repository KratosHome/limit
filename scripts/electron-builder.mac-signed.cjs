const release = require('./electron-builder.release.cjs');

// This configuration is used only for Developer ID macOS releases. A missing
// certificate or notarization failure must fail the release, never fall back
// to an ad-hoc build that would invalidate users' privacy permissions.
module.exports = {
  ...release,
  forceCodeSigning: true,
  afterSign: 'scripts/electron-builder-after-sign.cjs',
  extraMetadata: { ...release.extraMetadata, limitMacNativeUpdate: true },
  mac: {
    ...release.mac,
    identity: undefined,
    notarize: true,
  },
};
