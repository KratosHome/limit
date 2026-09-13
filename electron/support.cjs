const { AppError, ERROR_CODES } = require('./errors.cjs');
const { GITHUB_URL, publicUrl } = require('./support-config.cjs');

function validateFeedback(input) {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    typeof input.message !== 'string' ||
    input.message.length > 3000 ||
    input.message.trim().length < 10 ||
    !['health', 'settings'].includes(input.source) ||
    (input.contact !== undefined &&
      (typeof input.contact !== 'string' || input.contact.length > 200))
  )
    throw new AppError(ERROR_CODES.FEEDBACK_INVALID);
  return {
    message: input.message.trim(),
    contact: input.contact?.trim() || '',
    source: input.source,
  };
}

function createSupport({
  config,
  development = false,
  fetch: fetchRequest = globalThis.fetch,
  openExternal,
  now = Date.now,
}) {
  const feedbackUrl = publicUrl(config.feedbackUrl, {
    loopback: development,
    feedback: true,
  });
  const donationUrl = publicUrl(config.donationUrl);
  let pending = false;
  let nextSendAt = 0;
  return {
    getConfig: () => ({
      feedbackAvailable: Boolean(feedbackUrl),
      donationAvailable: Boolean(donationUrl),
    }),
    async sendFeedback(input) {
      const body = validateFeedback(input);
      if (!feedbackUrl) throw new AppError(ERROR_CODES.FEEDBACK_UNAVAILABLE);
      if (pending || now() < nextSendAt)
        throw new AppError(ERROR_CODES.FEEDBACK_RATE_LIMITED);
      pending = true;
      nextSendAt = now() + 5000;
      try {
        const response = await fetchRequest(feedbackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          redirect: 'error',
          credentials: 'omit',
          signal: AbortSignal.timeout(15_000),
        });
        if (response.status === 429)
          throw new AppError(ERROR_CODES.FEEDBACK_RATE_LIMITED);
        if (!response.ok) throw new AppError(ERROR_CODES.FEEDBACK_UNAVAILABLE);
        const result = await response.json();
        if (result?.ok !== true)
          throw new AppError(ERROR_CODES.FEEDBACK_UNAVAILABLE);
        nextSendAt = now() + 30_000;
        return true;
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError(ERROR_CODES.FEEDBACK_UNAVAILABLE);
      } finally {
        pending = false;
      }
    },
    async openLink(kind) {
      const url =
        kind === 'github' ? GITHUB_URL : kind === 'donate' ? donationUrl : '';
      if (!url) throw new AppError(ERROR_CODES.SUPPORT_LINK_UNAVAILABLE);
      try {
        await openExternal(url);
        return true;
      } catch {
        throw new AppError(ERROR_CODES.SUPPORT_LINK_UNAVAILABLE);
      }
    },
  };
}

module.exports = { createSupport, validateFeedback };
