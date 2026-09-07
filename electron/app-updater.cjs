const CHECK_INTERVAL_MS = 4 * 60 * 60_000;

function createAppUpdater({
  app,
  autoUpdater,
  enabled = false,
  manualInstall = false,
  onStateChange = () => {},
  prepareToQuit = () => {},
  logger = console,
  timers = { setInterval, clearInterval },
}) {
  const active = Boolean(enabled && app.isPackaged && autoUpdater);
  let state = { status: active ? 'idle' : 'disabled' };
  let started = false;
  let ready = false;
  let disposed = false;
  let interval = null;
  let startPromise = null;
  let checkPromise = null;
  let installing = false;
  let restoreAfterFailedInstall = null;
  let lastError = null;

  function getState() {
    return Object.freeze({ ...state });
  }

  function setState(status, version) {
    if (disposed) return;
    const next = { status };
    if (typeof version === 'string' && version) next.version = version;
    if (state.status === next.status && state.version === next.version) return;
    state = next;
    try {
      onStateChange(getState());
    } catch (error) {
      logger.error('[updates] unable to refresh update status', error);
    }
  }

  function handleError(error) {
    if (error !== lastError) {
      lastError = error;
      logger.error('[updates] update failed', error);
    }
    if (installing) {
      installing = false;
      const restore = restoreAfterFailedInstall;
      restoreAfterFailedInstall = null;
      try {
        restore?.();
      } catch (restoreError) {
        logger.error(
          '[updates] unable to restore app after failed install',
          restoreError,
        );
      }
    }
    setState('error', state.version);
    removeFinishedErrorListener();
  }

  const listeners = {
    'checking-for-update': () => setState('checking'),
    'update-available': (info) =>
      setState(manualInstall ? 'available' : 'downloading', info?.version),
    'update-not-available': () => setState('idle'),
    'download-progress': () => {
      if (!manualInstall) setState('downloading', state.version);
    },
    'update-downloaded': (info) =>
      setState(manualInstall ? 'available' : 'downloaded', info?.version),
    error: handleError,
  };

  function removeFinishedErrorListener() {
    if (disposed && !checkPromise && !installing)
      autoUpdater?.removeListener('error', handleError);
  }

  function checkForUpdates() {
    if (!active || !ready || disposed || installing)
      return Promise.resolve(false);
    if (checkPromise) return checkPromise;
    if (state.status === 'downloaded' || state.status === 'downloading')
      return Promise.resolve(false);
    lastError = null;
    const attempt = Promise.resolve()
      .then(async () => {
        if (disposed) return false;
        const result = await autoUpdater.checkForUpdates();
        // The check resolves before its automatic download. Observe both promises
        // so a network failure cannot become an unhandled rejection.
        if (result?.downloadPromise) await result.downloadPromise;
        if (state.status === 'checking') setState('idle');
        return state.status !== 'error';
      })
      .catch((error) => {
        handleError(error);
        return false;
      })
      .finally(() => {
        if (checkPromise === attempt) checkPromise = null;
        removeFinishedErrorListener();
      });
    checkPromise = attempt;
    setState('checking');
    return attempt;
  }

  function start() {
    if (!active || disposed) return Promise.resolve();
    if (started) return startPromise;
    started = true;
    autoUpdater.autoDownload = !manualInstall;
    autoUpdater.autoInstallOnAppQuit = !manualInstall;
    autoUpdater.logger = logger;
    for (const [event, listener] of Object.entries(listeners))
      autoUpdater.on(event, listener);
    startPromise = Promise.resolve()
      .then(() => app.whenReady())
      .then(() => {
        if (disposed) return;
        ready = true;
        interval = timers.setInterval(() => {
          void checkForUpdates();
        }, CHECK_INTERVAL_MS);
        interval?.unref?.();
        void checkForUpdates();
      })
      .catch(handleError);
    return startPromise;
  }

  function installUpdate() {
    if (
      !active ||
      manualInstall ||
      disposed ||
      installing ||
      state.status !== 'downloaded'
    )
      return false;
    installing = true;
    lastError = null;
    try {
      // Electron closes windows before before-quit on macOS. Allow the main
      // window to close before invoking the updater, rather than hiding to tray.
      const restore = prepareToQuit();
      restoreAfterFailedInstall =
        typeof restore === 'function' ? restore : null;
      autoUpdater.quitAndInstall(false, true);
      return installing;
    } catch (error) {
      handleError(error);
      return false;
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (interval !== null) timers.clearInterval(interval);
    interval = null;
    if (!active || !started) return;
    for (const [event, listener] of Object.entries(listeners)) {
      if (event !== 'error') autoUpdater.removeListener(event, listener);
    }
    // An in-flight check/download can still emit error during shutdown.
    removeFinishedErrorListener();
  }

  return { start, checkForUpdates, installUpdate, getState, dispose };
}

module.exports = { createAppUpdater };
