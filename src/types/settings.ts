export type PermissionKind = 'accessibility' | 'automation';

export interface Settings {
  language: 'uk' | 'en';
  trackingEnabled: boolean;
  websiteTrackingEnabled: boolean;
  launchAtLogin: boolean;
  idleThresholdSeconds: number;
}
