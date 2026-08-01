const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { UsageStore } = require('./store.cjs');

function createStore(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'limit-store-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return new UsageStore(path.join(directory, 'data.json'), { persistDelay: 10_000 });
}

test('aggregates app time and launches for a selected day', (t) => {
  const store = createStore(t);
  const morning = new Date(2026, 7, 1, 9, 30);
  store.recordSample({ id: 'com.example.browser', name: 'Browser', title: 'News' }, 60, true, morning);
  store.recordSample({ id: 'com.example.browser', name: 'Browser', title: 'Docs' }, 120, false, morning);

  const result = store.aggregate('2026-08-01', '2026-08-01');
  assert.equal(result.totalSeconds, 180);
  assert.equal(result.apps[0].seconds, 180);
  assert.equal(result.apps[0].launches, 1);
  assert.equal(result.timeline[9].seconds, 180);
  store.close();
});

test('validates, saves and pauses a daily limit', (t) => {
  const store = createStore(t);
  const limit = store.saveLimit({
    appId: 'org.telegram.desktop',
    appName: 'Telegram',
    dailyLimitMinutes: 60,
    warningMinutes: 10,
    enabled: true,
  });
  assert.equal(limit.dailyLimitMinutes, 60);
  assert.equal(store.getLimits().length, 1);
  assert.equal(store.pauseLimitToday('org.telegram.desktop', new Date(2026, 7, 1)).pausedDate, '2026-08-01');
  assert.throws(
    () => store.saveLimit({ appId: 'bad', appName: 'Bad', dailyLimitMinutes: 0 }),
    /від 1 хвилини/,
  );
  store.close();
});

test('backs up malformed history before starting a fresh store', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'limit-corrupt-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'data.json');
  fs.writeFileSync(filePath, '{not valid json');

  const store = new UsageStore(filePath, { persistDelay: 10_000 });
  const status = store.getStorageStatus();
  assert.equal(status.recoveryCreated, true);
  assert.match(status.error, /резервну копію/);
  assert.equal(fs.readdirSync(directory).some((name) => name.startsWith('data.json.corrupt-')), true);
  store.close();
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(filePath, 'utf8')));
});
