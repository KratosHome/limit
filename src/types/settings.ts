export type PermissionKind = 'accessibility' | 'automation' | 'notifications';

export type NotificationAuthorizationStatus =
  | 'unknown'
  | 'unsupported'
  | 'not-determined'
  | 'denied'
  | 'suppressed'
  | 'authorized'
  | 'provisional';

export interface NotificationPermission {
  authorizationStatus: NotificationAuthorizationStatus;
  canPresent: boolean;
}

export interface Settings {
  language: 'uk' | 'en';
  trackingEnabled: boolean;
  websiteTrackingEnabled: boolean;
  notificationsEnabled: boolean;
  launchAtLogin: boolean;
  idleThresholdSeconds: number;
}
