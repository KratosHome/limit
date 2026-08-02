const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('limitApi', {
  getDashboard: (range) => ipcRenderer.invoke('dashboard:get', range),
  getStatus: () => ipcRenderer.invoke('tracker:status'),
  setTrackingEnabled: (enabled) => ipcRenderer.invoke('tracker:set-enabled', enabled),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  saveLimit: (limit) => ipcRenderer.invoke('limits:save', limit),
  deleteLimit: (appId) => ipcRenderer.invoke('limits:delete', appId),
  pauseLimitToday: (appId) => ipcRenderer.invoke('limits:pause-today', appId),
  openPermissions: (kind) => ipcRenderer.invoke('permissions:open', kind),
  getAppIcon: (appId) => ipcRenderer.invoke('app:icon', appId),
  onDataUpdated: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('data:updated', listener);
    return () => ipcRenderer.removeListener('data:updated', listener);
  },
  onLimitNotification: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('limits:notification', listener);
    return () => ipcRenderer.removeListener('limits:notification', listener);
  },
});
