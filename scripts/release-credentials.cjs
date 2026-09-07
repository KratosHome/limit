function validateReleaseCredentials(platform, environment = process.env) {
  const required =
    platform === 'win32'
      ? ['WIN_CSC_LINK', 'WIN_CSC_KEY_PASSWORD']
      : platform === 'darwin'
        ? [
            'CSC_LINK',
            'CSC_KEY_PASSWORD',
            'APPLE_ID',
            'APPLE_APP_SPECIFIC_PASSWORD',
            'APPLE_TEAM_ID',
          ]
        : null;
  if (!required) throw new Error('Release CI supports Windows and macOS');
  const missing = required.filter((name) => !environment[name]?.trim());
  if (missing.length)
    throw new Error(`Missing release credentials: ${missing.join(', ')}`);
}

if (require.main === module) {
  validateReleaseCredentials(process.platform);
  console.log('Release credentials are configured.');
}

module.exports = { validateReleaseCredentials };
