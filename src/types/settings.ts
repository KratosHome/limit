export type PermissionKind = 'accessibility' | 'automation';

export interface Settings {
  trackingEnabled: boolean;
  websiteTrackingEnabled: boolean;
  launchAtLogin: boolean;
  idleThresholdSeconds: number;
}
