function createAccessibilityPermissionController({
  platform = process.platform,
  isTrustedAccessibilityClient = null,
} = {}) {
  const isMac = platform === 'darwin';
  let promptRequested = false;

  function isGranted() {
    if (!isMac) return true;
    if (typeof isTrustedAccessibilityClient !== 'function') return false;
    try {
      // Background checks must never be allowed to display a macOS prompt.
      return Boolean(isTrustedAccessibilityClient(false));
    } catch {
      return false;
    }
  }

  function requestOnce() {
    if (!isMac || isGranted()) return true;
    if (promptRequested || typeof isTrustedAccessibilityClient !== 'function')
      return false;
    promptRequested = true;
    try {
      // The prompt-capable call is reserved for an explicit user action.
      return Boolean(isTrustedAccessibilityClient(true));
    } catch {
      return false;
    }
  }

  return { isGranted, requestOnce };
}

module.exports = { createAccessibilityPermissionController };
