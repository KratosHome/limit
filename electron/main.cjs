const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  powerMonitor,
  session,
  shell,
  systemPreferences,
  Tray,
} = require('electron');
const {
  createAccessibilityPermissionController,
} = require('./accessibility-permission.cjs');
const { fileIconSize, resolveApplicationIconPath } = require('./app-icon.cjs');
const { UsageStore, localDay } = require('./store.cjs');
const { ActivityTracker } = require('./tracker.cjs');
const { desktopMessages, resolveDesktopLanguage } = require('./i18n.cjs');
const {
  isLimitNotificationDue,
  notificationKey,
  pruneDayScopedCache,
} = require('./limit-notification-rules.cjs');
const {
  getWindowsNotificationSetting,
} = require('./windows-notification-state.cjs');

let mainWindow = null;
let tray = null;
let isQuitting = false;
let store = null;
let tracker = null;
let accessibilityPermission = null;
let updateTimer = null;
let screenLocked = false;
let suspended = false;
const pendingAlerts = new Set();
const notificationRetryAt = new Map();
const inAppAlertsShown = new Set();
const queuedInAppAlerts = new Map();
const deliveredAlerts = new Set();
const activeSystemNotifications = new Map();
const limitNotificationRevisions = new Map();
let nextLimitNotificationRevision = 0;
let notificationAuthorizationPromise = null;
let notificationAuthorizationGeneration = 0;
let notificationPermissionPrompt = null;
let macOSNotificationPermissionModule = null;
let notificationSettingsDialogShown = false;
let notificationSettingsDialogPromise = null;
let notificationPermissionSnapshot = {
  authorizationStatus: 'unknown',
  canPresent: false,
};
let notificationPermissionCheckedAt = 0;
let notificationPermissionRefreshPromise = null;
let windowsNotificationSettingsPromise = null;
let limitNotificationRendererReady = false;
const appIconCache = new Map();
const appIconMissCache = new Map();
const appIconPending = new Map();
const MAX_APP_ICON_CACHE_ENTRIES = 256;
const MAX_PENDING_APP_ICONS = 128;
const isSignedDevelopment =
  process.platform === 'darwin' &&
  app.isPackaged &&
  process.env.LIMIT_SIGNED_DEVELOPMENT === '1';
const shouldTestSystemNotification =
  isSignedDevelopment && process.env.LIMIT_SYSTEM_NOTIFICATION_TEST === '1';
const notificationTestId = /^\d{1,12}$/.test(
  process.env.LIMIT_SYSTEM_NOTIFICATION_TEST_ID || '',
)
  ? process.env.LIMIT_SYSTEM_NOTIFICATION_TEST_ID
  : null;

if (shouldTestSystemNotification && notificationTestId) {
  app.setPath(
    'userData',
    path.join(
      app.getPath('temp'),
      `Limit Notification Test ${notificationTestId}`,
    ),
  );
} else {
  const userDataDirectory = app.isPackaged
    ? isSignedDevelopment
      ? 'Limit Development'
      : 'Limit'
    : 'Limit UI Development';
  app.setPath('userData', path.join(app.getPath('appData'), userDataDirectory));
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  isQuitting = true;
  app.quit();
}

if (process.platform === 'win32') app.setAppUserModelId('ua.limit.desktop');

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow();
  mainWindow.show();
  mainWindow.focus();
}

function createWindow() {
  limitNotificationRendererReady = false;
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 1020,
    minHeight: 680,
    show: false,
    title: 'Limit',
    backgroundColor: '#f5f7fb',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      devTools: !app.isPackaged,
    },
  });

  const rendererUrl =
    !app.isPackaged &&
    process.env.ELECTRON_RENDERER_URL === 'http://127.0.0.1:5173'
      ? process.env.ELECTRON_RENDERER_URL
      : null;
  if (rendererUrl) {
    void mainWindow.loadURL(rendererUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.webContents.on('did-start-loading', () => {
    limitNotificationRendererReady = false;
  });
  mainWindow.webContents.on('render-process-gone', () => {
    limitNotificationRendererReady = false;
  });
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function configureSessionSecurity() {
  const scriptSources = app.isPackaged
    ? "script-src 'self'"
    : "script-src 'self' 'unsafe-inline'";
  const connectSources = app.isPackaged
    ? "connect-src 'self'"
    : "connect-src 'self' ws://127.0.0.1:* http://127.0.0.1:*";
  const contentSecurityPolicy = [
    "default-src 'self'",
    scriptSources,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    connectSources,
    "object-src 'none'",
    "base-uri 'self'",
    "frame-src 'none'",
  ].join('; ');

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [contentSecurityPolicy],
      },
    });
  });
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);
}

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, url) => {
    if (url !== contents.getURL()) event.preventDefault();
  });
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  if (app.isPackaged) {
    contents.on('before-input-event', (event, input) => {
      const opensDevTools =
        input.key === 'F12' ||
        ((input.control || input.meta) && input.shift && input.key === 'I') ||
        (input.meta && input.alt && input.key === 'I');
      if (opensDevTools) event.preventDefault();
    });
  }
});

function createTray() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><rect x="1" y="1" width="16" height="16" rx="5" fill="#111827"/><path d="M9 4.2v5.2l3.2 1.8" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round"/><circle cx="9" cy="9" r="5.1" fill="none" stroke="white" stroke-width="1.2"/></svg>`;
  const icon = nativeImage.createFromDataURL(
    `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
  );
  if (process.platform === 'darwin') icon.setTemplateImage(true);
  tray = new Tray(icon.resize({ width: 18, height: 18 }));
  tray.setToolTip(desktopMessages(store?.getSettings().language).trayTooltip);
  refreshTrayMenu();
  tray.on('click', showMainWindow);
}

function refreshTrayMenu() {
  if (!tray || !store) return;
  const settings = store.getSettings();
  const trackingEnabled = settings.trackingEnabled;
  const t = desktopMessages(settings.language);
  tray.setToolTip(t.trayTooltip);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: t.open, click: showMainWindow },
      {
        label: trackingEnabled ? t.pauseTracking : t.resumeTracking,
        click: () => {
          store.updateSettings({ trackingEnabled: !trackingEnabled });
          broadcastUpdate();
          refreshTrayMenu();
        },
      },
      { type: 'separator' },
      {
        label: t.quit,
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]),
  );
}

function broadcastUpdate(payload = {}) {
  if (mainWindow && !mainWindow.isDestroyed())
    mainWindow.webContents.send('data:updated', payload);
}

function resolveMacOSNotificationPermissionHelper() {
  if (process.platform !== 'darwin' || !app.isPackaged) return null;
  try {
    const contentsPath = fs.realpathSync(
      path.resolve(process.resourcesPath, '..'),
    );
    const helperPath = path.join(
      contentsPath,
      'MacOS',
      'LimitNotificationPermission.node',
    );
    if (
      !fs.existsSync(helperPath) ||
      !fs.lstatSync(helperPath).isFile() ||
      fs.lstatSync(helperPath).isSymbolicLink()
    ) {
      return null;
    }
    const realHelperPath = fs.realpathSync(helperPath);
    if (!realHelperPath.startsWith(`${contentsPath}${path.sep}`)) return null;
    return realHelperPath;
  } catch {
    return null;
  }
}

async function getMacOSNotificationSettings() {
  const helperPath = resolveMacOSNotificationPermissionHelper();
  if (!helperPath)
    throw new Error('macOS notification permission helper is unavailable');

  try {
    if (!macOSNotificationPermissionModule) {
      macOSNotificationPermissionModule = require(helperPath);
    }
    if (
      typeof macOSNotificationPermissionModule.getNotificationSettings !==
      'function'
    ) {
      throw new Error('missing getNotificationSettings export');
    }
    const settings =
      await macOSNotificationPermissionModule.getNotificationSettings();
    const authorizationStatuses = new Set([
      'not-determined',
      'denied',
      'authorized',
      'provisional',
    ]);
    const notificationSettings = new Set([
      'not-supported',
      'disabled',
      'enabled',
    ]);
    if (
      settings?.bundleIdentifier !== 'ua.limit.desktop' ||
      !authorizationStatuses.has(settings.authorizationStatus) ||
      !notificationSettings.has(settings.alertSetting) ||
      !notificationSettings.has(settings.notificationCenterSetting) ||
      !notificationSettings.has(settings.soundSetting)
    ) {
      throw new Error('unexpected helper response');
    }
    updateMacOSNotificationPermissionSnapshot(settings);
    return settings;
  } catch (error) {
    notificationPermissionCheckedAt = Date.now();
    throw new Error(
      `Unable to read macOS notification permission: ${error instanceof Error ? error.message : 'unknown error'}`,
      { cause: error },
    );
  }
}

function canPresentMacOSNotification(settings) {
  return (
    (settings.authorizationStatus === 'authorized' ||
      settings.authorizationStatus === 'provisional') &&
    settings.alertSetting === 'enabled'
  );
}

function setNotificationPermissionSnapshot(nextSnapshot) {
  const changed =
    nextSnapshot.authorizationStatus !==
      notificationPermissionSnapshot.authorizationStatus ||
    nextSnapshot.canPresent !== notificationPermissionSnapshot.canPresent;
  notificationPermissionSnapshot = nextSnapshot;
  notificationPermissionCheckedAt = Date.now();
  if (changed) broadcastUpdate({ reason: 'notification-permission' });
}

function updateMacOSNotificationPermissionSnapshot(settings) {
  setNotificationPermissionSnapshot({
    authorizationStatus: settings.authorizationStatus,
    canPresent: canPresentMacOSNotification(settings),
  });
}

async function getWindowsNotificationSettings() {
  if (
    process.platform !== 'win32' ||
    !app.isPackaged ||
    !Notification.isSupported()
  ) {
    throw new Error('Windows notifications are unavailable');
  }
  const setting = await getWindowsNotificationSetting();
  const snapshot = {
    authorizationStatus: setting.canPresent ? 'authorized' : 'suppressed',
    canPresent: setting.canPresent,
  };
  setNotificationPermissionSnapshot(snapshot);
  return snapshot;
}

function refreshWindowsNotificationSettings({ force = false } = {}) {
  const cacheDuration = 5 * 60_000;
  if (
    !force &&
    notificationPermissionCheckedAt > 0 &&
    Date.now() - notificationPermissionCheckedAt < cacheDuration
  ) {
    return Promise.resolve({ ...notificationPermissionSnapshot });
  }
  if (windowsNotificationSettingsPromise)
    return windowsNotificationSettingsPromise;
  const settingsPromise = getWindowsNotificationSettings()
    .catch((error) => {
      notificationPermissionCheckedAt = Date.now();
      throw error;
    })
    .finally(() => {
      if (windowsNotificationSettingsPromise === settingsPromise)
        windowsNotificationSettingsPromise = null;
    });
  windowsNotificationSettingsPromise = settingsPromise;
  return settingsPromise;
}

function getNotificationPermissionSnapshot() {
  if (process.platform === 'win32') {
    if (!app.isPackaged || !Notification.isSupported()) {
      return { authorizationStatus: 'unsupported', canPresent: false };
    }
    return { ...notificationPermissionSnapshot };
  }
  if (process.platform !== 'darwin') {
    const supported = Notification.isSupported();
    return {
      authorizationStatus: supported ? 'authorized' : 'unsupported',
      canPresent: supported,
    };
  }
  if (!app.isPackaged)
    return { authorizationStatus: 'unsupported', canPresent: false };
  return { ...notificationPermissionSnapshot };
}

function refreshNotificationPermissionSnapshot() {
  const supportsPermissionQuery =
    process.platform === 'darwin' && app.isPackaged;
  if (process.platform === 'win32' && app.isPackaged) {
    void refreshWindowsNotificationSettings().catch((error) => {
      console.error('[notifications] unable to refresh authorization', error);
    });
    return;
  }
  const cacheDuration = 5000;
  if (
    !supportsPermissionQuery ||
    Date.now() - notificationPermissionCheckedAt < cacheDuration
  ) {
    return;
  }
  if (notificationPermissionRefreshPromise) return;
  const refreshPromise = getMacOSNotificationSettings()
    .catch((error) => {
      notificationPermissionCheckedAt = Date.now();
      console.error('[notifications] unable to refresh authorization', error);
    })
    .finally(() => {
      if (notificationPermissionRefreshPromise === refreshPromise)
        notificationPermissionRefreshPromise = null;
    });
  notificationPermissionRefreshPromise = refreshPromise;
}

function areLimitNotificationsEnabled() {
  return !store || store.getSettings().notificationsEnabled;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForMacOSNotificationAuthorization(timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await delay(750);
    try {
      const settings = await getMacOSNotificationSettings();
      if (canPresentMacOSNotification(settings)) return true;
    } catch (error) {
      console.error('[notifications] authorization poll failed', error);
      return false;
    }
  }
  return false;
}

function promptForMacOSNotificationSettings() {
  if (notificationSettingsDialogPromise)
    return notificationSettingsDialogPromise;
  const generation = notificationAuthorizationGeneration;
  const isCurrentRequest = () =>
    generation === notificationAuthorizationGeneration &&
    areLimitNotificationsEnabled();
  const promptPromise = (async () => {
    if (
      process.platform !== 'darwin' ||
      !app.isPackaged ||
      !isCurrentRequest() ||
      notificationSettingsDialogShown
    ) {
      return false;
    }
    let settings;
    try {
      settings = await getMacOSNotificationSettings();
    } catch (error) {
      console.error(
        '[notifications] unable to read settings for prompt',
        error,
      );
      return false;
    }
    if (
      !isCurrentRequest() ||
      notificationSettingsDialogShown ||
      canPresentMacOSNotification(settings) ||
      (settings.authorizationStatus !== 'denied' &&
        settings.alertSetting !== 'disabled')
    ) {
      return false;
    }

    notificationSettingsDialogShown = true;
    const t = desktopMessages(
      store?.getSettings().language ||
        resolveDesktopLanguage(app.getPreferredSystemLanguages()),
    );
    const options = {
      type: 'warning',
      title: t.notificationPermissionTitle,
      message: t.notificationPermissionMessage,
      detail: t.notificationPermissionDetail,
      buttons: [t.openNotificationSettings, t.later],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    };
    try {
      const result =
        mainWindow && !mainWindow.isDestroyed()
          ? await dialog.showMessageBox(mainWindow, options)
          : await dialog.showMessageBox(options);
      if (result.response !== 0 || !isCurrentRequest()) return false;
      await shell.openExternal(
        'x-apple.systempreferences:com.apple.Notifications-Settings.extension',
      );
      return true;
    } catch (error) {
      console.error(
        '[notifications] unable to open notification settings',
        error,
      );
      return false;
    }
  })().finally(() => {
    if (notificationSettingsDialogPromise === promptPromise)
      notificationSettingsDialogPromise = null;
  });
  notificationSettingsDialogPromise = promptPromise;
  return promptPromise;
}

function ensureSystemNotificationAuthorization({
  requestIfNeeded = false,
  timeoutMs = 120_000,
} = {}) {
  if (!areLimitNotificationsEnabled()) return Promise.resolve(false);
  if (process.platform === 'win32') {
    if (!app.isPackaged || !Notification.isSupported())
      return Promise.resolve(false);
    return refreshWindowsNotificationSettings({ force: true })
      .then((settings) => settings.canPresent)
      .catch((error) => {
        notificationPermissionCheckedAt = Date.now();
        console.error(
          '[notifications] unable to read Windows notification setting; attempting delivery',
          error,
        );
        return true;
      });
  }
  if (process.platform !== 'darwin')
    return Promise.resolve(Notification.isSupported());
  if (!app.isPackaged || !Notification.isSupported())
    return Promise.resolve(false);
  if (notificationAuthorizationPromise) return notificationAuthorizationPromise;

  const generation = notificationAuthorizationGeneration;
  const isCurrentRequest = () =>
    generation === notificationAuthorizationGeneration &&
    areLimitNotificationsEnabled();
  let permissionPrompt = null;
  let permissionPromptFailed = false;
  const authorizationPromise = (async () => {
    let settings;
    try {
      settings = await getMacOSNotificationSettings();
    } catch (error) {
      console.error('[notifications] unable to read authorization', error);
      return false;
    }
    if (!isCurrentRequest()) return false;
    if (canPresentMacOSNotification(settings)) return true;
    if (settings.authorizationStatus !== 'not-determined' || !requestIfNeeded) {
      console.error(
        `[notifications] macOS authorization=${settings.authorizationStatus}, alert=${settings.alertSetting}`,
      );
      return false;
    }

    const t = desktopMessages(
      store?.getSettings().language ||
        resolveDesktopLanguage(app.getPreferredSystemLanguages()),
    );
    try {
      permissionPrompt = new Notification({
        id: 'limit-notification-permission',
        title: t.notificationRequestTitle,
        body: t.notificationRequestBody,
      });
      notificationPermissionPrompt = permissionPrompt;
    } catch (error) {
      console.error(
        '[notifications] permission request creation failed',
        error,
      );
      return false;
    }
    permissionPrompt.once('failed', (_event, error) => {
      permissionPromptFailed = true;
      console.error('[notifications] permission request failed', error);
    });
    try {
      permissionPrompt.show();
    } catch (error) {
      console.error('[notifications] permission request threw', error);
      return false;
    }

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (!isCurrentRequest() || permissionPromptFailed) return false;
      await delay(750);
      try {
        settings = await getMacOSNotificationSettings();
      } catch (error) {
        console.error('[notifications] authorization poll failed', error);
        return false;
      }
      if (!isCurrentRequest() || permissionPromptFailed) return false;
      if (canPresentMacOSNotification(settings)) return true;
      if (settings.authorizationStatus !== 'not-determined') {
        console.error(
          `[notifications] macOS authorization=${settings.authorizationStatus}, alert=${settings.alertSetting}`,
        );
        return false;
      }
    }
    console.error('[notifications] authorization request timed out');
    return false;
  })().finally(() => {
    permissionPrompt?.close();
    if (notificationPermissionPrompt === permissionPrompt)
      notificationPermissionPrompt = null;
    if (notificationAuthorizationPromise === authorizationPromise)
      notificationAuthorizationPromise = null;
  });
  notificationAuthorizationPromise = authorizationPromise;
  return authorizationPromise;
}

function showSystemNotification({
  title,
  body,
  context,
  id,
  onClick,
  isCurrent = () => true,
}) {
  if (!Notification.isSupported()) {
    console.error(`[notifications] ${context}: not supported`);
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    let notification;
    try {
      notification = new Notification({ title, body, id });
    } catch (error) {
      console.error(`[notifications] ${context}: creation failed`, error);
      resolve(false);
      return;
    }
    const notificationId = id || notification.id;
    const previousNotification = activeSystemNotifications.get(notificationId);
    if (previousNotification && previousNotification !== notification)
      previousNotification.close();
    activeSystemNotifications.set(notificationId, notification);
    while (activeSystemNotifications.size > 256) {
      const oldestId = activeSystemNotifications.keys().next().value;
      const oldestNotification = activeSystemNotifications.get(oldestId);
      activeSystemNotifications.delete(oldestId);
      oldestNotification?.close();
    }
    let settled = false;
    const finish = (delivered) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(delivered);
    };
    const timeout = setTimeout(() => {
      console.error(`[notifications] ${context}: delivery timed out`);
      if (activeSystemNotifications.get(notificationId) === notification)
        activeSystemNotifications.delete(notificationId);
      notification.close();
      finish(false);
    }, 4000);
    notification.on('click', onClick || showMainWindow);
    notification.once('close', () => {
      if (activeSystemNotifications.get(notificationId) === notification)
        activeSystemNotifications.delete(notificationId);
      finish(false);
    });
    notification.once('show', () => {
      if (!isCurrent()) {
        notification.close();
        finish(false);
        return;
      }
      finish(true);
    });
    notification.once('failed', (_event, error) => {
      if (activeSystemNotifications.get(notificationId) === notification)
        activeSystemNotifications.delete(notificationId);
      console.error(`[notifications] ${context}: delivery failed`, error);
      finish(false);
    });
    try {
      notification.show();
    } catch (error) {
      if (activeSystemNotifications.get(notificationId) === notification)
        activeSystemNotifications.delete(notificationId);
      console.error(`[notifications] ${context}: show threw`, error);
      finish(false);
    }
  });
}

function flushQueuedInAppAlerts() {
  if (
    !areLimitNotificationsEnabled() ||
    !limitNotificationRendererReady ||
    !mainWindow ||
    mainWindow.isDestroyed()
  ) {
    if (!areLimitNotificationsEnabled()) queuedInAppAlerts.clear();
    return;
  }
  for (const [key, payload] of queuedInAppAlerts) {
    try {
      mainWindow.webContents.send('limits:notification', payload);
      queuedInAppAlerts.delete(key);
      inAppAlertsShown.add(key);
    } catch (error) {
      console.error('[notifications] unable to flush in-app alert', error);
      return;
    }
  }
  while (inAppAlertsShown.size > 1024)
    inAppAlertsShown.delete(inAppAlertsShown.values().next().value);
}

function emitInAppLimitNotification(key, payload) {
  if (inAppAlertsShown.has(key)) return;
  if (
    !limitNotificationRendererReady ||
    !mainWindow ||
    mainWindow.isDestroyed()
  ) {
    queuedInAppAlerts.set(key, payload);
    while (queuedInAppAlerts.size > 256)
      queuedInAppAlerts.delete(queuedInAppAlerts.keys().next().value);
    return;
  }
  try {
    mainWindow.webContents.send('limits:notification', payload);
    inAppAlertsShown.add(key);
    while (inAppAlertsShown.size > 1024)
      inAppAlertsShown.delete(inAppAlertsShown.values().next().value);
  } catch (error) {
    console.error('[notifications] unable to show in-app alert', error);
    queuedInAppAlerts.set(key, payload);
  }
}

function buildLimitNotificationPayload(limit, kind, usedSeconds) {
  const usedMinutes = Math.floor(usedSeconds / 60);
  const isWarning = kind === 'warning';
  const t = desktopMessages(store?.getSettings().language);
  const targetName = limit.siteDomain || limit.appName;
  return {
    kind,
    appId: limit.appId,
    appName: targetName,
    title: isWarning ? t.warningTitle(targetName) : t.reachedTitle(targetName),
    message: isWarning
      ? t.warningMessage(Math.max(1, limit.dailyLimitMinutes - usedMinutes))
      : t.reachedMessage(usedMinutes, limit.dailyLimitMinutes),
  };
}

function getEligibleLimitNotification(limitId, kind, day, date = new Date()) {
  if (!store || localDay(date) !== day) return null;
  const limit = store.getLimit(limitId);
  if (!limit) return null;
  const usedSeconds = store.getTodayLimitUsage(limit, date);
  return isLimitNotificationDue(limit, kind, usedSeconds, day)
    ? { limit, usedSeconds }
    : null;
}

function pruneLimitNotificationCaches(day) {
  pruneDayScopedCache(notificationRetryAt, day, 1024);
  pruneDayScopedCache(inAppAlertsShown, day, 1024);
  pruneDayScopedCache(queuedInAppAlerts, day, 256);
  pruneDayScopedCache(deliveredAlerts, day, 1024);
}

function systemLimitNotificationId(limitId, kind, day) {
  return `limit-${day}-${kind}-${crypto
    .createHash('sha256')
    .update(limitId)
    .digest('base64url')
    .slice(0, 24)}`;
}

function getLimitNotificationRevision(limitId) {
  return limitNotificationRevisions.get(limitId) || 0;
}

function clearLimitNotificationState(limitId, day = localDay()) {
  limitNotificationRevisions.set(limitId, ++nextLimitNotificationRevision);
  for (const kind of ['warning', 'reached']) {
    const key = notificationKey(day, limitId, kind);
    notificationRetryAt.delete(key);
    inAppAlertsShown.delete(key);
    queuedInAppAlerts.delete(key);
    deliveredAlerts.delete(key);
    const notificationId = systemLimitNotificationId(limitId, kind, day);
    const notification = activeSystemNotifications.get(notificationId);
    if (notification) {
      activeSystemNotifications.delete(notificationId);
      notification.close();
    }
  }
}

async function notifyLimit(limitId, kind, day, revision) {
  const isCurrentAttempt = () =>
    revision === getLimitNotificationRevision(limitId) &&
    areLimitNotificationsEnabled() &&
    localDay() === day;
  if (!isCurrentAttempt()) return { delivered: false, shouldRetry: false };
  let eligible = getEligibleLimitNotification(limitId, kind, day);
  if (!eligible) return { delivered: false, shouldRetry: false };
  let payload = buildLimitNotificationPayload(
    eligible.limit,
    kind,
    eligible.usedSeconds,
  );
  const alertKey = notificationKey(day, limitId, kind);
  emitInAppLimitNotification(alertKey, payload);

  const authorized = await ensureSystemNotificationAuthorization({
    requestIfNeeded: true,
  });
  if (!authorized || !isCurrentAttempt()) {
    if (!authorized && isCurrentAttempt())
      void promptForMacOSNotificationSettings();
    return {
      delivered: false,
      shouldRetry: isCurrentAttempt(),
    };
  }
  eligible = getEligibleLimitNotification(limitId, kind, day);
  if (!eligible) return { delivered: false, shouldRetry: false };
  payload = buildLimitNotificationPayload(
    eligible.limit,
    kind,
    eligible.usedSeconds,
  );
  const delivered = await showSystemNotification({
    title: payload.title,
    body: payload.message,
    context: `limit ${limitId} (${kind})`,
    id: systemLimitNotificationId(limitId, kind, day),
    isCurrent: isCurrentAttempt,
  });
  return { delivered, shouldRetry: !delivered && isCurrentAttempt() };
}

async function attemptLimitNotification(limitId, kind, day) {
  pruneLimitNotificationCaches(day);
  const key = notificationKey(day, limitId, kind);
  if (
    pendingAlerts.has(key) ||
    deliveredAlerts.has(key) ||
    (notificationRetryAt.get(key) || 0) > Date.now()
  )
    return;
  pendingAlerts.add(key);
  const revision = getLimitNotificationRevision(limitId);
  try {
    const result = await notifyLimit(limitId, kind, day, revision);
    if (revision !== getLimitNotificationRevision(limitId)) {
      notificationRetryAt.delete(key);
      return;
    }
    if (result.delivered) {
      const date = new Date();
      if (!getEligibleLimitNotification(limitId, kind, day, date)) {
        notificationRetryAt.delete(key);
        return;
      }
      deliveredAlerts.add(key);
      notificationRetryAt.delete(key);
      try {
        store.markLimitNotification(limitId, kind, date);
      } catch (error) {
        console.error(
          '[notifications] delivered notification could not be persisted',
          error,
        );
        broadcastUpdate({ reason: 'storage-error' });
      }
    } else if (result.shouldRetry && areLimitNotificationsEnabled()) {
      notificationRetryAt.set(key, Date.now() + 5 * 60_000);
    } else {
      notificationRetryAt.delete(key);
    }
  } catch (error) {
    console.error('[notifications] limit notification attempt failed', error);
    if (areLimitNotificationsEnabled() && localDay() === day)
      notificationRetryAt.set(key, Date.now() + 5 * 60_000);
  } finally {
    pendingAlerts.delete(key);
  }
}

function checkLimit(sample) {
  if (!areLimitNotificationsEnabled()) return;
  const date = new Date();
  const day = localDay(date);
  pruneLimitNotificationCaches(day);
  const limits = store
    .getLimits()
    .filter(
      (limit) =>
        limit.appId === sample.id &&
        (!limit.siteDomain || limit.siteDomain === sample.site?.domain),
    );
  for (const limit of limits) {
    const usedSeconds = store.getTodayLimitUsage(limit, date);
    if (isLimitNotificationDue(limit, 'warning', usedSeconds, day))
      void attemptLimitNotification(limit.id, 'warning', day);
    if (isLimitNotificationDue(limit, 'reached', usedSeconds, day))
      void attemptLimitNotification(limit.id, 'reached', day);
  }
}

function validateRange(range = {}) {
  const input = range && typeof range === 'object' ? range : {};
  const today = localDay();
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const isValidDay = (value) => {
    if (!datePattern.test(value || '')) return false;
    const parsed = new Date(`${value}T12:00:00`);
    return Number.isFinite(parsed.getTime()) && localDay(parsed) === value;
  };
  let from = isValidDay(input.from) ? input.from : today;
  let to = isValidDay(input.to) ? input.to : today;
  if (to > today) to = today;
  if (from > today) from = today;
  if (from > to) [from, to] = [to, from];
  const fromDate = new Date(`${from}T12:00:00`);
  const toDate = new Date(`${to}T12:00:00`);
  if ((toDate - fromDate) / 86_400_000 > 365) {
    fromDate.setDate(toDate.getDate() - 365);
    from = localDay(fromDate);
  }
  return { from, to };
}

function handleIpc(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    const trustedFrame =
      mainWindow &&
      event.sender === mainWindow.webContents &&
      event.senderFrame === mainWindow.webContents.mainFrame &&
      event.senderFrame.url === mainWindow.webContents.getURL();
    if (!trustedFrame) throw new Error('Недозволений IPC sender');
    return handler(...args);
  });
}

function setBoundedCache(cache, key, value) {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > MAX_APP_ICON_CACHE_ENTRIES) {
    cache.delete(cache.keys().next().value);
  }
}

async function loadAppIcon(normalizedId, source, fingerprint) {
  try {
    const iconPath = await resolveApplicationIconPath({
      appId: normalizedId,
      appName: source.appName,
      allowAppIdPath: source.tracked,
      executablePath: source.executablePath,
      platform: process.platform,
      userHome: app.getPath('home'),
    });
    if (!iconPath) {
      setBoundedCache(appIconMissCache, normalizedId, {
        fingerprint,
        retryAt: Date.now() + 30_000,
      });
      return null;
    }
    let icon;
    if (process.platform === 'darwin') {
      let thumbnailPath = iconPath;
      try {
        thumbnailPath = await fs.promises.realpath(iconPath);
      } catch {
        // The resolved bundle path is still a valid fallback if realpath fails.
      }
      icon = await nativeImage.createThumbnailFromPath(thumbnailPath, {
        width: 128,
        height: 128,
      });
    } else {
      icon = await app.getFileIcon(iconPath, {
        size: fileIconSize(process.platform),
      });
    }
    if (icon.isEmpty()) {
      setBoundedCache(appIconMissCache, normalizedId, {
        fingerprint,
        retryAt: Date.now() + 30_000,
      });
      return null;
    }
    const dataUrl = icon.toDataURL();
    setBoundedCache(appIconCache, normalizedId, { fingerprint, dataUrl });
    appIconMissCache.delete(normalizedId);
    return dataUrl;
  } catch {
    setBoundedCache(appIconMissCache, normalizedId, {
      fingerprint,
      retryAt: Date.now() + 30_000,
    });
    return null;
  }
}

function registerIpc() {
  ipcMain.on('limits:renderer-ready', (event) => {
    const trustedFrame =
      mainWindow &&
      event.sender === mainWindow.webContents &&
      event.senderFrame === mainWindow.webContents.mainFrame &&
      event.senderFrame.url === mainWindow.webContents.getURL();
    if (!trustedFrame) return;
    limitNotificationRendererReady = true;
    flushQueuedInAppAlerts();
  });
  handleIpc('dashboard:get', (range) => {
    const { from, to } = validateRange(range);
    refreshNotificationPermissionSnapshot();
    return {
      ...store.getDashboard(from, to),
      tracker: tracker.getStatus(),
      platform: process.platform,
      isPackaged: app.isPackaged,
      notificationPermission: getNotificationPermissionSnapshot(),
    };
  });
  handleIpc('tracker:status', () => tracker.getStatus());
  handleIpc('app:icon', async (appId) => {
    const normalizedId =
      typeof appId === 'string' && appId.length <= 512 ? appId : '';
    const source = store.getAppIconSource(normalizedId);
    if (!source) return null;
    const fingerprint = `${source.tracked ? 'tracked' : 'limit'}\0${source.appName}\0${source.executablePath || ''}`;
    const cached = appIconCache.get(normalizedId);
    if (cached?.fingerprint === fingerprint) {
      setBoundedCache(appIconCache, normalizedId, cached);
      return cached.dataUrl;
    }
    const missed = appIconMissCache.get(normalizedId);
    if (missed?.fingerprint === fingerprint && missed.retryAt > Date.now())
      return null;
    const pending = appIconPending.get(normalizedId);
    if (pending?.fingerprint === fingerprint) return pending.promise;
    if (appIconPending.size >= MAX_PENDING_APP_ICONS) return null;
    const promise = loadAppIcon(normalizedId, source, fingerprint).finally(
      () => {
        if (appIconPending.get(normalizedId)?.promise === promise)
          appIconPending.delete(normalizedId);
      },
    );
    appIconPending.set(normalizedId, { fingerprint, promise });
    return promise;
  });
  handleIpc('tracker:set-enabled', (enabled) => {
    if (typeof enabled !== 'boolean')
      throw new Error('Некоректне значення трекінгу');
    const settings = store.updateSettings({
      trackingEnabled: enabled,
    });
    refreshTrayMenu();
    broadcastUpdate({ reason: 'settings' });
    return settings;
  });
  handleIpc('settings:update', (patch) => {
    const safePatch =
      patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {};
    const previousSettings = store.getSettings();
    const settings = store.updateSettings(safePatch);
    if (
      process.platform === 'darwin' &&
      safePatch.websiteTrackingEnabled === true &&
      !previousSettings.websiteTrackingEnabled
    ) {
      accessibilityPermission?.requestOnce();
    }
    if (
      typeof safePatch.launchAtLogin === 'boolean' &&
      app.isPackaged &&
      !isSignedDevelopment
    ) {
      app.setLoginItemSettings({ openAtLogin: safePatch.launchAtLogin });
    }
    if (
      typeof safePatch.notificationsEnabled === 'boolean' &&
      safePatch.notificationsEnabled !== previousSettings.notificationsEnabled
    ) {
      notificationRetryAt.clear();
      if (safePatch.notificationsEnabled) {
        notificationSettingsDialogShown = false;
        void ensureSystemNotificationAuthorization({
          requestIfNeeded: true,
        }).then((authorized) => {
          if (!authorized && areLimitNotificationsEnabled())
            void promptForMacOSNotificationSettings();
        });
      } else {
        notificationAuthorizationGeneration += 1;
        notificationAuthorizationPromise = null;
        notificationSettingsDialogPromise = null;
        queuedInAppAlerts.clear();
        inAppAlertsShown.clear();
        deliveredAlerts.clear();
        notificationPermissionPrompt?.close();
        notificationPermissionPrompt = null;
        for (const notification of activeSystemNotifications.values())
          notification.close();
        activeSystemNotifications.clear();
      }
    }
    refreshTrayMenu();
    broadcastUpdate({ reason: 'settings' });
    return settings;
  });
  handleIpc('limits:save', (limit) => {
    const saved = store.saveLimit(limit);
    clearLimitNotificationState(saved.id);
    if (saved.enabled && areLimitNotificationsEnabled()) {
      void ensureSystemNotificationAuthorization({
        requestIfNeeded: true,
      }).then((authorized) => {
        if (!authorized) void promptForMacOSNotificationSettings();
      });
    }
    broadcastUpdate({ reason: 'limit' });
    return saved;
  });
  handleIpc('limits:delete', (limitId) => {
    if (typeof limitId !== 'string' || !limitId || limitId.length > 1024)
      throw new Error('Некоректний ідентифікатор застосунку');
    store.deleteLimit(limitId);
    clearLimitNotificationState(limitId);
    broadcastUpdate({ reason: 'limit' });
    return true;
  });
  handleIpc('limits:pause-today', (limitId) => {
    if (typeof limitId !== 'string' || !limitId || limitId.length > 1024)
      throw new Error('Некоректний ідентифікатор застосунку');
    const limit = store.pauseLimitToday(limitId);
    clearLimitNotificationState(limitId);
    broadcastUpdate({ reason: 'limit' });
    return limit;
  });
  handleIpc('permissions:open', async (kind) => {
    if (
      kind !== undefined &&
      kind !== 'accessibility' &&
      kind !== 'automation' &&
      kind !== 'notifications'
    )
      throw new Error('Некоректний тип дозволу');
    if (process.platform === 'darwin') {
      if (kind === 'notifications') {
        await shell.openExternal(
          'x-apple.systempreferences:com.apple.Notifications-Settings.extension',
        );
        return true;
      }
      if (kind === 'accessibility') accessibilityPermission?.requestOnce();
      const section =
        kind === 'automation' ? 'Privacy_Automation' : 'Privacy_Accessibility';
      await shell.openExternal(
        `x-apple.systempreferences:com.apple.preference.security?${section}`,
      );
      return true;
    }
    if (process.platform === 'win32' && kind === 'notifications') {
      notificationPermissionCheckedAt = 0;
      await shell.openExternal('ms-settings:notifications');
      return true;
    }
    return false;
  });
}

if (hasSingleInstanceLock)
  app.whenReady().then(async () => {
    if (shouldTestSystemNotification) {
      let authorized = await ensureSystemNotificationAuthorization({
        requestIfNeeded: true,
      });
      if (!authorized && (await promptForMacOSNotificationSettings())) {
        authorized = await waitForMacOSNotificationAuthorization();
      }
      const delivered =
        authorized &&
        (await showSystemNotification({
          title: 'Limit — перевірка сповіщень',
          body: 'Системні сповіщення Limit працюють.',
          context: 'signed development self-test',
          id: `limit-system-notification-test-${notificationTestId || 'manual'}`,
          onClick: () => undefined,
        }));
      console.log(
        `[notifications] signed development self-test: authorization=${authorized ? 'authorized' : 'unavailable'}; notification=${delivered ? 'accepted' : 'failed'}`,
      );
      setTimeout(() => {
        isQuitting = true;
        app.exit(authorized && delivered ? 0 : 1);
      }, 5000);
      return;
    }

    configureSessionSecurity();
    store = new UsageStore(
      path.join(app.getPath('userData'), 'usage-data.sqlite3'),
      {
        defaultLanguage: resolveDesktopLanguage(
          app.getPreferredSystemLanguages(),
        ),
        legacyJsonPath: path.join(app.getPath('userData'), 'usage-data.json'),
      },
    );
    accessibilityPermission = createAccessibilityPermissionController({
      platform: process.platform,
      isTrustedAccessibilityClient: (prompt) =>
        systemPreferences.isTrustedAccessibilityClient(prompt),
    });
    tracker = new ActivityTracker({
      store,
      getSystemState: (threshold) => powerMonitor.getSystemIdleState(threshold),
      hasAccessibilityPermission: () => accessibilityPermission.isGranted(),
      ownProcessId: process.pid,
      intervalMs: 2000,
    });
    registerIpc();
    createWindow();
    createTray();
    tracker.on('sample', checkLimit);
    tracker.on('updated', () => {
      if (updateTimer) return;
      updateTimer = setTimeout(() => {
        updateTimer = null;
        broadcastUpdate({ reason: 'sample' });
      }, 3000);
    });
    tracker.start();
    if (areLimitNotificationsEnabled()) {
      setTimeout(() => {
        void ensureSystemNotificationAuthorization({ requestIfNeeded: true });
      }, 1000);
    }
    powerMonitor.on('suspend', () => {
      suspended = true;
      tracker.stop();
    });
    powerMonitor.on('lock-screen', () => {
      screenLocked = true;
      tracker.stop();
    });
    powerMonitor.on('resume', () => {
      suspended = false;
      if (!screenLocked) tracker.start();
    });
    powerMonitor.on('unlock-screen', () => {
      screenLocked = false;
      if (!suspended) tracker.start();
    });

    app.on('activate', showMainWindow);
  });

if (hasSingleInstanceLock) {
  app.on('second-instance', () => {
    if (mainWindow) showMainWindow();
  });
}

app.on('before-quit', () => {
  isQuitting = true;
  tracker?.stop();
  store?.close();
});

app.on('window-all-closed', () => {
  // Limit працює у фоні через tray, доки користувач явно не натисне «Вийти».
});
