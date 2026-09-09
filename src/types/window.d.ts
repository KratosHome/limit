import type { LimitApi } from './api';
import type { TrackingWidgetApi } from './tracking-widget';

declare global {
  interface Window {
    limitApi?: LimitApi;
    trackingWidgetApi?: TrackingWidgetApi;
  }
}

export {};
