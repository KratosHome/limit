import { demoApi } from './data/demo';
import type { LimitApi } from './types/api';

export const limitApi: LimitApi = window.limitApi ?? demoApi;
export const isElectron = Boolean(window.limitApi);
