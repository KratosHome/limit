const { EventEmitter } = require('node:events');
const { loadActiveWindowProvider } = require('./active-app-provider.cjs');

class ActivityTracker extends EventEmitter {
  constructor({ store, getIdleSeconds = () => 0, getSystemState = null, ownProcessId, intervalMs = 5000, activeWindowProvider = null }) {
    super();
    this.store = store;
    this.getIdleSeconds = getIdleSeconds;
    this.getSystemState = getSystemState || ((threshold) => this.getIdleSeconds() >= threshold ? 'idle' : 'active');
    this.ownProcessId = ownProcessId;
    this.intervalMs = intervalMs;
    this.timer = null;
    this.lastTickAt = 0;
    this.lastAppId = null;
    this.lastSample = null;
    this.lastSampleIsLaunch = false;
    this.currentApp = null;
    this.permissionState = 'unknown';
    this.lastError = null;
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
    this.generation += 1;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.lastTickAt = 0;
    this.lastAppId = null;
    this.lastSample = null;
    this.lastSampleIsLaunch = false;
    this.currentApp = null;
  }

  getStatus() {
    return {
      currentApp: this.currentApp,
      permissionState: this.permissionState,
      lastError: this.lastError,
      running: Boolean(this.timer),
    };
  }

  async tick() {
    if (this.ticking) return;
    this.ticking = true;
    const generation = this.generation;
    const monotonicNow = performance.now();
    const elapsedRaw = this.lastTickAt ? (monotonicNow - this.lastTickAt) / 1000 : 0;
    const elapsed = elapsedRaw <= this.intervalMs / 1000 * 2 ? elapsedRaw : 0;
    this.lastTickAt = monotonicNow;

    try {
      const settings = this.store.getSettings();
      if (!settings.trackingEnabled || this.getSystemState(settings.idleThresholdSeconds) !== 'active') {
        this.lastAppId = null;
        this.lastSample = null;
        this.lastSampleIsLaunch = false;
        this.currentApp = null;
        this.emit('updated', this.getStatus());
        return;
      }

      const activeWin = await this.loadProvider();
      const windowInfo = await activeWin();
      if (generation !== this.generation) return;
      if (!windowInfo?.owner?.name || windowInfo.owner.processId === this.ownProcessId) {
        this.lastAppId = null;
        this.lastSample = null;
        this.lastSampleIsLaunch = false;
        this.currentApp = null;
        return;
      }

      const id = windowInfo.owner.bundleId || windowInfo.owner.path || windowInfo.owner.name.toLowerCase();
      const sample = {
        id,
        name: windowInfo.owner.name,
        title: '',
      };
      const isLaunch = this.lastAppId !== id;
      if (this.lastSample && elapsed > 0) {
        this.store.recordSample(this.lastSample, elapsed, this.lastSampleIsLaunch, new Date());
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
      this.lastAppId = null;
      this.lastSample = null;
      this.lastSampleIsLaunch = false;
      this.currentApp = null;
      this.lastError = error instanceof Error ? error.message : String(error);
      this.permissionState = /wayland|unavailable|unsupported/i.test(this.lastError)
        ? 'unsupported'
        : /permission|screen recording|accessibility/i.test(this.lastError) ? 'denied' : 'error';
      this.emit('updated', this.getStatus());
    } finally {
      this.ticking = false;
    }
  }
}

module.exports = { ActivityTracker };
