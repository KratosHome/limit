import type { LimitApi } from './types/api';

const runsInElectron = /\bElectron\//.test(window.navigator.userAgent);

function missingElectronApi(): Promise<never> {
  return Promise.reject(
    new Error(
      'Desktop API недоступний. Перезапустіть Limit або перевірте preload script.',
    ),
  );
}

const unavailableElectronApi: LimitApi = {
  getDashboard: missingElectronApi,
  getStatus: missingElectronApi,
  setTrackingEnabled: missingElectronApi,
  updateSettings: missingElectronApi,
  saveLimit: missingElectronApi,
  deleteLimit: missingElectronApi,
  pauseLimitToday: missingElectronApi,
  openPermissions: missingElectronApi,
  getAppIcon: missingElectronApi,
  onDataUpdated: () => () => undefined,
  onLimitNotification: () => () => undefined,
};

export const limitApi: LimitApi = window.limitApi ?? unavailableElectronApi;
export const isElectron = runsInElectron || Boolean(window.limitApi);
