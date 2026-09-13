const path = require('node:path');

function createTrackingWidget({
  BrowserWindow,
  ipcMain,
  screen,
  getAnchorBounds = () => null,
  getState,
  setTrackingEnabled,
  showMainWindow,
  rendererUrl = null,
  platform = process.platform,
}) {
  let window = null;
  let disposed = false;
  let ready = false;
  let requestedVisible = false;
  let blurTimer = null;
  let lastAnchor = null;
  const menuBar = platform === 'darwin';
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
    if (menuBar) hide();
    showMainWindow();
    return true;
  });
  handle(channels[3], () => {
    if (menuBar) hide();
    else window.close();
    return true;
  });

  function anchorBounds() {
    const anchor = getAnchorBounds();
    const valid =
      anchor &&
      ['x', 'y', 'width', 'height'].every((key) =>
        Number.isFinite(anchor[key]),
      ) &&
      anchor.width > 0 &&
      anchor.height > 0;
    if (valid && isOnDisplay(anchor)) lastAnchor = { ...anchor };
    // A macOS process/Space transition can briefly report a tray at (0,
    // screenHeight). Keep the last real anchor instead of jumping to a corner.
    return lastAnchor && isOnDisplay(lastAnchor) ? lastAnchor : null;
  }

  function isOnDisplay(rectangle) {
    const displayBounds = screen.getDisplayMatching(rectangle).bounds;
    return (
      !displayBounds ||
      (rectangle.x < displayBounds.x + displayBounds.width &&
        rectangle.x + rectangle.width > displayBounds.x &&
        rectangle.y < displayBounds.y + displayBounds.height &&
        rectangle.y + rectangle.height > displayBounds.y)
    );
  }

  function bounds() {
    const anchor = menuBar ? anchorBounds() : null;
    const { workArea } = anchor
      ? screen.getDisplayMatching(anchor)
      : screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    if (!menuBar) {
      return {
        width: 340,
        height: 180,
        x: Math.max(workArea.x, workArea.x + workArea.width - 360),
        y: Math.max(workArea.y, workArea.y + workArea.height - 200),
      };
    }
    const width = Math.min(340, Math.max(1, workArea.width - 16));
    const height = Math.min(180, Math.max(1, workArea.height - 14));
    const x = anchor
      ? anchor.x + anchor.width / 2 - width / 2
      : workArea.x + workArea.width - width - 20;
    const y = anchor ? anchor.y + anchor.height + 6 : workArea.y + 6;
    return {
      width,
      height,
      x: Math.round(
        Math.max(
          workArea.x + 8,
          Math.min(x, workArea.x + workArea.width - width - 8),
        ),
      ),
      y: Math.round(
        Math.max(
          workArea.y + 6,
          Math.min(y, workArea.y + workArea.height - height - 8),
        ),
      ),
    };
  }

  function clearBlurTimer() {
    if (blurTimer) clearTimeout(blurTimer);
    blurTimer = null;
  }

  function present() {
    if (!ready || !requestedVisible || !window || window.isDestroyed()) return;
    clearBlurTimer();
    if (menuBar) {
      window.setBounds(bounds(), false);
      window.show();
    } else window.showInactive();
  }

  function hide() {
    requestedVisible = false;
    clearBlurTimer();
    if (disposed || !window || window.isDestroyed()) return false;
    window.hide();
    return true;
  }

  function toggle() {
    if (requestedVisible) return hide();
    return show();
  }

  function show() {
    if (disposed) return false;
    requestedVisible = true;
    if (window && !window.isDestroyed()) {
      refresh();
      present();
      return true;
    }
    ready = false;
    const widget = new BrowserWindow({
      ...bounds(),
      ...(menuBar ? { type: 'panel', movable: false } : {}),
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
    if (menuBar) {
      widget.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      widget.on('focus', clearBlurTimer);
      widget.on('blur', () => {
        if (window !== widget || widget.isDestroyed() || !requestedVisible)
          return;
        const anchor = anchorBounds();
        const cursor = screen.getCursorScreenPoint();
        const overTray =
          anchor &&
          cursor.x >= anchor.x &&
          cursor.x <= anchor.x + anchor.width &&
          cursor.y >= anchor.y &&
          cursor.y <= anchor.y + anchor.height;
        if (!overTray) {
          hide();
          return;
        }
        // macOS can blur the panel before delivering its tray click. Let that
        // click toggle it closed instead of immediately reopening it.
        clearBlurTimer();
        blurTimer = setTimeout(() => {
          blurTimer = null;
          if (window === widget && !widget.isDestroyed() && !widget.isFocused())
            hide();
        }, 200);
      });
    }
    widget.once('ready-to-show', () => {
      if (disposed || widget.isDestroyed() || window !== widget) return;
      ready = true;
      present();
    });
    widget.on('closed', () => {
      if (window === widget) {
        clearBlurTimer();
        window = null;
        ready = false;
        requestedVisible = false;
      }
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
    requestedVisible = false;
    clearBlurTimer();
    for (const channel of channels) ipcMain.removeHandler(channel);
    if (window && !window.isDestroyed()) window.destroy();
    window = null;
  }

  return { show, hide, toggle, refresh, dispose };
}

module.exports = { createTrackingWidget };
