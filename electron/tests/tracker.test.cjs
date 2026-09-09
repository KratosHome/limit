const assert = require('node:assert/strict');
const { setImmediate: nextTurn } = require('node:timers/promises');
const test = require('node:test');
const { ActivityTracker } = require('../tracker.cjs');

function createHarness(t) {
  const clock = { now: 1000 };
  const settings = {
    trackingEnabled: true,
    websiteTrackingEnabled: false,
    idleThresholdSeconds: 60,
  };
  const system = { state: 'active' };
  const windowInfo = {
    owner: { name: 'Editor', bundleId: 'com.example.editor', processId: 200 },
  };
  const provider = { read: () => windowInfo, calls: 0 };
  const samples = [];
  const updates = [];
  t.mock.method(performance, 'now', () => clock.now);
  const tracker = new ActivityTracker({
    store: {
      getSettings: () => ({ ...settings }),
      recordSample: (sample, seconds, isLaunch) => {
        samples.push({ sample, seconds, isLaunch });
      },
    },
    getSystemState: () => system.state,
    ownProcessId: 100,
    activeWindowProvider: () => {
      provider.calls += 1;
      return provider.read();
    },
  });
  tracker.on('updated', (status) => updates.push(status));
  return {
    clock,
    settings,
    system,
    windowInfo,
    provider,
    samples,
    updates,
    tracker,
    tickAt(now) {
      clock.now = now;
      return tracker.tick();
    },
    setTracking(enabled) {
      settings.trackingEnabled = enabled;
      tracker.resetActivity();
    },
  };
}

function deferNextRead(h) {
  const result = Promise.withResolvers();
  const entered = Promise.withResolvers();
  h.provider.read = () => {
    entered.resolve();
    return result.promise;
  };
  return { ...result, entered: entered.promise };
}

test('pause and resume between polling ticks never bridge the paused interval', async (t) => {
  const h = createHarness(t);
  await h.tickAt(1000);
  await h.tickAt(6000);
  assert.deepEqual(
    h.samples.map(({ seconds }) => seconds),
    [5],
  );

  h.clock.now = 7000;
  h.setTracking(false);
  assert.equal(h.updates.at(-1).activityState, 'paused');
  assert.equal(h.updates.at(-1).currentApp, null);
  assert.equal(h.updates.at(-1).permissionState, 'granted');
  h.clock.now = 8000;
  h.setTracking(true);
  assert.equal(h.updates.at(-1).activityState, 'unknown');

  await h.tickAt(11000);
  assert.equal(h.samples.length, 1);
  await h.tickAt(16000);
  assert.deepEqual(
    h.samples.map(({ seconds }) => seconds),
    [5, 5],
  );
  assert.equal(h.tracker.getStatus().activityState, 'active');
});

test('a pending window result is discarded after pause and resume', async (t) => {
  const h = createHarness(t);
  await h.tickAt(1000);
  const pending = deferNextRead(h);
  const tick = h.tickAt(6000);
  await pending.entered;
  h.setTracking(false);
  h.setTracking(true);
  pending.resolve(h.windowInfo);
  await tick;

  assert.equal(h.samples.length, 0);
  assert.equal(h.tracker.getStatus().currentApp, null);
  assert.equal(h.tracker.getStatus().activityState, 'unknown');
  h.provider.read = () => h.windowInfo;
  await h.tickAt(11000);
  assert.equal(h.samples.length, 0);
  await h.tickAt(16000);
  assert.deepEqual(
    h.samples.map(({ seconds }) => seconds),
    [5],
  );
});

test('a pending provider error cannot overwrite the paused status or permissions', async (t) => {
  const h = createHarness(t);
  await h.tickAt(1000);
  const pending = deferNextRead(h);
  const tick = h.tickAt(6000);
  await pending.entered;
  h.setTracking(false);
  const pausedStatus = h.updates.at(-1);
  const updateCount = h.updates.length;
  pending.reject(new Error('Accessibility permission denied'));
  await tick;

  assert.equal(h.samples.length, 0);
  assert.equal(h.updates.length, updateCount);
  assert.deepEqual(h.tracker.getStatus(), pausedStatus);
  assert.equal(h.tracker.getStatus().permissionState, 'granted');
  assert.equal(h.tracker.getStatus().lastError, null);
});

for (const websiteTrackingEnabled of [false, true]) {
  test(`inactivity keeps recording foreground ${websiteTrackingEnabled ? 'website' : 'app'} time without restarting the session`, async (t) => {
    const h = createHarness(t);
    h.settings.websiteTrackingEnabled = websiteTrackingEnabled;
    h.windowInfo.url = 'https://www.example.com/watch';
    await h.tickAt(1000);

    h.system.state = 'idle';
    for (let now = 6000; now <= 1801000; now += 5000) {
      await h.tickAt(now);
    }

    assert.equal(h.samples.length, 360);
    assert.equal(
      h.samples.reduce((seconds, sample) => seconds + sample.seconds, 0),
      1800,
    );
    assert.equal(h.tracker.getStatus().activityState, 'active');
    assert.equal(h.tracker.getStatus().currentApp.id, 'com.example.editor');
    assert.equal(h.samples.filter(({ isLaunch }) => isLaunch).length, 1);
    assert.ok(
      h.samples.every(({ sample }) => sample.id === 'com.example.editor'),
    );
    for (const { sample } of h.samples) {
      assert.deepEqual(
        sample.site,
        websiteTrackingEnabled ? { domain: 'example.com' } : null,
      );
    }

    h.system.state = 'active';
    await h.tickAt(1806000);
    assert.equal(h.samples.length, 361);
    assert.equal(h.samples.at(-1).seconds, 5);
    assert.equal(h.samples.at(-1).isLaunch, false);
  });
}

test('inactivity during a window read still records the pending interval', async (t) => {
  const h = createHarness(t);
  await h.tickAt(1000);
  const pending = deferNextRead(h);
  const tick = h.tickAt(6000);
  await pending.entered;
  h.system.state = 'idle';
  pending.resolve(h.windowInfo);
  await tick;

  assert.equal(h.samples.length, 1);
  assert.equal(h.samples[0].seconds, 5);
  assert.equal(h.tracker.getStatus().activityState, 'active');
});

for (const activityState of ['locked', 'unknown']) {
  test(`${activityState} time is excluded and tracking resumes from a fresh sample`, async (t) => {
    const h = createHarness(t);
    await h.tickAt(1000);
    await h.tickAt(6000);
    h.system.state = activityState;
    await h.tickAt(11000);
    await h.tickAt(16000);
    assert.equal(h.tracker.getStatus().activityState, activityState);
    assert.equal(h.tracker.getStatus().currentApp, null);
    assert.equal(h.provider.calls, 2);
    assert.equal(h.samples.length, 1);

    h.system.state = 'active';
    await h.tickAt(21000);
    assert.equal(h.samples.length, 1);
    await h.tickAt(26000);
    assert.deepEqual(
      h.samples.map(({ seconds }) => seconds),
      [5, 5],
    );
  });
}

test('a system lock during a window read prevents the pending sample from being recorded', async (t) => {
  const h = createHarness(t);
  await h.tickAt(1000);
  const pending = deferNextRead(h);
  const tick = h.tickAt(6000);
  await pending.entered;
  h.system.state = 'locked';
  pending.resolve(h.windowInfo);
  await tick;

  assert.equal(h.samples.length, 0);
  assert.equal(h.tracker.getStatus().activityState, 'locked');
  assert.equal(h.tracker.getStatus().currentApp, null);
});

test('paused settings are reflected immediately and skip all window reads', async (t) => {
  const h = createHarness(t);
  await h.tickAt(1000);
  h.system.state = 'idle';
  h.settings.trackingEnabled = false;
  assert.equal(h.tracker.getStatus().activityState, 'paused');
  assert.equal(h.tracker.getStatus().currentApp, null);
  await h.tickAt(6000);
  assert.equal(h.provider.calls, 1);
  assert.equal(h.samples.length, 0);
  assert.equal(h.updates.at(-1).activityState, 'paused');
});

test('resetActivity preserves polling so the timer resumes tracking after a pause', async (t) => {
  const h = createHarness(t);
  t.mock.timers.enable({ apis: ['setInterval'] });
  t.after(() => h.tracker.stop());
  h.tracker.start();
  await nextTurn();
  assert.equal(h.provider.calls, 1);
  h.setTracking(false);
  assert.equal(h.tracker.getStatus().running, true);

  h.clock.now = 6000;
  t.mock.timers.tick(5000);
  await nextTurn();
  assert.equal(h.provider.calls, 1);
  assert.equal(h.samples.length, 0);
  h.setTracking(true);
  h.clock.now = 11000;
  t.mock.timers.tick(5000);
  await nextTurn();
  assert.equal(h.provider.calls, 2);
  assert.equal(h.samples.length, 0);
  h.clock.now = 16000;
  t.mock.timers.tick(5000);
  await nextTurn();
  assert.deepEqual(
    h.samples.map(({ seconds }) => seconds),
    [5],
  );
});
