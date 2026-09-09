const ERROR_CODES = Object.freeze({
  DASHBOARD_LOAD: 'dashboardLoad',
  DESKTOP_API_UNAVAILABLE: 'desktopApiUnavailable',
  INVALID_APP_DATA: 'invalidAppData',
  INVALID_APP_ID: 'invalidAppId',
  INVALID_ACTIVITY: 'invalidActivity',
  ACTIVITY_CONFLICT: 'activityConflict',
  ACTIVITY_NOT_FOUND: 'activityNotFound',
  INVALID_LIMIT: 'invalidLimit',
  INVALID_PERMISSION: 'invalidPermission',
  INVALID_TRACKING: 'invalidTracking',
  IPC_SENDER: 'ipcSender',
  SAVE_LIMIT: 'saveLimit',
  SELECT_APP: 'selectApp',
  SETTINGS_SAVE: 'settingsSave',
  STORAGE_IMPORT: 'storageImport',
  STORAGE_MAINTENANCE: 'storageMaintenance',
  STORAGE_READ: 'storageRead',
  STORAGE_SAVE: 'storageSave',
  TRACKING_PERMISSION: 'trackingPermission',
  TRACKING_UNAVAILABLE: 'trackingUnavailable',
  TRACKING_UNSUPPORTED: 'trackingUnsupported',
  UNKNOWN: 'unknown',
});

const knownErrorCodes = new Set(Object.values(ERROR_CODES));

class AppError extends Error {
  constructor(code, message = code, options) {
    super(message, options);
    this.name = 'AppError';
    this.code = knownErrorCodes.has(code) ? code : ERROR_CODES.UNKNOWN;
  }
}

function errorCodeFrom(error, fallback = ERROR_CODES.UNKNOWN) {
  return error && knownErrorCodes.has(error.code)
    ? error.code
    : knownErrorCodes.has(fallback)
      ? fallback
      : ERROR_CODES.UNKNOWN;
}

function ok(data) {
  return { ok: true, data };
}

function fail(error, fallback) {
  return { ok: false, error: { code: errorCodeFrom(error, fallback) } };
}

module.exports = {
  AppError,
  ERROR_CODES,
  errorCodeFrom,
  fail,
  knownErrorCodes,
  ok,
};
