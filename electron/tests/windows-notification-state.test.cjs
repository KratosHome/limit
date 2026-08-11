const assert = require('node:assert/strict');
const test = require('node:test');
const {
  getWindowsNotificationSetting,
  parseNotificationSetting,
} = require('../windows-notification-state.cjs');

test('parses valid Windows per-app notification settings', () => {
  assert.equal(parseNotificationSetting('0\r\n'), 0);
  assert.equal(parseNotificationSetting('4'), 4);
  assert.throws(() => parseNotificationSetting('5'));
  assert.throws(() => parseNotificationSetting('unknown'));
});

test('reports whether Windows enables notifications for Limit', async () => {
  const accepting = await getWindowsNotificationSetting({
    execute: async () => ({ stdout: '0' }),
  });
  const suppressed = await getWindowsNotificationSetting({
    execute: async () => ({ stdout: '4' }),
  });

  assert.deepEqual(accepting, { setting: 0, canPresent: true });
  assert.deepEqual(suppressed, { setting: 4, canPresent: false });
});
