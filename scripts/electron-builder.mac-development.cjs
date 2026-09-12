const baseConfig = require('./electron-builder.base.cjs');

module.exports = {
  ...baseConfig,
  appId: 'ua.limit.desktop.development',
  productName: 'Limit Development',
  directories: { ...baseConfig.directories, output: 'release/development' },
  extraMetadata: {
    ...baseConfig.extraMetadata,
    limitSignedDevelopment: true,
  },
  mac: { ...baseConfig.mac, identity: '-' },
};
