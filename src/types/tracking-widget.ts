import type { AppLanguage } from '../i18n';
import type { TrackerStatus } from './tracker';

export interface TrackingWidgetState {
  trackingEnabled: boolean;
  activityState: TrackerStatus['activityState'];
  pauseStartedAt: number | null;
  currentApp: string | null;
  language: AppLanguage;
}

export interface TrackingWidgetApi {
  getState(): Promise<TrackingWidgetState>;
  setTrackingEnabled(enabled: boolean): Promise<TrackingWidgetState>;
  openMainWindow(): Promise<boolean>;
  close(): Promise<boolean>;
  onState(callback: (state: TrackingWidgetState) => void): () => void;
}
