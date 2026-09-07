const CHECK_INTERVAL_MS = 4 * 60 * 60_000;

function createAppUpdater({
  app,
  autoUpdater,
  enabled = false,
  manualInstall = false,
  downloadInstaller,
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
  let availableInfo = null;
  let downloadPromise = null;
  let downloadAbort = null;

  function getState() {
    return Object.freeze({ ...state });
  }

  function setState(status, version, details = {}) {
    if (disposed) return;
    const next = { status, ...details };
    if (typeof version === 'string' && version) next.version = version;
    if (
      state.status === next.status &&
      state.version === next.version &&
      state.percent === next.percent &&
      state.filePath === next.filePath
    )
      return;
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
    'update-available': (info) => {
      if (manualInstall) availableInfo = structuredClone(info);
      setState(manualInstall ? 'available' : 'downloading', info?.version);
    },
    'update-not-available': () => {
      availableInfo = null;
      setState('idle');
    },
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
    if (['downloaded', 'downloading', 'installer-ready'].includes(state.status))
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

  function downloadUpdate() {
    if (!active || !manualInstall || !ready || disposed || !downloadInstaller)
      return Promise.resolve(null);
    if (downloadPromise) return downloadPromise;
    if (state.status === 'installer-ready')
      return Promise.resolve(state.filePath);
    if (!availableInfo || !['available', 'error'].includes(state.status))
      return Promise.resolve(null);
    const info = availableInfo;
    const abort = new AbortController();
    downloadAbort = abort;
    lastError = null;
    const attempt = Promise.resolve()
      .then(() => {
        if (disposed) return null;
        return downloadInstaller(info, {
          signal: abort.signal,
          onProgress: (percent) =>
            setState('downloading', info.version, { percent }),
        });
      })
      .then((filePath) => {
        if (disposed) return null;
        if (typeof filePath !== 'string' || !filePath)
          throw new Error('The update download did not return an installer');
        setState('installer-ready', info.version, { filePath });
        return filePath;
      })
      .catch((error) => {
        if (!disposed) handleError(error);
        return null;
      })
      .finally(() => {
        if (downloadPromise === attempt) {
          downloadPromise = null;
          downloadAbort = null;
        }
      });
    downloadPromise = attempt;
    setState('downloading', info.version, { percent: 0 });
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
    if (disposed) return downloadPromise;
    disposed = true;
    downloadAbort?.abort();
    if (interval !== null) timers.clearInterval(interval);
    interval = null;
    if (!active || !started) return downloadPromise;
    for (const [event, listener] of Object.entries(listeners)) {
      if (event !== 'error') autoUpdater.removeListener(event, listener);
    }
    // An in-flight check/download can still emit error during shutdown.
    removeFinishedErrorListener();
    return downloadPromise;
  }

  return {
    start,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    getState,
    dispose,
  };
}

module.exports = { createAppUpdater };
