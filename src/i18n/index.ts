import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import activityEn from './locales/en/activity';
import commonEn from './locales/en/common';
import componentsEn from './locales/en/components';
import errorsEn from './locales/en/errors';
import limitsEn from './locales/en/limits';
import modalsEn from './locales/en/modals';
import overviewEn from './locales/en/overview';
import settingsEn from './locales/en/settings';
import activityUk from './locales/uk/activity';
import commonUk from './locales/uk/common';
import componentsUk from './locales/uk/components';
import errorsUk from './locales/uk/errors';
import limitsUk from './locales/uk/limits';
import modalsUk from './locales/uk/modals';
import overviewUk from './locales/uk/overview';
import settingsUk from './locales/uk/settings';

export const supportedLanguages = ['uk', 'en'] as const;
export type AppLanguage = (typeof supportedLanguages)[number];

export function normalizeLanguage(value?: string | null): AppLanguage {
  return value?.toLowerCase().startsWith('uk') ? 'uk' : 'en';
}

const resources = {
  uk: {
    activity: activityUk,
    common: commonUk,
    components: componentsUk,
    errors: errorsUk,
    limits: limitsUk,
    modals: modalsUk,
    overview: overviewUk,
    settings: settingsUk,
  },
  en: {
    activity: activityEn,
    common: commonEn,
    components: componentsEn,
    errors: errorsEn,
    limits: limitsEn,
    modals: modalsEn,
    overview: overviewEn,
    settings: settingsEn,
  },
} as const;

const initialLanguage = normalizeLanguage(
  localStorage.getItem('limit-language') ?? navigator.language,
);

function syncDocumentMetadata(language?: string): void {
  const normalizedLanguage = normalizeLanguage(language);
  document.documentElement.lang = normalizedLanguage;
  document.title = resources[normalizedLanguage].common.app.title;
}

syncDocumentMetadata(initialLanguage);
i18n.on('languageChanged', syncDocumentMetadata);

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage,
  fallbackLng: 'en',
  supportedLngs: supportedLanguages,
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
