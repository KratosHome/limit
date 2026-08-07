import type activity from './locales/en/activity';
import type common from './locales/en/common';
import type components from './locales/en/components';
import type errors from './locales/en/errors';
import type limits from './locales/en/limits';
import type modals from './locales/en/modals';
import type overview from './locales/en/overview';
import type settings from './locales/en/settings';

type CommonResources = Omit<typeof common, 'categories'> & {
  categories: typeof common.categories & Record<string, string>;
};

type ErrorResources = typeof errors &
  Record<string, string | (typeof errors)['dashboard']>;

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: {
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
