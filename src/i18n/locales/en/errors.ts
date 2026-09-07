export default {
  dashboardLoad: 'Could not load statistics',
  selectApp: 'Choose an app',
  invalidDuration: 'Enter a total from 1 minute to {{max}} for this period',
  saveLimit: 'Could not save the limit',
  desktopApiUnavailable:
    'The desktop API is unavailable. Restart Limit or check the preload script.',
  ipcSender: 'Unauthorized IPC sender',
  invalidTracking: 'Invalid tracking value',
  invalidAppId: 'Invalid app identifier',
  invalidPermission: 'Invalid permission type',
  invalidAppData: 'Invalid app data',
  invalidLimit: 'Choose a valid total for the selected limit period',
  storageRead:
    'Could not read the local database. A recovery backup was created.',
  storageImport:
    'Could not import the old JSON history. A recovery backup was created.',
  storageSave: 'Could not save local history.',
  storageMaintenance: 'Could not finish saving history.',
  unknown: 'An unknown error occurred',
  dashboard: {
    loading: 'Loading your day...',
    title: 'Could not open statistics',
    unsupported: 'Tracking is not supported in this environment',
    unavailable: 'Tracking is temporarily unavailable',
    retryLabel: 'Check again',
  },
} as const;
