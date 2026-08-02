export interface TrackerStatus {
  currentApp: {
    id: string;
    name: string;
    title: string;
    site?: { domain: string } | null;
  } | null;
  permissionState: 'unknown' | 'granted' | 'denied' | 'unsupported' | 'error';
  lastError: string | null;
  websitePermissionState:
    'disabled' | 'pending' | 'granted' | 'unavailable' | 'denied' | 'error';
  lastWebsiteError: string | null;
  running: boolean;
}
