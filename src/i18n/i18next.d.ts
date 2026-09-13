import type activity from './locales/en/activity';
import type common from './locales/en/common';
import type components from './locales/en/components';
import type errors from './locales/en/errors';
import type limits from './locales/en/limits';
import type modals from './locales/en/modals';
import type overview from './locales/en/overview';
import type settings from './locales/en/settings';
import type tasks from './locales/en/tasks';
import type tasksPlanning from './locales/en/tasks-planning';
import type tasksStats from './locales/en/tasks-stats';
import type tasksDay from './locales/en/tasks-day';
import type health from './locales/en/health';
import type support from './locales/en/support';

type CommonResources = Omit<typeof common, 'categories'> & {
  categories: typeof common.categories & Record<string, string>;
};

type ErrorResources = typeof errors &
  Record<string, string | (typeof errors)['dashboard']>;

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: {
      health: typeof health;
      support: typeof support;
      tasks: typeof tasks;
      tasksPlanning: typeof tasksPlanning;
      tasksStats: typeof tasksStats;
      tasksDay: typeof tasksDay;
      activity: typeof activity;
      common: CommonResources;
      components: typeof components;
      errors: ErrorResources;
      limits: typeof limits;
      modals: typeof modals;
      overview: typeof overview;
      settings: typeof settings;
    };
  }
}
