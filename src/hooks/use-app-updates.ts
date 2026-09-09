import { useEffect, useRef, useState } from 'react';
import { limitApi } from '../api';
import type { AppUpdateAction, AppUpdateState } from '../types/updates';

const actions = {
  check: () => limitApi.checkForAppUpdates(),
  download: () => limitApi.downloadAppUpdate(),
  install: () => limitApi.installAppUpdate(),
  open: () => limitApi.openAppUpdateInstaller(),
};

export function useAppUpdates() {
  const [state, setState] = useState<AppUpdateState | null>(null);
  const [toast, setToast] = useState<AppUpdateState | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<AppUpdateAction | 'load' | null>(null);
  const inFlight = useRef(false);
  const announced = useRef(new Set<string>());

  useEffect(() => {
    let active = true;
    let receivedEvent = false;

    function receive(next: AppUpdateState) {
      if (!active) return;
      setState(next);
      setError(null);
      const key = `${next.status}:${next.version}`;
      if (
        next.version &&
        ['available', 'downloaded', 'installer-ready', 'error'].includes(
          next.status,
        )
      ) {
        if (next.status === 'error' || !announced.current.has(key)) {
          announced.current.add(key);
          setToast(next);
        }
      } else {
        setToast(null);
      }
    }

    const unsubscribe = limitApi.onAppUpdateState((next) => {
      receivedEvent = true;
      receive(next);
    });
    void limitApi.getAppUpdateState().then(
      (next) => {
        // A live event is newer than the snapshot requested at mount.
        if (!receivedEvent) receive(next);
      },
      () => {
        if (active && !receivedEvent) setError('load');
      },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  async function run(action: AppUpdateAction) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    function reportFailure() {
      setError(action);
      // Keep failures visible even when the download was started outside Settings.
      if (state?.version) setToast((current) => current ?? state);
    }
    try {
      if (!state) {
        const snapshot = await limitApi.getAppUpdateState();
        setState(snapshot);
        if (snapshot.status === 'disabled') return;
      }
      if (await actions[action]()) {
        if (action === 'open' || action === 'install') setToast(null);
      } else {
        reportFailure();
      }
    } catch {
      reportFailure();
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return {
    state,
    toast,
    pending,
    error,
    run,
    dismissToast: () => setToast(null),
  };
}

export type AppUpdates = ReturnType<typeof useAppUpdates>;
