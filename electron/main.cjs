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
  Tray,
} = require('electron');
const { UsageStore, localDay } = require('./store.cjs');
const { ActivityTracker } = require('./tracker.cjs');

let mainWindow = null;
let tray = null;
let isQuitting = false;
let store = null;
let tracker = null;
let updateTimer = null;
let screenLocked = false;
let suspended = false;
const pendingAlerts = new Set();
const notificationRetryAt = new Map();

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

function registerIpc() {
  handleIpc('dashboard:get', (range) => {
    const { from, to } = validateRange(range);
    return { ...store.getDashboard(from, to), tracker: tracker.getStatus(), platform: process.platform };
  });
  handleIpc('tracker:status', () => tracker.getStatus());
  handleIpc('tracker:set-enabled', (enabled) => {
    const settings = store.updateSettings({ trackingEnabled: Boolean(enabled) });
    refreshTrayMenu();
    broadcastUpdate({ reason: 'settings' });
    return settings;
  });
  handleIpc('settings:update', (patch) => {
    const settings = store.updateSettings(patch || {});
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
  handleIpc('permissions:open', async () => {
    if (process.platform === 'darwin') {
      await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
      return true;
    }
    return false;
  });
}

if (hasSingleInstanceLock) app.whenReady().then(() => {
  store = new UsageStore(path.join(app.getPath('userData'), 'usage-data.json'));
  tracker = new ActivityTracker({
    store,
    getSystemState: (threshold) => powerMonitor.getSystemIdleState(threshold),
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
