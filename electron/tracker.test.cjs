const assert = require('node:assert/strict');
const test = require('node:test');
const { ActivityTracker } = require('./tracker.cjs');

test('attributes elapsed time to the previous foreground app', async () => {
  const recorded = [];
  const windows = [
    { owner: { name: 'Browser', processId: 101, bundleId: 'com.example.browser' }, title: 'Private title' },
    { owner: { name: 'Editor', processId: 102, bundleId: 'com.example.editor' }, title: 'Secret document' },
  ];
  const store = {
    getSettings: () => ({ trackingEnabled: true, idleThresholdSeconds: 60 }),
    recordSample: (...args) => recorded.push(args),
  };
  const tracker = new ActivityTracker({
    store,
    getIdleSeconds: () => 0,
    ownProcessId: 999,
    intervalMs: 1000,
    activeWindowProvider: async () => windows.shift(),
  });

  tracker.lastTickAt = performance.now() - 1000;
  await tracker.tick();
  assert.equal(recorded.length, 0, 'the first sample only establishes a baseline');

  tracker.lastTickAt = performance.now() - 1000;
  await tracker.tick();
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0][0].id, 'com.example.browser');
  assert.equal(recorded[0][0].title, '', 'window titles are intentionally discarded');
  assert.equal(recorded[0][2], true, 'the first interval counts as a launch');
  assert.ok(recorded[0][1] >= 0.9 && recorded[0][1] <= 1.1);
});

test('drops the foreground baseline while the user is idle', async () => {
  const recorded = [];
  const tracker = new ActivityTracker({
    store: {
      getSettings: () => ({ trackingEnabled: true, idleThresholdSeconds: 60 }),
      recordSample: (...args) => recorded.push(args),
    },
    getIdleSeconds: () => 120,
    ownProcessId: 999,
    activeWindowProvider: async () => ({ owner: { name: 'Browser', processId: 101 } }),
  });
  tracker.lastSample = { id: 'browser', name: 'Browser', title: '' };
  tracker.lastAppId = 'browser';
  tracker.lastTickAt = performance.now() - 1000;

  await tracker.tick();
  assert.equal(recorded.length, 0);
  assert.equal(tracker.getStatus().currentApp, null);
  assert.equal(tracker.lastSample, null);
});
