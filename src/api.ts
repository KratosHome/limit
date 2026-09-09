import type { LimitApi } from './types/api';
import i18n from './i18n';

const runsInElectron = /\bElectron\//.test(window.navigator.userAgent);

function missingElectronApi(): Promise<never> {
  return Promise.reject(new Error(i18n.t('errors:desktopApiUnavailable')));
}

const unavailableElectronApi: LimitApi = {
  getDashboard: missingElectronApi,
  getStatus: missingElectronApi,
  getActivityDays: missingElectronApi,
  updateActivity: missingElectronApi,
  deleteActivity: missingElectronApi,
  openTrackingWidget: missingElectronApi,
  setTrackingEnabled: missingElectronApi,
  updateSettings: missingElectronApi,
  saveLimit: missingElectronApi,
  deleteLimit: missingElectronApi,
  pauseLimitToday: missingElectronApi,
  openPermissions: missingElectronApi,
  getAppIcon: missingElectronApi,
  getAppUpdateState: missingElectronApi,
  checkForAppUpdates: missingElectronApi,
  downloadAppUpdate: missingElectronApi,
  installAppUpdate: missingElectronApi,
  openAppUpdateInstaller: missingElectronApi,
  onAppUpdateState: () => () => undefined,
  onDataUpdated: () => () => undefined,
  onLimitNotification: () => () => undefined,
};

export const limitApi: LimitApi = window.limitApi ?? unavailableElectronApi;
export const isElectron = runsInElectron || Boolean(window.limitApi);
