import { useCallback, useEffect, useState } from 'react';
import { limitApi } from '../api';
import type { SupportConfig } from '../types/support';

export function useSupportConfig() {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    attempt: number;
    config: SupportConfig | null;
  } | null>(null);
  useEffect(() => {
    let active = true;
    void limitApi.getSupportConfig().then(
      (config) => {
        if (active) setResult({ attempt, config });
      },
      () => {
        if (active) setResult({ attempt, config: null });
      },
    );
    return () => {
      active = false;
    };
  }, [attempt]);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return {
    config: result?.config ?? null,
    loading: result?.attempt !== attempt,
    retry,
  };
}
