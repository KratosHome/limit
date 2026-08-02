import { useEffect, useState } from 'react';
import { isElectron, limitApi } from '../api';
import { appInitials, appPalette } from '../lib/format';

const iconCache = new Map<string, string>();
const pendingIconRequests = new Map<string, Promise<string | null>>();
const iconRetryDelays = [31_000, 120_000] as const;

interface AppIconProps {
  id: string;
  name: string;
  size?: 'sm' | 'md' | 'lg';
}

export function AppIcon({ id, name, size = 'md' }: AppIconProps) {
  const [foreground, background] = appPalette(id);
  const [loadedIcon, setLoadedIcon] = useState<{
    id: string;
    url: string;
  } | null>(() => {
    const url = iconCache.get(id);
    return url ? { id, url } : null;
  });
  const iconUrl =
    iconCache.get(id) ?? (loadedIcon?.id === id ? loadedIcon.url : null);
  const classes =
    size === 'sm'
      ? 'h-8 w-8 rounded-[10px] text-[10px]'
      : size === 'lg'
        ? 'h-12 w-12 rounded-2xl text-sm'
        : 'h-10 w-10 rounded-xl text-xs';

  useEffect(() => {
    let active = true;
    let retryIndex = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const cached = iconCache.get(id);
    setLoadedIcon(cached ? { id, url: cached } : null);

    if (!isElectron || typeof limitApi.getAppIcon !== 'function' || cached) {
      return () => {
        active = false;
      };
    }

    function scheduleRetry() {
      const delay = iconRetryDelays[retryIndex];
      retryIndex += 1;
      if (!active || delay === undefined) return;
      retryTimer = setTimeout(loadIcon, delay);
    }

    function loadIcon() {
      const existing = iconCache.get(id);
      if (existing) {
        if (active) setLoadedIcon({ id, url: existing });
        return;
      }
      let request = pendingIconRequests.get(id);
      if (!request) {
        request = limitApi
          .getAppIcon(id)
          .finally(() => pendingIconRequests.delete(id));
        pendingIconRequests.set(id, request);
      }
      void request
        .then((value) => {
          if (!active) return;
          if (!value) {
            scheduleRetry();
            return;
          }
          iconCache.set(id, value);
          setLoadedIcon({ id, url: value });
        })
        .catch(() => scheduleRetry());
    }

    loadIcon();
    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [id]);

  function handleImageError() {
    iconCache.delete(id);
    setLoadedIcon(null);
  }

  return (
    <div
      className={`${classes} grid shrink-0 place-items-center overflow-hidden font-bold tracking-tight`}
      style={{ color: foreground, backgroundColor: background }}
      aria-hidden="true"
    >
      {iconUrl ? (
        <img
          src={iconUrl}
          alt=""
          draggable={false}
          onError={handleImageError}
          className="h-full w-full object-contain"
        />
      ) : (
        appInitials(name)
      )}
    </div>
  );
}
