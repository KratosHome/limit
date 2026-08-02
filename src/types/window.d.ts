import type { LimitApi } from './api';

declare global {
  interface Window {
    limitApi?: LimitApi;
  }
}

export {};
