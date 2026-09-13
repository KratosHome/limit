const test = require('node:test');
const assert = require('node:assert/strict');
const { createTaskController } = require('../task-controller.cjs');

function harness() {
  let wall = Date.parse('2026-09-13T10:00:00Z');
  let mono = 0;
  let failSave = false;
  const context = {
    trackingEnabled: true,
    locked: false,
    appId: 'editor',
    appReady: true,
  };
  const tasks = new Map([
    ['manual', { id: 'manual', status: 'todo', appIds: [], trackedSeconds: 0 }],
    [
      'linked',
      {
        id: 'linked',
        status: 'todo',
        appIds: ['editor', 'browser'],
        trackedSeconds: 0,
      },
    ],
  ]);
  const saved = [];
  const store = {
    getTask: (id) => tasks.get(id) ?? null,
    getTaskWorkspace: () => ({ tasks: [...tasks.values()] }),
    setTaskStatus(id, status) {
      const item = tasks.get(id);
      item.status = status;
      return item;
    },
    deleteTask: (id) => tasks.delete(id),
    saveTask(input) {
      tasks.set(input.id, input);
      return input;
    },
    saveTaskSprint: (input) => input,
    deleteTaskSprint: () => true,
    disableTaskRecurrence: () => true,
    addTaskTime(slice) {
      if (failSave) throw new Error('disk full');
      const item = tasks.get(slice.taskId);
      if (!item) return null;
      saved.push(slice);
      item.trackedSeconds +=
        (Date.parse(slice.endedAt) - Date.parse(slice.startedAt)) / 1000;
      return item;
    },
  };
  const options = {
    store,
    getContext: () => context,
    notify: () => {},
    now: () => wall,
    monotonic: () => mono,
  };
  const controller = createTaskController(options);
  return {
    controller,
    context,
    tasks,
    saved,
    options,
    setFail(value) {
      failSave = value;
    },
    tick(ms = 1000, wallMs = ms) {
      mono += ms;
      wall += wallMs;
      controller.checkpoint();
    },
    seconds(id) {
      return tasks.get(id).trackedSeconds;
    },
  };
}

test('manual task checkpoints time, freezes on global pause and lock, resumes without counting gaps', () => {
  const h = harness();
  assert.equal(h.controller.startTimer('manual').state, 'running');
  h.tick(5000);
  assert.equal(h.seconds('manual'), 5);
  assert.equal(h.saved[0].appId, null);
  h.context.trackingEnabled = false;
  h.tick();
  assert.equal(h.controller.state().reason, 'tracking');
  h.tick(10000);
  h.context.trackingEnabled = true;
  h.tick();
  h.tick(5000);
  h.context.locked = true;
  h.tick();
  assert.equal(h.controller.state().reason, 'locked');
  h.tick(20000);
  h.context.locked = false;
  h.tick();
  h.tick(5000);
  assert.equal(h.seconds('manual'), 15);
  assert.equal(h.controller.state().sessionSeconds, 15);
});

test('linked timer only attributes fresh eligible foreground app intervals', () => {
  const h = harness();
  h.context.appId = 'mail';
  assert.equal(h.controller.startTimer('linked').reason, 'app');
  h.tick(5000);
  assert.equal(h.seconds('linked'), 0);
  h.context.appId = 'editor';
  h.tick();
  h.tick(5000);
  h.context.appId = 'browser';
  h.tick();
  h.tick(5000);
  h.context.appReady = false;
  h.tick();
  h.tick(5000);
  assert.equal(h.controller.state().state, 'waiting');
  assert.equal(h.seconds('linked'), 10);
  assert.deepEqual(
    h.saved.map((slice) => slice.appId),
    ['editor', 'browser'],
  );
});

test('switch, pause, resume, completion and deletion flush to the owning task', () => {
  const h = harness();
  h.controller.startTimer('manual');
  h.tick(2000);
  h.controller.startTimer('linked');
  assert.equal(h.seconds('manual'), 2);
  assert.equal(h.controller.state().sessionSeconds, 0);
  h.tick(3000);
  h.controller.pauseTimer();
  assert.equal(h.seconds('linked'), 3);
  h.tick(20000);
  assert.equal(h.controller.state().sessionSeconds, 3);
  h.controller.startTimer('linked');
  h.tick(2000);
  h.controller.setStatus('linked', 'done');
  assert.equal(h.seconds('linked'), 5);
  assert.equal(h.controller.state().taskId, null);
  assert.throws(() => h.controller.startTimer('linked'));
  h.controller.startTimer('manual');
  h.tick(1000);
  h.controller.delete('manual');
  assert.equal(h.saved.at(-1).taskId, 'manual');
  assert.equal(h.controller.state().state, 'idle');
});

test('sleep, wall clock adjustments and nonpositive deltas never add elapsed time', () => {
  const h = harness();
  h.controller.startTimer('manual');
  h.tick(2000);
  h.tick(120000);
  h.tick(1000, 3601000);
  h.tick(0, 0);
  h.tick(-1000, -1000);
  h.tick(5000);
  h.controller.stopTimer();
  assert.equal(h.seconds('manual'), 7);
  assert.ok(
    h.saved.every(
      (slice) =>
        Date.parse(slice.endedAt) - Date.parse(slice.startedAt) <= 30000,
    ),
  );
});

test('a failed save pauses the timer and retries its pending slice once before switching', () => {
  const h = harness();
  h.controller.startTimer('manual');
  h.setFail(true);
  h.tick(5000);
  assert.equal(h.controller.state().reason, 'error');
  assert.throws(() => h.controller.startTimer('linked'), /disk full/);
  assert.equal(h.controller.state().taskId, 'manual');
  h.setFail(false);
  h.tick(10000);
  assert.equal(h.seconds('manual'), 5);
  assert.equal(h.controller.state().state, 'paused');
  h.controller.startTimer('linked');
  h.tick(5000);
  assert.equal(h.seconds('linked'), 5);
  assert.equal(h.saved.filter((slice) => slice.taskId === 'manual').length, 1);
});

test('dispose flushes short intervals; a new controller starts idle without offline time', () => {
  const h = harness();
  h.controller.startTimer('manual');
  h.tick(2000);
  h.controller.dispose();
  h.tick(600000);
  const restarted = createTaskController(h.options);
  assert.equal(restarted.state().state, 'idle');
  assert.equal(h.seconds('manual'), 2);
  assert.throws(() => h.controller.startTimer('manual'));
  restarted.dispose();
});

test('a renderer notification error cannot undo or duplicate saved time', () => {
  const h = harness();
  const controller = createTaskController({
    ...h.options,
    notify() {
      throw new Error('window closed');
    },
  });
  controller.startTimer('manual');
  h.tick(5000);
  controller.checkpoint(true);
  controller.stopTimer();
  assert.equal(h.seconds('manual'), 5);
  assert.equal(h.saved.length, 1);
  assert.equal(controller.state().state, 'idle');
});

test('persistent disk failure sends one error update without a dashboard refresh loop', () => {
  const h = harness();
  let refreshes = 0;
  let refreshing = false;
  const controller = createTaskController({
    ...h.options,
    notify() {
      refreshes++;
      assert.ok(refreshes < 10, 'notification loop');
      if (refreshing) controller.workspace({});
    },
  });
  controller.startTimer('manual');
  h.setFail(true);
  h.tick(5000);
  refreshing = true;
  controller.checkpoint();
  const afterFailure = refreshes;
  for (let i = 0; i < 10; i++) controller.workspace({});
  assert.equal(refreshes, afterFailure);
  assert.equal(controller.state().reason, 'error');
});

test('editing an unrelated sprint preserves the active timer anchor', () => {
  const h = harness();
  h.controller.startTimer('manual');
  h.tick(2000);
  h.controller.saveSprint({ name: 'Next sprint' });
  for (let i = 0; i < 6; i++) h.tick();
  h.controller.stopTimer();
  assert.equal(h.seconds('manual'), 8);
});
