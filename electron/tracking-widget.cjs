const path = require('node:path');

function createTrackingWidget({
  BrowserWindow,
  ipcMain,
  screen,
  getState,
  setTrackingEnabled,
  showMainWindow,
  rendererUrl = null,
  platform = process.platform,
}) {
  let window = null;
  let disposed = false;
  const channels = [
    'tracking-widget:get',
    'tracking-widget:set-enabled',
    'tracking-widget:open-main',
    'tracking-widget:close',
  ];

  function handle(channel, callback) {
    ipcMain.handle(channel, (event, ...args) => {
      if (
        !window ||
        window.isDestroyed() ||
        event.sender !== window.webContents ||
        event.senderFrame !== window.webContents.mainFrame ||
        event.senderFrame.url !== window.webContents.getURL()
      )
        throw new Error('Недозволений IPC sender');
      return callback(...args);
    });
  }

  handle(channels[0], getState);
  handle(channels[1], (enabled) => {
    if (typeof enabled !== 'boolean')
      throw new Error('Некоректне значення трекінгу');
    setTrackingEnabled(enabled);
    return getState();
  });
  handle(channels[2], () => {
    showMainWindow();
    return true;
  });
  handle(channels[3], () => {
    window.close();
    return true;
  });

  function show() {
    if (disposed) return false;
    if (window && !window.isDestroyed()) {
      window.showInactive();
      return true;
    }
    const { workArea } = screen.getDisplayNearestPoint(
      screen.getCursorScreenPoint(),
    );
    const width = 340;
    const height = 180;
    const widget = new BrowserWindow({
      width,
      height,
      x: Math.max(workArea.x, workArea.x + workArea.width - width - 20),
      y: Math.max(workArea.y, workArea.y + workArea.height - height - 20),
      frame: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      title: 'Limit',
      backgroundColor: '#171d29',
      webPreferences: {
        preload: path.join(__dirname, 'tracking-widget-preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webviewTag: false,
        allowRunningInsecureContent: false,
      },
    });
    window = widget;
    if (platform === 'darwin')
      widget.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    widget.once('ready-to-show', () => {
      if (!disposed && !widget.isDestroyed()) widget.showInactive();
    });
    widget.on('closed', () => {
      if (window === widget) window = null;
    });
    widget.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    widget.webContents.on('will-navigate', (event) => event.preventDefault());
    const loading = rendererUrl
      ? widget.loadURL(`${rendererUrl}/?widget=tracking`)
      : widget.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), {
          query: { widget: 'tracking' },
        });
    void loading.catch(() => {
      if (!widget.isDestroyed()) widget.close();
    });
    return true;
  }

  function refresh() {
    if (window && !window.isDestroyed())
      window.webContents.send('tracking-widget:state', getState());
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const channel of channels) ipcMain.removeHandler(channel);
    if (window && !window.isDestroyed()) window.destroy();
    window = null;
  }

  return { show, refresh, dispose };
}

module.exports = { createTrackingWidget };
