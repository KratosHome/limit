const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('trackingWidgetApi', {
  getState: () => ipcRenderer.invoke('tracking-widget:get'),
  setTrackingEnabled: (enabled) =>
    ipcRenderer.invoke('tracking-widget:set-enabled', enabled),
  openMainWindow: () => ipcRenderer.invoke('tracking-widget:open-main'),
  close: () => ipcRenderer.invoke('tracking-widget:close'),
  onState: (callback) => {
    if (typeof callback !== 'function') return () => undefined;
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('tracking-widget:state', listener);
    return () => ipcRenderer.removeListener('tracking-widget:state', listener);
  },
});
