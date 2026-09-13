const fs = require('node:fs');
const path = require('node:path');
const { buildPublicSupportConfig } = require('../electron/support-config.cjs');

try {
  const config = buildPublicSupportConfig();
  const directory = path.resolve(__dirname, '../dist');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, 'support-config.json'),
    `${JSON.stringify(config, null, 2)}\n`,
  );
  console.log(
    `Support: feedback ${config.feedbackUrl ? 'configured' : 'not configured'}, donations ${config.donationUrl ? 'configured' : 'not configured'}.`,
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
