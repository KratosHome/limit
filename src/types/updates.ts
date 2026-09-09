export interface AppUpdateState {
  status:
    | 'disabled'
    | 'idle'
    | 'checking'
    | 'available'
    | 'downloading'
    | 'downloaded'
    | 'installer-ready'
    | 'error';
  currentVersion: string;
  version?: string;
  percent?: number;
  releaseName?: string;
  releaseNotes?: string;
  releaseDate?: string;
  errorAction?: 'check' | 'download' | 'install';
}

export type AppUpdateAction = 'check' | 'download' | 'install' | 'open';

export function appUpdateAction(state: AppUpdateState): AppUpdateAction {
  if (state.status === 'installer-ready') return 'open';
  if (state.status === 'downloaded') return 'install';
  if (state.status === 'error' && state.errorAction) return state.errorAction;
  if (
    state.status === 'available' ||
    (state.status === 'error' && state.version)
  )
    return 'download';
  return 'check';
}
