const { contextBridge, ipcRenderer } = require('electron');

async function activityRequest(channel, ...args) {
  const result = await ipcRenderer.invoke(channel, ...args);
  if (!result.ok) throw new Error(result.error.code);
  return result.data;
}

contextBridge.exposeInMainWorld('limitApi', {
  getDashboard: (range) => ipcRenderer.invoke('dashboard:get', range),
  getStatus: () => ipcRenderer.invoke('tracker:status'),
  getActivityDays: (appId, range) =>
    activityRequest('activity:days', appId, range),
  updateActivity: (input) => activityRequest('activity:update', input),
  deleteActivity: (input) => activityRequest('activity:delete', input),
  openTrackingWidget: () => ipcRenderer.invoke('tracker:open-widget'),
  setTrackingEnabled: (enabled) =>
    ipcRenderer.invoke('tracker:set-enabled', enabled),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  saveLimit: (limit) => ipcRenderer.invoke('limits:save', limit),
  deleteLimit: (appId) => ipcRenderer.invoke('limits:delete', appId),
  pauseLimitToday: (appId) => ipcRenderer.invoke('limits:pause-today', appId),
  openPermissions: (kind) => ipcRenderer.invoke('permissions:open', kind),
  getAppIcon: (appId) => ipcRenderer.invoke('app:icon', appId),
  getAppUpdateState: () => ipcRenderer.invoke('updates:get-state'),
  checkForAppUpdates: () => ipcRenderer.invoke('updates:check'),
  downloadAppUpdate: () => ipcRenderer.invoke('updates:download'),
  installAppUpdate: () => ipcRenderer.invoke('updates:install'),
  openAppUpdateInstaller: () => ipcRenderer.invoke('updates:open-installer'),
  onAppUpdateState: (callback) => {
    if (typeof callback !== 'function') return () => undefined;
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('updates:state', listener);
    return () => ipcRenderer.removeListener('updates:state', listener);
  },
  onDataUpdated: (callback) => {
    if (typeof callback !== 'function') return () => undefined;
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('data:updated', listener);
    return () => ipcRenderer.removeListener('data:updated', listener);
  },
  onLimitNotification: (callback) => {
    if (typeof callback !== 'function') return () => undefined;
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('limits:notification', listener);
    ipcRenderer.send('limits:renderer-ready');
    return () => ipcRenderer.removeListener('limits:notification', listener);
  },
});
