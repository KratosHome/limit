import type { AppLimit, LimitInput } from '../types/limits';
import type { DateRange } from '../types/navigation';
import type { Settings } from '../types/settings';
import type { AppUsage, DashboardData, KnownApp } from '../types/usage';
import type { LimitApi } from '../types/api';
import { toDayKey } from '../lib/format';

const baseApps: AppUsage[] = [
  {
    id: 'company.thebrowser.Browser',
    name: 'Arc',
    category: 'Браузер',
    seconds: 9_480,
    launches: 14,
    lastTitle: '',
    lastSeenAt: new Date().toISOString(),
    limitMinutes: 180,
    limitEnabled: true,
    isBrowser: true,
    sites: [
      { domain: 'chatgpt.com', seconds: 3_180 },
      { domain: 'github.com', seconds: 2_460 },
      { domain: 'developer.mozilla.org', seconds: 1_680 },
      { domain: 'linear.app', seconds: 1_260 },
      { domain: 'google.com', seconds: 900 },
    ],
  },
  {
    id: 'com.tinyspeck.slackmacgap',
    name: 'Slack',
    category: 'Спілкування',
    seconds: 5_220,
    launches: 9,
    lastTitle: '',
    lastSeenAt: new Date().toISOString(),
    limitMinutes: null,
    limitEnabled: false,
    isBrowser: false,
    sites: [],
  },
  {
    id: 'com.microsoft.VSCode',
    name: 'Visual Studio Code',
    category: 'Розробка',
    seconds: 4_320,
    launches: 5,
    lastTitle: '',
    lastSeenAt: new Date().toISOString(),
    limitMinutes: 120,
    limitEnabled: true,
    isBrowser: false,
    sites: [],
  },
  {
    id: 'ru.keepcoder.Telegram',
    name: 'Telegram',
    category: 'Спілкування',
    seconds: 2_460,
    launches: 18,
    lastTitle: '',
    lastSeenAt: new Date().toISOString(),
    limitMinutes: 60,
    limitEnabled: true,
    isBrowser: false,
    sites: [],
  },
  {
    id: 'com.spotify.client',
    name: 'Spotify',
    category: 'Розваги',
    seconds: 1_680,
    launches: 2,
    lastTitle: '',
    lastSeenAt: new Date().toISOString(),
    limitMinutes: null,
    limitEnabled: false,
    isBrowser: false,
    sites: [],
  },
];

let mockLimits: AppLimit[] = [
  {
    appId: 'company.thebrowser.Browser',
    appName: 'Arc',
    dailyLimitMinutes: 180,
    warningMinutes: 10,
    enabled: true,
    lastWarningDate: null,
    lastReachedDate: null,
    pausedDate: null,
  },
  {
    appId: 'com.microsoft.VSCode',
    appName: 'Visual Studio Code',
    dailyLimitMinutes: 120,
    warningMinutes: 10,
    enabled: true,
    lastWarningDate: null,
    lastReachedDate: null,
    pausedDate: null,
  },
  {
    appId: 'ru.keepcoder.Telegram',
    appName: 'Telegram',
    dailyLimitMinutes: 60,
    warningMinutes: 10,
    enabled: true,
    lastWarningDate: null,
    lastReachedDate: null,
    pausedDate: null,
  },
];

let mockSettings: Settings = {
  trackingEnabled: true,
  websiteTrackingEnabled: true,
  launchAtLogin: false,
  idleThresholdSeconds: 60,
};

function makeTimeline(range: DateRange) {
  if (range.from === range.to) {
    return Array.from({ length: 24 }, (_, hour) => {
      const seconds =
        hour < 8 || hour > 21
          ? 0
          : Math.round(
              Math.max(0, 500 + Math.sin(hour * 1.7) * 420 + (hour % 3) * 230),
            );
      const weights = baseApps.map(
        (app, index) => app.seconds * (0.7 + ((hour + index * 2) % 5) * 0.12),
      );
      const weightTotal = weights.reduce((sum, value) => sum + value, 0);
      let allocated = 0;
      const apps = seconds
        ? baseApps
            .map((app, index) => {
              const appSeconds =
                index === baseApps.length - 1
                  ? seconds - allocated
                  : Math.round((seconds * weights[index]) / weightTotal);
              allocated += appSeconds;
              return { id: app.id, name: app.name, seconds: appSeconds };
            })
            .filter((app) => app.seconds > 0)
            .sort((a, b) => b.seconds - a.seconds)
        : [];
      return { key: String(hour), seconds, apps };
    });
  }
  const points = [];
  const cursor = new Date(`${range.from}T12:00:00`);
  const end = new Date(`${range.to}T12:00:00`);
  while (cursor <= end && points.length < 31) {
    points.push({
      key: toDayKey(cursor),
      seconds: 13_000 + Math.max(0, Math.sin(cursor.getDate()) * 4_500),
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return points;
}

function dashboard(range: DateRange): DashboardData {
  const multiplier =
    range.from === range.to
      ? 1
      : Math.min(9, makeTimeline(range).length * 0.83);
  const apps = baseApps.map((app) => {
    const limit = mockLimits.find((item) => item.appId === app.id);
    return {
      ...app,
      seconds: Math.round(app.seconds * multiplier),
      sites: app.sites.map((site) => ({
        ...site,
        seconds: Math.round(site.seconds * multiplier),
      })),
      launches: Math.round(app.launches * Math.max(1, multiplier * 0.7)),
      limitMinutes: limit?.dailyLimitMinutes ?? null,
      limitEnabled: limit?.enabled ?? false,
    };
  });
  const knownApps: KnownApp[] = apps.map(
    ({ id, name, category, lastSeenAt }) => ({
      id,
      name,
      category,
      lastSeenAt,
    }),
  );
  return {
    apps,
    totalSeconds: apps.reduce((sum, app) => sum + app.seconds, 0),
    previousTotalSeconds: Math.round(
      apps.reduce((sum, app) => sum + app.seconds, 0) * 1.12,
    ),
    timeline: makeTimeline(range),
    days: range.from === range.to ? [range.from] : [range.from, range.to],
    limits: [...mockLimits],
    knownApps,
    settings: { ...mockSettings },
    tracker: {
      currentApp: {
        id: 'com.microsoft.VSCode',
        name: 'Visual Studio Code',
        title: '',
      },
      permissionState: 'granted',
      lastError: null,
      websitePermissionState: 'granted',
      lastWebsiteError: null,
      running: true,
    },
    storage: { error: null, recoveryCreated: false },
    platform: 'browser-demo',
    isPackaged: true,
    today: toDayKey(new Date()),
    todayUsage: Object.fromEntries(
      baseApps.map((app) => [app.id, app.seconds]),
    ),
    updatedAt: new Date().toISOString(),
  };
}

export const demoApi: LimitApi = {
  async getDashboard(range) {
    return dashboard(range);
  },
  async getStatus() {
    return dashboard({ from: toDayKey(new Date()), to: toDayKey(new Date()) })
      .tracker;
  },
  async setTrackingEnabled(enabled) {
    mockSettings = { ...mockSettings, trackingEnabled: enabled };
    return { ...mockSettings };
  },
  async updateSettings(patch) {
    mockSettings = { ...mockSettings, ...patch };
    return { ...mockSettings };
  },
  async saveLimit(input: LimitInput) {
    const previous = mockLimits.find((limit) => limit.appId === input.appId);
    const saved: AppLimit = {
      ...previous,
      ...input,
      lastWarningDate: previous?.lastWarningDate ?? null,
      lastReachedDate: previous?.lastReachedDate ?? null,
      pausedDate: null,
    };
    mockLimits = [
      ...mockLimits.filter((limit) => limit.appId !== saved.appId),
      saved,
    ];
    return saved;
  },
  async deleteLimit(appId) {
    mockLimits = mockLimits.filter((limit) => limit.appId !== appId);
    return true;
  },
  async pauseLimitToday(appId) {
    const limit = mockLimits.find((item) => item.appId === appId);
    if (!limit) return null;
    limit.pausedDate = toDayKey(new Date());
    return { ...limit };
  },
  async openPermissions() {
    return false;
  },
  async getAppIcon() {
    return null;
  },
  onDataUpdated() {
    return () => undefined;
  },
  onLimitNotification() {
    return () => undefined;
  },
};
