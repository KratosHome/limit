const build = require('./electron-builder.base.cjs');

const targetsWindows =
  process.argv.includes('--win') || process.argv.includes('-w');
const targetsLinux =
  process.argv.includes('--linux') || process.argv.includes('-l');
const targetsMac =
  process.argv.includes('--mac') ||
  process.argv.includes('-m') ||
  (process.platform === 'darwin' && !targetsWindows && !targetsLinux);
const hasNotarizationCredentials = Boolean(
  (process.env.APPLE_API_KEY &&
    process.env.APPLE_API_KEY_ID &&
    process.env.APPLE_API_ISSUER) ||
  (process.env.APPLE_ID &&
    process.env.APPLE_APP_SPECIFIC_PASSWORD &&
    process.env.APPLE_TEAM_ID) ||
  process.env.APPLE_KEYCHAIN_PROFILE,
);

if (targetsMac && !hasNotarizationCredentials) {
  throw new Error(
    'macOS release requires Apple notarization credentials; use package:mac:local for an ad-hoc development build.',
  );
}

module.exports = {
  ...build,
  forceCodeSigning: true,
  afterSign: 'scripts/electron-builder-after-sign.cjs',
  mac: {
    ...build.mac,
    type: 'distribution',
    notarize: true,
  },
};
