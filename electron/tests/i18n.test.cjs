const assert = require('node:assert/strict');
const test = require('node:test');
const { desktopMessages, resolveDesktopLanguage } = require('../i18n.cjs');

test('desktop messages support Ukrainian and English', () => {
  const uk = desktopMessages('uk');
  const en = desktopMessages('en');

  assert.equal(uk.open, 'Відкрити Limit');
  assert.equal(en.open, 'Open Limit');
  assert.match(uk.reachedTitle('Editor'), /Ліміт Editor/);
  assert.match(en.reachedTitle('Editor'), /Editor reached/);
  assert.equal(en.warningMessage(5), '5 min remaining.');
  assert.equal(en.notificationRequestTitle, 'Limit notifications');
  assert.match(uk.notificationPermissionMessage, /Limit/);
  assert.equal(en.openNotificationSettings, 'Open Settings');
});

test('desktop messages safely fall back to English', () => {
  assert.equal(desktopMessages('fr').quit, 'Quit');
});

test('preferred system languages resolve to the first supported app language', () => {
  assert.equal(resolveDesktopLanguage(['pl-PL', 'uk-UA', 'en-US']), 'uk');
  assert.equal(resolveDesktopLanguage(['de-DE', 'en-GB', 'uk-UA']), 'en');
  assert.equal(resolveDesktopLanguage(['UK_ua']), 'uk');
});

test('preferred system languages safely fall back to English', () => {
  assert.equal(resolveDesktopLanguage(['de-DE', 'pl-PL']), 'en');
  assert.equal(resolveDesktopLanguage([]), 'en');
  assert.equal(resolveDesktopLanguage(undefined), 'en');
  assert.equal(resolveDesktopLanguage([null, 42, 'uk-UA']), 'uk');
});
