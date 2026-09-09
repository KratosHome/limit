const { EventEmitter } = require('node:events');
const { URL } = require('node:url');
const { loadActiveWindowProvider } = require('./active-app-provider.cjs');

function siteFromUrl(value) {
  if (typeof value !== 'string' || !value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
      return null;
    const domain = parsed.hostname
      .toLowerCase()
      .replace(/\.$/, '')
      .replace(/^www\./, '');
    return domain ? { domain } : null;
  } catch {
    return null;
  }
}

function websitePermissionState(error) {
  if (!error) return 'granted';
  return /permission|accessibility|automation|not authorized|-1743/i.test(error)
    ? 'denied'
    : 'error';
}

function isSupportedBrowserWindow(windowInfo) {
  const bundleId = String(windowInfo?.owner?.bundleId || '').toLowerCase();
  if (
    bundleId === 'company.thebrowser.browser' ||
    bundleId === 'com.apple.safari' ||
    bundleId === 'com.apple.safaritechnologypreview'
  )
    return true;
  return /^(com\.google\.chrome|com\.brave\.browser|com\.microsoft\.edgemac|com\.operasoftware\.opera|com\.vivaldi\.vivaldi)/.test(
    bundleId,
  );
}

class ActivityTracker extends EventEmitter {
  constructor({
    store,
    getSystemState = () => 'active',
    hasAccessibilityPermission = null,
    ownProcessId,
    intervalMs = 5000,
    activeWindowProvider = null,
  }) {
    super();
    this.store = store;
    this.getSystemState = getSystemState;
    this.hasAccessibilityPermission =
      typeof hasAccessibilityPermission === 'function'
        ? hasAccessibilityPermission
        : null;
    this.ownProcessId = ownProcessId;
    this.intervalMs = intervalMs;
    this.timer = null;
    this.lastTickAt = 0;
    this.lastAppId = null;
    this.lastSample = null;
    this.lastSampleIsLaunch = false;
    this.currentApp = null;
    this.activityState = 'unknown';
    this.permissionState = 'unknown';
    this.lastError = null;
    this.websitePermissionState = 'disabled';
    this.lastWebsiteError = null;
    this.activeWin = activeWindowProvider;
    this.ticking = false;
    this.generation = 0;
  }

  async loadProvider() {
    if (this.activeWin) return this.activeWin;
    this.activeWin = await loadActiveWindowProvider();
    return this.activeWin;
  }

  start() {
    if (this.timer) return;
    this.generation += 1;
    this.lastTickAt = performance.now();
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    void this.tick();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.resetActivity();
  }

  clearActivity(activityState) {
    this.lastTickAt = 0;
    this.lastAppId = null;
    this.lastSample = null;
    this.lastSampleIsLaunch = false;
    this.currentApp = null;
    this.activityState = activityState;
  }

  resetActivity() {
    this.generation += 1;
    this.clearActivity(
      this.store.getSettings().trackingEnabled ? 'unknown' : 'paused',
    );
    this.emit('updated', this.getStatus());
  }

  getActivityState(settings) {
    if (!settings.trackingEnabled) return 'paused';
    const state = this.getSystemState();
    // Reading or watching the foreground app still counts without input.
    if (state === 'idle') return 'active';
    return ['active', 'locked'].includes(state) ? state : 'unknown';
  }

  getStatus() {
    const paused = !this.store.getSettings().trackingEnabled;
    return {
      currentApp: paused ? null : this.currentApp,
      activityState: paused ? 'paused' : this.activityState,
      permissionState: this.permissionState,
      lastError: this.lastError,
      websitePermissionState: this.websitePermissionState,
      lastWebsiteError: this.lastWebsiteError,
      running: Boolean(this.timer),
    };
  }

  async tick() {
    if (this.ticking) return;
    this.ticking = true;
    const generation = this.generation;
    const monotonicNow = performance.now();
    const elapsedRaw = this.lastTickAt
      ? (monotonicNow - this.lastTickAt) / 1000
      : 0;
    const elapsed = elapsedRaw <= (this.intervalMs / 1000) * 2 ? elapsedRaw : 0;
    this.lastTickAt = monotonicNow;

    try {
      const settings = this.store.getSettings();
      const activityState = this.getActivityState(settings);
      if (activityState !== 'active') {
        this.clearActivity(activityState);
        this.emit('updated', this.getStatus());
        return;
      }

      const activeWin = await this.loadProvider();
      if (generation !== this.generation) return;
      const websiteTrackingEnabled = settings.websiteTrackingEnabled === true;
      if (websiteTrackingEnabled && this.websitePermissionState === 'disabled')
        this.websitePermissionState = 'pending';
      const accessibilityBlocked =
        websiteTrackingEnabled &&
        this.hasAccessibilityPermission &&
        !this.hasAccessibilityPermission();
      const windowInfo = await activeWin({
        websiteTrackingEnabled: websiteTrackingEnabled && !accessibilityBlocked,
      });
      if (generation !== this.generation) return;
      const currentActivityState = this.getActivityState(
        this.store.getSettings(),
      );
      if (currentActivityState !== 'active') {
        this.clearActivity(currentActivityState);
        this.emit('updated', this.getStatus());
        return;
      }
      this.activityState = 'active';
      if (websiteTrackingEnabled) {
        this.lastWebsiteError = accessibilityBlocked
          ? 'accessibility-permission'
          : windowInfo?.websiteTrackingError || null;
        if (accessibilityBlocked) {
          this.websitePermissionState = 'denied';
        } else if (this.lastWebsiteError) {
          this.websitePermissionState = websitePermissionState(
            this.lastWebsiteError,
          );
        } else if (isSupportedBrowserWindow(windowInfo)) {
          if (typeof windowInfo.url === 'string' && windowInfo.url.trim()) {
            this.websitePermissionState = 'granted';
          } else if (this.websitePermissionState !== 'granted') {
            this.websitePermissionState = 'unavailable';
          }
        }
      } else {
        this.lastWebsiteError = null;
        this.websitePermissionState = 'disabled';
      }
      if (
        !windowInfo?.owner?.name ||
        windowInfo.owner.processId === this.ownProcessId
      ) {
        this.clearActivity(windowInfo?.owner?.name ? 'active' : 'unknown');
        this.emit('updated', this.getStatus());
        return;
      }

      const id =
        windowInfo.owner.bundleId ||
        windowInfo.owner.path ||
        windowInfo.owner.name.toLowerCase();
      const sample = {
        id,
        name: windowInfo.owner.name,
        executablePath:
          typeof windowInfo.owner.path === 'string'
            ? windowInfo.owner.path
            : null,
        title: '',
        site: websiteTrackingEnabled ? siteFromUrl(windowInfo.url) : null,
      };
      const isLaunch = this.lastAppId !== id;
      if (this.lastSample && elapsed > 0) {
        this.store.recordSample(
          this.lastSample,
          elapsed,
          this.lastSampleIsLaunch,
          new Date(),
        );
        this.emit('sample', this.lastSample);
      }
      this.lastAppId = id;
      this.lastSample = sample;
      this.lastSampleIsLaunch = isLaunch;
      this.currentApp = sample;
      this.permissionState = 'granted';
      this.lastError = null;
      this.emit('updated', this.getStatus());
    } catch (error) {
      if (generation !== this.generation) return;
      this.clearActivity('unknown');
      this.lastError = error instanceof Error ? error.message : String(error);
      this.permissionState = /wayland|unavailable|unsupported/i.test(
        this.lastError,
      )
        ? 'unsupported'
        : /permission|screen recording|accessibility/i.test(this.lastError)
          ? 'denied'
          : 'error';
      this.emit('updated', this.getStatus());
    } finally {
      this.ticking = false;
    }
  }
}

module.exports = {
  ActivityTracker,
  isSupportedBrowserWindow,
  siteFromUrl,
  websitePermissionState,
};
