const build = require('./electron-builder.base.cjs');

module.exports = {
  ...build,
  directories: { ...build.directories, output: 'release/publish' },
  artifactName: 'Limit-${version}-${os}-${arch}.${ext}',
  extraMetadata: { ...build.extraMetadata, limitAutoUpdate: true },
  forceCodeSigning: false,
  publish: {
    provider: 'github',
    owner: 'KratosHome',
    repo: 'limit',
    releaseType: 'draft',
  },
  win: {
    ...build.win,
    // Preserve icons, version resources and execution metadata without a paid certificate.
    signExecutable: false,
    verifyUpdateCodeSignature: false,
    signtoolOptions: { publisherName: null },
  },
  mac: {
    ...build.mac,
    target: [
      { target: 'dmg', arch: ['universal'] },
      { target: 'zip', arch: ['universal'] },
    ],
    identity: '-',
    type: 'distribution',
    notarize: false,
  },
};
