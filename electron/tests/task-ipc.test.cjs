const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const errors = require('../errors.cjs');
const { UsageStore } = require('../store.cjs');
const { createTaskController } = require('../task-controller.cjs');

const routes = [
  [
    'getTaskWorkspace',
    'tasks:workspace',
    'workspace',
    [{ from: '2026-09-13', to: '2026-09-20' }],
  ],
  ['saveTask', 'tasks:save', 'save', [{ title: 'Task' }]],
  ['setTaskStatus', 'tasks:status', 'setStatus', ['id', 'done']],
  ['deleteTask', 'tasks:delete', 'delete', ['id']],
  ['startTaskTimer', 'tasks:timer-start', 'startTimer', ['id']],
  ['pauseTaskTimer', 'tasks:timer-pause', 'pauseTimer', []],
  ['stopTaskTimer', 'tasks:timer-stop', 'stopTimer', []],
  ['saveTaskSprint', 'tasks:sprint-save', 'saveSprint', [{ name: 'Sprint' }]],
  ['deleteTaskSprint', 'tasks:sprint-delete', 'deleteSprint', ['id']],
  [
    'disableTaskRecurrence',
    'tasks:repeat-disable',
    'disableRecurrence',
    ['id'],
  ],
];
const plain = (value) => JSON.parse(JSON.stringify(value));

function mainHarness(controller) {
  const handlers = new Map();
  const listeners = new Map();
  const electron = {
    app: {
      isPackaged: true,
      getPath: () => '/tmp',
      setPath() {},
      requestSingleInstanceLock: () => true,
      on() {},
      whenReady: () => new Promise(() => {}),
    },
    ipcMain: {
      handle: (channel, callback) => handlers.set(channel, callback),
      on: (channel, callback) => listeners.set(channel, callback),
    },
  };
  const context = vm.createContext({
    require(name) {
      if (name === 'electron') return electron;
      if (name === './errors.cjs') return errors;
      if (name === './store.cjs') return require('../store.cjs');
      if (name.startsWith('node:')) return require(name);
      return {};
    },
    process: { platform: 'darwin', env: {} },
    console,
    __dirname: path.resolve(__dirname, '..'),
  });
  const setup = vm.runInContext(
    `${fs.readFileSync(path.join(__dirname, '../main.cjs'), 'utf8')}
    ;(controller, window) => { tasks = controller; mainWindow = window; registerIpc(); return (nextWindow) => { mainWindow = nextWindow; }; }`,
    context,
  );
  const url = 'file:///app/index.html';
  const frame = { url };
  const contents = { mainFrame: frame, getURL: () => url };
  const window = { webContents: contents, isDestroyed: () => false };
  const setWindow = setup(controller, window);
  return {
    handlers,
    listeners,
    event: { sender: contents, senderFrame: frame },
    window,
    setWindow,
  };
}

function preloadHarness(invoke) {
  let api;
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../preload.cjs'), 'utf8'),
    {
      require(name) {
        assert.equal(name, 'electron');
        return {
          contextBridge: {
            exposeInMainWorld(name, value) {
              assert.equal(name, 'limitApi');
              api = value;
            },
          },
          ipcRenderer: { invoke, on() {}, removeListener() {}, send() {} },
        };
      },
    },
  );
  return api;
}

test('all ten task channels require the actual main-window sender and its current top-level frame', () => {
  let calls = 0;
  const controller = Object.fromEntries(
    routes.map(([, , action]) => [
      action,
      () => {
        calls += 1;
      },
    ]),
  );
  const h = mainHarness(controller);
  assert.deepEqual(
    [...h.handlers.keys()]
      .filter((channel) => channel.startsWith('tasks:'))
      .sort(),
    routes.map(([, channel]) => channel).sort(),
  );
  for (const [, channel, , args] of routes) {
    const handler = h.handlers.get(channel);
    const widgetFrame = { url: 'file:///app/index.html?widget=tracking' };
    for (const event of [
      { sender: {}, senderFrame: {} },
      { sender: { mainFrame: widgetFrame }, senderFrame: widgetFrame },
      { ...h.event, senderFrame: { url: h.event.senderFrame.url } },
      { ...h.event, senderFrame: undefined },
    ])
      assert.throws(() => handler(event, ...args), /IPC sender/);
    h.event.senderFrame.url = 'https://example.com';
    assert.throws(() => handler(h.event, ...args), /IPC sender/);
    h.event.senderFrame.url = 'file:///app/index.html';
    h.setWindow(null);
    assert.throws(() => handler(h.event, ...args), /IPC sender/);
    h.setWindow(h.window);
  }
  assert.equal(calls, 0);
});

test('task IPC dispatches each trusted call to its intended controller action and returns a safe error envelope', () => {
  const calls = [];
  let failure = null;
  const controller = Object.fromEntries(
    routes.map(([, , action]) => [
      action,
      (...args) => {
        if (failure) throw failure;
        calls.push([action, ...args]);
        return { action, value: false };
      },
    ]),
  );
  const h = mainHarness(controller);
  for (const [, channel, action, args] of routes) {
    assert.deepEqual(plain(h.handlers.get(channel)(h.event, ...args)), {
      ok: true,
      data: { action, value: false },
    });
    assert.deepEqual(calls.at(-1), [action, ...args]);
  }
  for (const error of [
    new errors.AppError(errors.ERROR_CODES.INVALID_TASK),
    new errors.AppError(errors.ERROR_CODES.INVALID_SPRINT),
    new Error('SQL private contents /local/database'),
  ]) {
    failure = error;
    for (const [, channel, , args] of routes)
      assert.deepEqual(plain(h.handlers.get(channel)(h.event, ...args)), {
        ok: false,
        error: { code: error.code || 'storageSave' },
      });
  }
  assert.equal(calls.length, 10);
});

test('preload exposes only the ten named task APIs, forwards narrow arguments and unwraps all success/error results', async () => {
  const calls = [];
  let result = { ok: true, data: false };
  const api = preloadHarness(async (...args) => {
    calls.push(plain(args));
    return result;
  });
  assert.deepEqual(
    Object.keys(api)
      .filter((name) => /Task/.test(name))
      .sort(),
    routes.map(([name]) => name).sort(),
  );
  for (const [name, channel, , args] of routes) {
    assert.equal(
      await api[name](...args, { startedAt: '1900-01-01', seconds: 1000000 }),
      false,
    );
    assert.deepEqual(calls.at(-1), [channel, ...args]);
    result = {
      ok: false,
      error: { code: 'invalidTask', message: 'private details' },
    };
    await assert.rejects(api[name](...args), { message: 'invalidTask' });
    result = { ok: true, data: false };
  }
  assert.equal(api.addTaskTime, undefined);
  assert.equal(api.getTask, undefined);
  assert.equal(api.invoke, undefined);
});

test('there is no arbitrary task-time write route through IPC or preload', () => {
  const h = mainHarness({});
  assert.equal(
    [...h.listeners.keys()].some((channel) => channel.startsWith('tasks:')),
    false,
  );
  const allowedTimers = [
    'tasks:timer-start',
    'tasks:timer-pause',
    'tasks:timer-stop',
  ];
  assert.deepEqual(
    [...h.handlers.keys()].filter(
      (channel) => channel.startsWith('tasks:') && /time/.test(channel),
    ),
    allowedTimers,
  );
  for (const channel of [
    'tasks:add-time',
    'tasks:time',
    'tasks:time-add',
    'tasks:checkpoint',
    'tasks:timer-set',
    'tasks:timer-checkpoint',
  ])
    assert.equal(h.handlers.has(channel), false);
});

test('real preload → trusted IPC → controller → temporary SQLite validates mutations and saves only elapsed timer time', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'limit-task-ipc-'));
  const store = new UsageStore(path.join(directory, 'usage.sqlite3'));
  let clock = Date.parse('2026-09-13T12:00:00Z');
  const controller = createTaskController({
    store,
    now: () => clock,
    monotonic: () => clock,
    notify() {},
    getContext: () => ({
      locked: false,
      trackingEnabled: true,
      appReady: true,
      appId: 'browser',
    }),
  });
  t.after(() => {
    controller.dispose();
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const h = mainHarness(controller);
  const api = preloadHarness((channel, ...args) =>
    h.handlers.get(channel)(h.event, ...args),
  );
  const range = { from: '2026-09-13', to: '2026-09-20' };
  const sprint = await api.saveTaskSprint({
    name: 'Sprint',
    goal: '',
    startDate: range.from,
    endDate: range.to,
    status: 'active',
  });
  const taskInput = {
    title: 'Task',
    description: '',
    status: 'todo',
    priority: 'none',
    scheduledDate: range.from,
    scheduledTime: null,
    dueDate: null,
    estimateMinutes: null,
    appIds: ['browser'],
    sprintId: sprint.id,
    repeat: { frequency: 'weekly', days: [7], until: range.to },
  };
  const saved = await api.saveTask({
    ...taskInput,
    trackedSeconds: 1000000,
    completedAt: '1900-01-01T00:00:00Z',
  });
  assert.equal(saved.trackedSeconds, 0);
  assert.equal(saved.completedAt, null);
  assert.equal((await api.getTaskWorkspace(range)).tasks.length, 2);
  assert.equal(
    (await api.setTaskStatus(saved.id, 'done')).completedAt,
    new Date(clock).toISOString(),
  );
  await api.setTaskStatus(saved.id, 'todo');
  const before = plain(await api.getTaskWorkspace(range));
  for (const [name, args, code] of [
    [
      'saveTask',
      [{ ...taskInput, title: '', trackedSeconds: 5000 }],
      'invalidTask',
    ],
    ['setTaskStatus', [saved.id, 'invalid'], 'invalidTask'],
    [
      'getTaskWorkspace',
      [{ from: '2026-01-01', to: '2027-01-02' }],
      'invalidTask',
    ],
    ['deleteTask', ["'; DELETE FROM tasks; --"], 'invalidTask'],
    ['startTaskTimer', [{ taskId: saved.id, seconds: 1000 }], 'invalidTask'],
    ['saveTaskSprint', [{ name: 'bad' }], 'invalidSprint'],
    ['deleteTaskSprint', ['not-an-id'], 'invalidTask'],
    ['disableTaskRecurrence', ['not-an-id'], 'invalidTask'],
  ])
    await assert.rejects(api[name](...args), { message: code });
  assert.deepEqual(plain(await api.getTaskWorkspace(range)), before);
  assert.equal(
    (await api.startTaskTimer(saved.id, { seconds: 1000000 })).state,
    'running',
  );
  clock += 5000;
  assert.equal(
    (await api.pauseTaskTimer({ seconds: 1000000 })).state,
    'paused',
  );
  assert.equal(store.getTask(saved.id).trackedSeconds, 5);
  assert.equal((await api.stopTaskTimer({ seconds: 1000000 })).state, 'idle');
  assert.equal(await api.disableTaskRecurrence(saved.recurrenceId), true);
  assert.equal((await api.getTaskWorkspace(range)).tasks.length, 1);
  assert.equal(await api.deleteTaskSprint(sprint.id), true);
  assert.equal(store.getTask(saved.id).sprintId, null);
  assert.equal(await api.deleteTask(saved.id), true);
  assert.equal((await api.getTaskWorkspace(range)).tasks.length, 0);
});
