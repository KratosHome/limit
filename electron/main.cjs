const fs = require('node:fs');
const path = require('node:path');
const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  powerMonitor,
  shell,
  systemPreferences,
  Tray,
} = require('electron');
const { createAccessibilityPermissionController } = require('./accessibility-permission.cjs');
const { fileIconSize, resolveApplicationIconPath } = require('./app-icon.cjs');
const { UsageStore, localDay } = require('./store.cjs');
const { ActivityTracker } = require('./tracker.cjs');

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
const appIconCache = new Map();
const appIconMissCache = new Map();
const appIconPending = new Map();
const MAX_APP_ICON_CACHE_ENTRIES = 256;
const MAX_PENDING_APP_ICONS = 128;

app.setPath('userData', path.join(app.getPath('appData'), app.isPackaged ? 'Limit' : 'Limit Development'));
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
    },
  });

  const rendererUrl = !app.isPackaged && process.env.ELECTRON_RENDERER_URL === 'http://127.0.0.1:5173'
    ? process.env.ELECTRON_RENDERER_URL
    : null;
  if (rendererUrl) {
    void mainWindow.loadURL(rendererUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow?.webContents.getURL()) event.preventDefault();
  });
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18"><rect x="1" y="1" width="16" height="16" rx="5" fill="#111827"/><path d="M9 4.2v5.2l3.2 1.8" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round"/><circle cx="9" cy="9" r="5.1" fill="none" stroke="white" stroke-width="1.2"/></svg>`;
  const icon = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
  if (process.platform === 'darwin') icon.setTemplateImage(true);
  tray = new Tray(icon.resize({ width: 18, height: 18 }));
  tray.setToolTip('Limit — трекер часу');
  refreshTrayMenu();
  tray.on('click', showMainWindow);
}

function refreshTrayMenu() {
  if (!tray || !store) return;
  const trackingEnabled = store.getSettings().trackingEnabled;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Відкрити Limit', click: showMainWindow },
      {
        label: trackingEnabled ? 'Призупинити трекінг' : 'Відновити трекінг',
        click: () => {
          store.updateSettings({ trackingEnabled: !trackingEnabled });
          broadcastUpdate();
          refreshTrayMenu();
        },
      },
      { type: 'separator' },
      { label: 'Вийти', click: () => { isQuitting = true; app.quit(); } },
    ]),
  );
}

function broadcastUpdate(payload = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('data:updated', payload);
}

function notifyLimit(limit, kind, usedSeconds) {
  const usedMinutes = Math.floor(usedSeconds / 60);
  const isWarning = kind === 'warning';
  const payload = {
    kind,
    appId: limit.appId,
    appName: limit.appName,
    title: isWarning ? `Наближається ліміт ${limit.appName}` : `Ліміт ${limit.appName} досягнуто`,
    message: isWarning
      ? `Залишилося ${Math.max(1, limit.dailyLimitMinutes - usedMinutes)} хв.`
      : `Сьогодні використано ${usedMinutes} хв. із ${limit.dailyLimitMinutes} хв.`,
  };

  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('limits:notification', payload);
  if (!Notification.isSupported()) return Promise.resolve(false);

  return new Promise((resolve) => {
    const notification = new Notification({ title: payload.title, body: payload.message });
    let settled = false;
    const finish = (delivered) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(delivered);
    };
    const timeout = setTimeout(() => finish(false), 4000);
    notification.on('click', showMainWindow);
    notification.once('show', () => finish(true));
    notification.once('failed', () => finish(false));
    try {
      notification.show();
    } catch {
      finish(false);
    }
  });
}

async function attemptLimitNotification(limit, kind, usedSeconds) {
  const key = `${localDay()}:${limit.appId}:${kind}`;
  if (pendingAlerts.has(key) || (notificationRetryAt.get(key) || 0) > Date.now()) return;
  pendingAlerts.add(key);
  try {
    const delivered = await notifyLimit(limit, kind, usedSeconds);
    if (delivered) {
      store.markLimitNotification(limit.appId, kind);
      notificationRetryAt.delete(key);
    } else {
      notificationRetryAt.set(key, Date.now() + 5 * 60_000);
    }
  } finally {
    pendingAlerts.delete(key);
  }
}

function checkLimit(sample) {
  const limit = store.getLimit(sample.id);
  if (!limit?.enabled || limit.pausedDate === localDay()) return;
  const usedSeconds = store.getTodayUsage(sample.id);
  const usedMinutes = usedSeconds / 60;
  const today = localDay();
  const warningAt = limit.dailyLimitMinutes - limit.warningMinutes;

  if (limit.warningMinutes > 0 && usedMinutes >= warningAt && usedMinutes < limit.dailyLimitMinutes && limit.lastWarningDate !== today) {
    void attemptLimitNotification(limit, 'warning', usedSeconds);
  }
  if (usedMinutes >= limit.dailyLimitMinutes && limit.lastReachedDate !== today) {
    void attemptLimitNotification(limit, 'reached', usedSeconds);
  }
}

function validateRange(range = {}) {
  const today = localDay();
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const isValidDay = (value) => {
    if (!datePattern.test(value || '')) return false;
    const parsed = new Date(`${value}T12:00:00`);
    return Number.isFinite(parsed.getTime()) && localDay(parsed) === value;
  };
  let from = isValidDay(range.from) ? range.from : today;
  let to = isValidDay(range.to) ? range.to : today;
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
    const trustedFrame = mainWindow
      && event.sender === mainWindow.webContents
      && event.senderFrame === mainWindow.webContents.mainFrame
      && event.senderFrame.url === mainWindow.webContents.getURL();
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
      setBoundedCache(appIconMissCache, normalizedId, { fingerprint, retryAt: Date.now() + 30_000 });
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
      icon = await nativeImage.createThumbnailFromPath(thumbnailPath, { width: 128, height: 128 });
    } else {
      icon = await app.getFileIcon(iconPath, {
        size: fileIconSize(process.platform),
      });
    }
    if (icon.isEmpty()) {
      setBoundedCache(appIconMissCache, normalizedId, { fingerprint, retryAt: Date.now() + 30_000 });
      return null;
    }
    const dataUrl = icon.toDataURL();
    setBoundedCache(appIconCache, normalizedId, { fingerprint, dataUrl });
    appIconMissCache.delete(normalizedId);
    return dataUrl;
  } catch {
    setBoundedCache(appIconMissCache, normalizedId, { fingerprint, retryAt: Date.now() + 30_000 });
    return null;
  }
}

function registerIpc() {
  handleIpc('dashboard:get', (range) => {
    const { from, to } = validateRange(range);
    return { ...store.getDashboard(from, to), tracker: tracker.getStatus(), platform: process.platform, isPackaged: app.isPackaged };
  });
  handleIpc('tracker:status', () => tracker.getStatus());
  handleIpc('app:icon', async (appId) => {
    const normalizedId = typeof appId === 'string' && appId.length <= 512 ? appId : '';
    const source = store.getAppIconSource(normalizedId);
    if (!source) return null;
    const fingerprint = `${source.tracked ? 'tracked' : 'limit'}\0${source.appName}\0${source.executablePath || ''}`;
    const cached = appIconCache.get(normalizedId);
    if (cached?.fingerprint === fingerprint) {
      setBoundedCache(appIconCache, normalizedId, cached);
      return cached.dataUrl;
    }
    const missed = appIconMissCache.get(normalizedId);
    if (missed?.fingerprint === fingerprint && missed.retryAt > Date.now()) return null;
    const pending = appIconPending.get(normalizedId);
    if (pending?.fingerprint === fingerprint) return pending.promise;
    if (appIconPending.size >= MAX_PENDING_APP_ICONS) return null;
    const promise = loadAppIcon(normalizedId, source, fingerprint)
      .finally(() => {
        if (appIconPending.get(normalizedId)?.promise === promise) appIconPending.delete(normalizedId);
      });
    appIconPending.set(normalizedId, { fingerprint, promise });
    return promise;
  });
  handleIpc('tracker:set-enabled', (enabled) => {
    const settings = store.updateSettings({ trackingEnabled: Boolean(enabled) });
    refreshTrayMenu();
    broadcastUpdate({ reason: 'settings' });
    return settings;
  });
  handleIpc('settings:update', (patch) => {
    const previousSettings = store.getSettings();
    const settings = store.updateSettings(patch || {});
    if (process.platform === 'darwin' && patch?.websiteTrackingEnabled === true && !previousSettings.websiteTrackingEnabled) {
      accessibilityPermission?.requestOnce();
    }
    if (typeof patch?.launchAtLogin === 'boolean' && app.isPackaged) {
      app.setLoginItemSettings({ openAtLogin: patch.launchAtLogin });
    }
    refreshTrayMenu();
    broadcastUpdate({ reason: 'settings' });
    return settings;
  });
  handleIpc('limits:save', (limit) => {
    const saved = store.saveLimit(limit);
    broadcastUpdate({ reason: 'limit' });
    return saved;
  });
  handleIpc('limits:delete', (appId) => {
    store.deleteLimit(String(appId || ''));
    broadcastUpdate({ reason: 'limit' });
    return true;
  });
  handleIpc('limits:pause-today', (appId) => {
    const limit = store.pauseLimitToday(String(appId || ''));
    broadcastUpdate({ reason: 'limit' });
    return limit;
  });
  handleIpc('permissions:open', async (kind) => {
    if (process.platform === 'darwin') {
      if (kind === 'accessibility') accessibilityPermission?.requestOnce();
      const section = kind === 'automation' ? 'Privacy_Automation' : 'Privacy_Accessibility';
      await shell.openExternal(`x-apple.systempreferences:com.apple.preference.security?${section}`);
      return true;
    }
    return false;
  });
}

if (hasSingleInstanceLock) app.whenReady().then(() => {
  store = new UsageStore(path.join(app.getPath('userData'), 'usage-data.json'));
  accessibilityPermission = createAccessibilityPermissionController({
    platform: process.platform,
    isTrustedAccessibilityClient: (prompt) => systemPreferences.isTrustedAccessibilityClient(prompt),
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
  powerMonitor.on('suspend', () => { suspended = true; tracker.stop(); });
  powerMonitor.on('lock-screen', () => { screenLocked = true; tracker.stop(); });
  powerMonitor.on('resume', () => { suspended = false; if (!screenLocked) tracker.start(); });
  powerMonitor.on('unlock-screen', () => { screenLocked = false; if (!suspended) tracker.start(); });

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
