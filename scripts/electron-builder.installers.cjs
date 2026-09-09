const release = require('./electron-builder.release.cjs');

// Source builds have the base package version, not the version assigned by CI.
// Keep unpublished code out of the production update feed.
module.exports = {
  ...release,
  directories: { ...release.directories, output: 'release/local' },
  artifactName: 'Limit-Local-${version}-${os}-${arch}.${ext}',
  extraMetadata: { ...release.extraMetadata, limitAutoUpdate: false },
  publish: null,
};
