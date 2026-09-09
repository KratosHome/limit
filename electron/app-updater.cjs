const CHECK_INTERVAL_MS = 4 * 60 * 60_000;

function releaseDetails(info) {
  if (!info) return {};
  const details = {};
  for (const key of ['releaseName', 'releaseDate']) {
    if (typeof info[key] === 'string' && info[key].trim())
      details[key] = info[key].trim().slice(0, 300);
  }
  const notes = Array.isArray(info.releaseNotes)
    ? info.releaseNotes
        .slice(0, 30)
        .map((entry) => (typeof entry?.note === 'string' ? entry.note : ''))
        .filter(Boolean)
        .join('\n\n')
    : info.releaseNotes;
  if (typeof notes === 'string' && notes.trim())
    details.releaseNotes = notes.trim().slice(0, 20_000);
  return details;
}

function publicAppUpdateState(state, currentVersion) {
  const result = { status: state?.status ?? 'disabled', currentVersion };
  if (typeof state?.version === 'string') result.version = state.version;
  if (Number.isFinite(state?.percent)) result.percent = state.percent;
  if (['check', 'download', 'install'].includes(state?.errorAction))
    result.errorAction = state.errorAction;
  return { ...result, ...releaseDetails(state) };
}

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
  let nativeUpdateReady = false;

  function getState() {
    return Object.freeze({ ...state });
  }

  function setState(status, version, details = {}) {
    if (disposed) return;
    const next = {
      status,
      ...(version === availableInfo?.version
        ? releaseDetails(availableInfo)
        : {}),
      ...details,
    };
    if (typeof version === 'string' && version) next.version = version;
    if (
      state.status === next.status &&
      state.version === next.version &&
      state.percent === next.percent &&
      state.filePath === next.filePath &&
      state.releaseNotes === next.releaseNotes &&
      state.releaseName === next.releaseName &&
      state.releaseDate === next.releaseDate &&
      state.errorAction === next.errorAction
    )
      return;
    state = next;
    try {
      onStateChange(getState());
    } catch (error) {
      logger.error('[updates] unable to refresh update status', error);
    }
  }

  function handleError(error, action) {
    const errorAction =
      action ??
      (installing
        ? 'install'
        : downloadPromise
          ? 'download'
          : (state.errorAction ?? 'check'));
    if (error !== lastError) {
      lastError = error;
      logger.error('[updates] update failed', error);
    }
    // A release check may settle after the user has already started its
    // announced download. Its late failure must not replace transfer progress.
    if (errorAction === 'check' && !canAcceptCheckEvent()) return;
    if (errorAction === 'install' && installing) {
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
    setState('error', state.version, { errorAction });
    removeFinishedErrorListener();
  }

  function canAcceptCheckEvent() {
    return (
      !downloadPromise &&
      !nativeUpdateReady &&
      !installing &&
      state.status !== 'installer-ready'
    );
  }

  const listeners = {
    'checking-for-update': () => {
      if (canAcceptCheckEvent()) setState('checking');
    },
    'update-available': (info) => {
      if (!canAcceptCheckEvent()) return;
      availableInfo = structuredClone(info);
      setState('available', info?.version);
    },
    'update-not-available': () => {
      if (!canAcceptCheckEvent()) return;
      availableInfo = null;
      setState('idle');
    },
    'download-progress': (progress) => {
      if (!manualInstall && downloadPromise && !nativeUpdateReady)
        setState('downloading', state.version, {
          percent: Number.isFinite(progress?.percent)
            ? Math.max(0, Math.min(100, progress.percent))
            : undefined,
        });
    },
    'update-downloaded': (info) => {
      if (manualInstall) return;
      nativeUpdateReady = true;
      setState('downloaded', info?.version);
    },
    error: (error) => {
      // Both operations have their own rejection handlers. An unlabelled
      // emitter error cannot identify which overlapping operation failed.
      if (checkPromise && downloadPromise && !installing) return;
      handleError(error);
    },
  };

  function removeFinishedErrorListener() {
    if (disposed && !checkPromise && !downloadPromise && !installing)
      autoUpdater?.removeListener('error', listeners.error);
  }

  function checkForUpdates() {
    if (!active || !ready || disposed || installing)
      return Promise.resolve(false);
    if (checkPromise) return checkPromise;
    if (nativeUpdateReady) return Promise.resolve(false);
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
        handleError(error, 'check');
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
    if (!active || !ready || disposed || installing)
      return Promise.resolve(null);
    if (manualInstall && !downloadInstaller) return Promise.resolve(null);
    if (downloadPromise) return downloadPromise;
    if (nativeUpdateReady) return Promise.resolve(true);
    if (['installer-ready', 'downloaded'].includes(state.status))
      return Promise.resolve(state.filePath || true);
    if (!availableInfo || !['available', 'error'].includes(state.status))
      return Promise.resolve(null);
    const info = availableInfo;
    const abort = new AbortController();
    downloadAbort = abort;
    lastError = null;
    const attempt = Promise.resolve()
      .then(() => {
        if (disposed) return null;
        return manualInstall
          ? downloadInstaller(info, {
              signal: abort.signal,
              onProgress: (percent) =>
                setState('downloading', info.version, { percent }),
            })
          : autoUpdater.downloadUpdate();
      })
      .then((filePath) => {
        if (disposed) return null;
        if (!manualInstall) {
          if (!Array.isArray(filePath) || filePath.length === 0)
            throw new Error('The update download did not return an installer');
          nativeUpdateReady = true;
          if (state.errorAction !== 'install')
            setState('downloaded', info.version);
          return true;
        }
        if (typeof filePath !== 'string' || !filePath)
          throw new Error('The update download did not return an installer');
        setState('installer-ready', info.version, { filePath });
        return filePath;
      })
      .catch((error) => {
        if (!disposed) handleError(error, 'download');
        return null;
      })
      .finally(() => {
        if (downloadPromise === attempt) {
          downloadPromise = null;
          downloadAbort = null;
        }
        removeFinishedErrorListener();
      });
    downloadPromise = attempt;
    setState('downloading', info.version, { percent: 0 });
    return attempt;
  }

  function start() {
    if (!active || disposed) return Promise.resolve();
    if (started) return startPromise;
    started = true;
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
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
      .catch((error) => handleError(error, 'check'));
    return startPromise;
  }

  function installUpdate() {
    if (
      !active ||
      manualInstall ||
      disposed ||
      installing ||
      !nativeUpdateReady ||
      (state.status !== 'downloaded' && state.errorAction !== 'install')
    )
      return false;
    installing = true;
    lastError = null;
    setState('downloaded', state.version);
    try {
      // Electron closes windows before before-quit on macOS. Allow the main
      // window to close before invoking the updater, rather than hiding to tray.
      const restore = prepareToQuit();
      restoreAfterFailedInstall =
        typeof restore === 'function' ? restore : null;
      autoUpdater.quitAndInstall(false, true);
      return installing;
    } catch (error) {
      handleError(error, 'install');
      return false;
    }
  }

  function dispose() {
    if (disposed) return manualInstall ? downloadPromise : null;
    disposed = true;
    downloadAbort?.abort();
    if (interval !== null) timers.clearInterval(interval);
    interval = null;
    if (!active || !started) return manualInstall ? downloadPromise : null;
    for (const [event, listener] of Object.entries(listeners)) {
      if (event !== 'error') autoUpdater.removeListener(event, listener);
    }
    // An in-flight check/download can still emit error during shutdown.
    removeFinishedErrorListener();
    return manualInstall ? downloadPromise : null;
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

module.exports = { createAppUpdater, publicAppUpdateState };
