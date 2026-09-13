const fs = require('node:fs');
const path = require('node:path');

const GITHUB_URL = 'https://github.com/KratosHome/limit';

function publicUrl(value, { loopback = false, feedback = false } = {}) {
  if (!value) return '';
  if (typeof value !== 'string' || value.length > 2048) return '';
  try {
    const url = new URL(value);
    const host = url.hostname
      .replace(/^\[|\]$/g, '')
      .replace(/\.+$/, '')
      .toLowerCase();
    const local = ['127.0.0.1', '::1', 'localhost'].includes(host);
    const privateHost =
      local ||
      /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
        host,
      ) ||
      host === '::' ||
      host.startsWith('::ffff:') ||
      /^f[cd][\da-f]{2}:|^fe[89ab][\da-f]:/.test(host) ||
      host.endsWith('.localhost') ||
      host === 'localhost.localdomain';
    if (
      (url.protocol !== 'https:' &&
        !(loopback && local && url.protocol === 'http:')) ||
      (privateHost && !(loopback && local)) ||
      url.username ||
      url.password ||
      url.hash ||
      (feedback && (url.search || host === 'api.telegram.org'))
    )
      return '';
    return url.href;
  } catch {
    return '';
  }
}

function buildPublicSupportConfig(env = process.env) {
  const feedbackUrl = publicUrl(env.LIMIT_FEEDBACK_URL, { feedback: true });
  const donationUrl = publicUrl(env.LIMIT_DONATION_URL);
  if (env.LIMIT_FEEDBACK_URL && !feedbackUrl)
    throw new Error(
      'LIMIT_FEEDBACK_URL must be a public HTTPS relay URL without credentials or query parameters.',
    );
  if (env.LIMIT_DONATION_URL && !donationUrl)
    throw new Error('LIMIT_DONATION_URL must be a public HTTPS page.');
  if (Object.keys(env).some((key) => /^VITE_.*TELEGRAM/i.test(key)))
    throw new Error(
      'Telegram credentials must not use the VITE_ prefix. Keep them in the feedback service environment.',
    );
  return { feedbackUrl, donationUrl };
}

function readSupportConfig(
  appPath,
  { development = false, env = process.env } = {},
) {
  let config = {};
  try {
    config = JSON.parse(
      fs.readFileSync(path.join(appPath, 'dist/support-config.json'), 'utf8'),
    );
  } catch {
    // A fresh development checkout can run without a renderer build.
  }
  const feedbackUrl = publicUrl(
    development && env.LIMIT_FEEDBACK_DEV_URL
      ? env.LIMIT_FEEDBACK_DEV_URL
      : config?.feedbackUrl,
    { loopback: development, feedback: true },
  );
  return { feedbackUrl, donationUrl: publicUrl(config?.donationUrl) };
}

module.exports = {
  GITHUB_URL,
  publicUrl,
  buildPublicSupportConfig,
  readSupportConfig,
};
