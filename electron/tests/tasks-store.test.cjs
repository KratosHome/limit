const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const test = require('node:test');
const { UsageStore } = require('../store.cjs');
const fitnessSchema = require('../store/fitness-schema.cjs');
const { createHealthSyncSchema } = require('../store/health-sync-schema.cjs');

const now = new Date('2026-09-13T12:00:00Z');
const range = { from: '2026-09-01', to: '2026-09-30' };
const input = {
  title: 'Task',
  description: '',
  status: 'todo',
  priority: 'medium',
  scheduledDate: null,
  scheduledTime: null,
  dueDate: null,
  estimateMinutes: null,
  appIds: [],
  sprintId: null,
};
const sprint = {
  name: 'Sprint',
  goal: 'Ship it',
  startDate: range.from,
  endDate: range.to,
  status: 'active',
};

function setup(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'limit-tasks-'));
  const databasePath = path.join(directory, 'usage.sqlite3');
  const stores = [];
  const open = () => {
    const store = new UsageStore(databasePath);
    stores.push(store);
    return store;
  };
  t.after(() => {
    for (const store of stores) store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return { directory, databasePath, open, store: open() };
}
const workspace = (store, dates = range, date = now) =>
  store.getTaskWorkspace(dates, date);
const tracked = (store, taskId, startedAt, endedAt, appId = null) =>
  store.addTaskTime({ taskId, startedAt, endedAt, appId });
const dropTasks =
  'DROP TABLE task_time_daily; DROP TABLE tasks; DROP TABLE task_recurrences; DROP TABLE task_sprints;';
const dropFitness =
  'DROP TABLE IF EXISTS fitness_daily; DROP TABLE IF EXISTS fitness_preferences; DROP TABLE IF EXISTS health_sync_config; DROP TABLE IF EXISTS fitness_sync_deleted;';

function useLegacyFeatureSchema(databasePath, feature) {
  const database = new DatabaseSync(databasePath);
  database.exec(
    `${dropFitness} DELETE FROM schema_migrations WHERE version >= 9;`,
  );
  if (feature === 'health') {
    database.exec(dropTasks);
    database.exec(fitnessSchema);
    createHealthSyncSchema(database);
    database.exec(`
      INSERT INTO schema_migrations VALUES (9, 'fitness_daily', '2026-09-13T10:00:00Z');
      INSERT INTO schema_migrations VALUES (10, 'health_sync', '2026-09-13T11:00:00Z');
      PRAGMA user_version = 10;
    `);
  } else {
    database.exec(`
      INSERT INTO schema_migrations VALUES (9, 'task_manager', '2026-09-13T10:00:00Z');
      PRAGMA user_version = 9;
    `);
  }
  return database;
}

test('schema 10 health upgrades preserve fitness, pairing, settings and website history while adding tasks', (t) => {
  const { store, open, databasePath, directory } = setup(t);
  store.updateSettings({ language: 'en', websiteTrackingEnabled: true });
  store.recordSample(
    { id: 'browser', name: 'Browser', site: { domain: 'example.com' } },
    45,
    true,
    now,
  );
  const original = structuredClone(store.data);
  store.close();
  const old = useLegacyFeatureSchema(databasePath, 'health');
  old.exec(`
    INSERT INTO fitness_daily VALUES ('2026-09-13', 12345, 45, 7.2, 'Workout', 'apple-health', '2026-09-13T12:00:00Z');
    UPDATE fitness_preferences SET show_steps = 1, show_exercise = 1;
    UPDATE health_sync_config SET enabled = 1, device_id = '11111111-1111-1111-1111-111111111111', device_name = 'Test iPhone', encrypted_key = 'YWJjZA==', last_sequence = 42, last_synced_at = '2026-09-13T12:00:00Z';
    INSERT INTO fitness_sync_deleted VALUES ('2026-09-12');
  `);
  const health = [
    'fitness_daily',
    'fitness_preferences',
    'health_sync_config',
    'fitness_sync_deleted',
  ].map((table) => [table, old.prepare(`SELECT * FROM ${table}`).all()]);
  old.close();
  const migrated = open();
  assert.deepEqual(migrated.data, original);
  assert.equal(
    migrated.database.prepare('PRAGMA user_version').get().user_version,
    11,
  );
  for (const [table, rows] of health)
    assert.deepEqual(
      migrated.database.prepare(`SELECT * FROM ${table}`).all(),
      rows,
    );
  assert.equal(workspace(migrated).tasks.length, 0);
  assert.equal(migrated.saveTask(input, now).number, 1);
  const backups = fs
    .readdirSync(directory)
    .filter((file) => /\.backup-v10-\d+$/.test(file));
  assert.equal(backups.length, 1);
  const backup = new DatabaseSync(path.join(directory, backups[0]), {
    readOnly: true,
  });
  try {
    assert.equal(backup.prepare('PRAGMA user_version').get().user_version, 10);
    for (const [table, rows] of health)
      assert.deepEqual(backup.prepare(`SELECT * FROM ${table}`).all(), rows);
  } finally {
    backup.close();
  }
  migrated.close();
  const reopened = open();
  assert.equal(workspace(reopened).tasks.length, 1);
  for (const [table, rows] of health)
    assert.deepEqual(
      reopened.database.prepare(`SELECT * FROM ${table}`).all(),
      rows,
    );
});

test('the recognized schema 9 task branch preserves tasks, time and original migration while adding health compatibility', (t) => {
  const { store, open, databasePath, directory } = setup(t);
  const saved = store.saveTask({ ...input, scheduledDate: '2026-09-13' }, now);
  tracked(store, saved.id, '2026-09-13T10:00:00Z', '2026-09-13T10:00:30Z');
  const expected = workspace(store);
  store.close();
  const old = useLegacyFeatureSchema(databasePath, 'tasks');
  const migration = old
    .prepare('SELECT * FROM schema_migrations WHERE version = 9')
    .get();
  old.close();
  const migrated = open();
  assert.deepEqual(workspace(migrated), expected);
  assert.deepEqual(
    migrated.database
      .prepare('SELECT * FROM schema_migrations WHERE version = 9')
      .get(),
    migration,
  );
  assert.equal(
    migrated.database.prepare('PRAGMA user_version').get().user_version,
    11,
  );
  assert.equal(
    migrated.database
      .prepare('SELECT count(*) AS count FROM fitness_preferences')
      .get().count,
    1,
  );
  assert.equal(
    migrated.database
      .prepare('SELECT count(*) AS count FROM health_sync_config')
      .get().count,
    1,
  );
  assert.equal(
    fs.readdirSync(directory).filter((file) => /\.backup-v9-\d+$/.test(file))
      .length,
    1,
  );
  migrated.close();
  assert.deepEqual(workspace(open()), expected);
});

test('unknown migration names and altered task or health schemas are refused without modifying the database', (t) => {
  for (const [feature, change] of [
    [
      'tasks',
      "UPDATE schema_migrations SET name = 'unknown_feature' WHERE version = 9",
    ],
    ['tasks', 'ALTER TABLE tasks ADD COLUMN unexpected TEXT'],
    ['tasks', 'DROP INDEX tasks_live_schedule'],
    [
      'health',
      "UPDATE schema_migrations SET name = 'unknown_sync' WHERE version = 10",
    ],
    ['health', 'ALTER TABLE fitness_daily ADD COLUMN unexpected TEXT'],
    ['health', 'DROP TABLE health_sync_config'],
  ]) {
    const { store, databasePath, directory } = setup(t);
    store.close();
    const old = useLegacyFeatureSchema(databasePath, feature);
    old.exec(change);
    const before = old
      .prepare('SELECT * FROM sqlite_schema ORDER BY type, name')
      .all();
    const migrations = old
      .prepare('SELECT * FROM schema_migrations ORDER BY version')
      .all();
    old.close();
    assert.throws(() => new UsageStore(databasePath), /Невідома|Несумісна/);
    const unchanged = new DatabaseSync(databasePath, { readOnly: true });
    try {
      assert.deepEqual(
        unchanged
          .prepare('SELECT * FROM sqlite_schema ORDER BY type, name')
          .all(),
        before,
      );
      assert.deepEqual(
        unchanged
          .prepare('SELECT * FROM schema_migrations ORDER BY version')
          .all(),
        migrations,
      );
    } finally {
      unchanged.close();
    }
    assert.equal(
      fs.readdirSync(directory).filter((file) => file.includes('.backup-'))
        .length,
      0,
    );
  }
});

test('schema 9 fitness can upgrade through health sync without losing its daily records', (t) => {
  const { store, open, databasePath } = setup(t);
  store.close();
  const old = useLegacyFeatureSchema(databasePath, 'health');
  old.exec(`
    DROP TABLE health_sync_config;
    DROP TABLE fitness_sync_deleted;
    DELETE FROM schema_migrations WHERE version = 10;
    PRAGMA user_version = 9;
    INSERT INTO fitness_daily VALUES ('2026-09-13', 8000, NULL, NULL, '', 'manual', '2026-09-13T12:00:00Z');
  `);
  old.close();
  const migrated = open();
  assert.equal(
    migrated.database.prepare('SELECT steps FROM fitness_daily').get().steps,
    8000,
  );
  assert.equal(
    migrated.database.prepare('PRAGMA user_version').get().user_version,
    11,
  );
  assert.equal(migrated.saveTask(input, now).number, 1);
});

test('a failed task migration rolls back new tables and preserves a valid health database for retry', (t) => {
  const { store, open, databasePath } = setup(t);
  store.recordSample({ id: 'app', name: 'App' }, 10, true, now);
  store.close();
  const old = useLegacyFeatureSchema(databasePath, 'health');
  const before = old
    .prepare(
      'SELECT type, name, tbl_name, sql FROM sqlite_schema ORDER BY type, name',
    )
    .all();
  old.close();
  const exec = DatabaseSync.prototype.exec;
  const stub = t.mock.method(DatabaseSync.prototype, 'exec', function (sql) {
    if (sql === require('../store/tasks-schema.cjs')) {
      exec.call(this, 'CREATE TABLE task_sprints (id TEXT);');
      throw new Error('simulated storage failure during task migration');
    }
    return exec.call(this, sql);
  });
  assert.throws(() => new UsageStore(databasePath), /migration 11/);
  stub.mock.restore();
  const unchanged = new DatabaseSync(databasePath, { readOnly: true });
  try {
    assert.deepEqual(
      unchanged
        .prepare(
          'SELECT type, name, tbl_name, sql FROM sqlite_schema ORDER BY type, name',
        )
        .all(),
      before,
    );
    assert.equal(
      unchanged.prepare('PRAGMA user_version').get().user_version,
      10,
    );
    assert.equal(
      unchanged.prepare('SELECT seconds FROM usage_entries').get().seconds,
      10,
    );
  } finally {
    unchanged.close();
  }
  const retried = open();
  assert.equal(
    retried.database.prepare('PRAGMA user_version').get().user_version,
    11,
  );
  assert.equal(retried.saveTask(input, now).number, 1);
});

test('an interrupted task-9 upgrade resumes after migration 10 without recreating or clearing tasks', (t) => {
  const { store, open, databasePath } = setup(t);
  const saved = store.saveTask(input, now);
  tracked(store, saved.id, '2026-09-13T10:00:00Z', '2026-09-13T10:00:30Z');
  const expected = workspace(store);
  store.close();
  const old = useLegacyFeatureSchema(databasePath, 'tasks');
  old.exec(fitnessSchema);
  createHealthSyncSchema(old);
  old.exec(
    `INSERT INTO schema_migrations VALUES (10, 'health_sync', '2026-09-13T11:00:00Z'); PRAGMA user_version = 10;`,
  );
  const pairing = old.prepare('SELECT * FROM health_sync_config').get();
  old.close();
  const resumed = open();
  assert.deepEqual(workspace(resumed), expected);
  assert.deepEqual(
    resumed.database.prepare('SELECT * FROM health_sync_config').get(),
    pairing,
  );
  assert.equal(
    resumed.database.prepare('PRAGMA user_version').get().user_version,
    11,
  );
});

test('task CRUD persists metadata and completion transitions, soft-deletes without reusing numbers', (t) => {
  const { store, open } = setup(t);
  assert.equal(workspace(store).tasks.length, 0);
  const saved = store.saveTask(
    {
      ...input,
      title: '  First  ',
      description: ' details ',
      appIds: ['browser', 'browser'],
      scheduledDate: '2026-09-13',
      scheduledTime: '09:30',
      estimateMinutes: 60,
    },
    now,
  );
  assert.equal(saved.title, 'First');
  assert.equal(saved.number, 1);
  assert.deepEqual(saved.appIds, ['browser']);
  const firstDone = store.setTaskStatus(saved.id, 'done', now);
  assert.equal(firstDone.completedAt, now.toISOString());
  const later = new Date('2026-09-14T12:00:00Z');
  assert.equal(
    store.saveTask({ ...firstDone, title: 'Edited' }, later).completedAt,
    firstDone.completedAt,
  );
  assert.equal(store.setTaskStatus(saved.id, 'todo', later).completedAt, null);
  assert.equal(
    store.setTaskStatus(saved.id, 'done', later).completedAt,
    later.toISOString(),
  );
  assert.equal(workspace(store).statistics.completedCount, 1);
  const expected = workspace(store);
  store.close();
  const reopened = open();
  assert.deepEqual(workspace(reopened), expected);
  assert.equal(reopened.deleteTask(saved.id, later), true);
  assert.equal(reopened.deleteTask(saved.id, later), false);
  assert.equal(reopened.getTask(saved.id), null);
  assert.equal(workspace(reopened).statistics.completedCount, 0);
  assert.equal(reopened.saveTask(input, now).number, 2);
  assert.equal(
    reopened.database
      .prepare(
        'SELECT count(*) AS count FROM tasks WHERE deleted_at IS NOT NULL',
      )
      .get().count,
    1,
  );
});

test('renaming a completed task after travelling preserves its original completion day until it is reopened', (t) => {
  const { store, open } = setup(t);
  const previous = process.env.TZ;
  t.after(() => {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  });
  process.env.TZ = 'Europe/Kyiv';
  const finished = store.saveTask(
    { ...input, status: 'done' },
    new Date('2026-09-13T21:30:00Z'),
  );
  const completionRange = { from: '2026-09-14', to: '2026-09-14' };
  assert.equal(workspace(store, completionRange).statistics.completedCount, 1);
  process.env.TZ = 'UTC';
  const renamed = store.saveTask(
    { ...finished, title: 'Renamed' },
    new Date('2026-09-15T12:00:00Z'),
  );
  assert.equal(renamed.completedAt, finished.completedAt);
  assert.equal(workspace(store, completionRange).statistics.completedCount, 1);
  assert.equal(
    workspace(store, { from: '2026-09-13', to: '2026-09-13' }).statistics
      .completedCount,
    0,
  );
  store.close();
  const reopened = open();
  assert.equal(
    workspace(reopened, completionRange).statistics.completedCount,
    1,
  );
  reopened.setTaskStatus(finished.id, 'todo', now);
  assert.equal(
    workspace(reopened, completionRange).statistics.completedCount,
    0,
  );
  reopened.setTaskStatus(finished.id, 'done', new Date('2026-09-15T12:00:00Z'));
  assert.equal(
    workspace(reopened, { from: '2026-09-15', to: '2026-09-15' }).statistics
      .completedCount,
    1,
  );
});

test('successful generation windows skip repeated rule scans but refresh for day/range changes and mutations from either store connection', (t) => {
  const { store, open } = setup(t);
  const today = { from: '2026-09-13', to: '2026-09-13' };
  const task = store.saveTask(
    {
      ...input,
      scheduledDate: '2026-09-01',
      repeat: { frequency: 'weekly', days: [1, 2, 3, 4, 5, 6, 7], until: null },
    },
    now,
  );
  const prepare = store.database.prepare.bind(store.database);
  let scans = 0;
  t.mock.method(store.database, 'prepare', (sql) => {
    if (sql.includes('FROM task_recurrences WHERE enabled = 1')) scans += 1;
    return prepare(sql);
  });
  const first = workspace(store, today);
  assert.equal(scans, 1);
  assert.deepEqual(workspace(store, today), first);
  assert.equal(scans, 1);
  tracked(store, task.id, '2026-09-13T10:00:00Z', '2026-09-13T10:00:05Z');
  assert.equal(workspace(store, today).statistics.totalSeconds, 5);
  assert.equal(
    scans,
    1,
    'timer writes do not invalidate the recurrence window',
  );
  const historical = workspace(store, { from: '2026-09-02', to: '2026-09-02' });
  assert.ok(
    historical.tasks.some((value) => value.scheduledDate === '2026-09-02'),
  );
  const tomorrow = workspace(store, today, new Date('2026-09-14T12:00:00Z'));
  assert.ok(
    tomorrow.tasks.some((value) => value.scheduledDate === '2026-12-13'),
  );
  assert.equal(scans, 3);
  const deleted = first.tasks.find(
    (value) => value.scheduledDate === '2026-09-20',
  );
  store.deleteTask(deleted.id, now);
  assert.ok(
    !workspace(store, today).tasks.some((value) => value.id === deleted.id),
  );
  assert.equal(scans, 4);
  const other = open();
  const extra = other.saveTask(
    {
      ...input,
      scheduledDate: today.from,
      repeat: { frequency: 'weekly', days: [7], until: '2026-09-20' },
    },
    now,
  );
  const externallyChanged = workspace(store, today);
  assert.ok(
    externallyChanged.tasks.some(
      (value) =>
        value.recurrenceId === extra.recurrenceId &&
        value.scheduledDate === '2026-09-20',
    ),
  );
  assert.equal(
    scans,
    5,
    'another connection invalidates via SQLite data_version',
  );
  store.disableTaskRecurrence(extra.recurrenceId, now);
  assert.ok(
    !workspace(store, today).tasks.some(
      (value) =>
        value.recurrenceId === extra.recurrenceId &&
        value.scheduledDate === '2026-09-20',
    ),
  );
  assert.equal(scans, 6);
});

test('task/sprint validation rejects malformed inputs atomically and SQL payloads remain plain text', (t) => {
  const { store } = setup(t);
  const task = store.saveTask(input, now);
  for (const patch of [
    { title: '' },
    { title: 'x'.repeat(201) },
    { description: 'x'.repeat(10001) },
    { description: '\0' },
    { status: 'bad' },
    { priority: 'bad' },
    { scheduledDate: '2026-02-30' },
    { dueDate: '1899-12-31' },
    { dueDate: '2101-01-01' },
    { scheduledTime: '10:00' },
    { scheduledDate: '2026-09-13', scheduledTime: '24:00' },
    ...[0, 1441, 1.1, NaN, '5'].map((estimateMinutes) => ({ estimateMinutes })),
    { appIds: Array.from({ length: 21 }, () => 'a') },
    { appIds: ['x'.repeat(513)] },
    { appIds: [1] },
    { sprintId: crypto.randomUUID() },
    { id: crypto.randomUUID() },
    { repeat: { frequency: 'weekly', days: [1], until: null } },
    {
      scheduledDate: '2026-09-13',
      repeat: { frequency: 'weekly', days: [0], until: null },
    },
    {
      scheduledDate: '2026-09-13',
      repeat: { frequency: 'monthly', days: [32], until: null },
    },
    {
      scheduledDate: '2026-09-13',
      repeat: { frequency: 'monthly', days: [1], until: '2036-09-14' },
    },
  ])
    assert.throws(() => store.saveTask({ ...input, ...patch }, now), {
      code: 'invalidTask',
    });
  for (const value of [
    null,
    [],
    {},
    { ...sprint, endDate: '2026-08-01' },
    { ...sprint, endDate: '2027-09-02' },
    { ...sprint, status: 'done' },
  ])
    assert.throws(() => store.saveTaskSprint(value), { code: 'invalidSprint' });
  assert.deepEqual(workspace(store).tasks, [task]);
  const payload = "'); DROP TABLE tasks; --";
  const saved = store.saveTask(
    { ...input, title: payload, description: payload, appIds: [payload] },
    now,
  );
  assert.equal(saved.title, payload);
  assert.deepEqual(saved.appIds, [payload]);
  assert.equal(workspace(store).tasks.length, 2);
});

test('sprints aggregate attached live tasks across all time and deletion detaches tasks and future recurrence templates', (t) => {
  const { store } = setup(t);
  const savedSprint = store.saveTaskSprint(sprint);
  const task = store.saveTask(
    { ...input, sprintId: savedSprint.id, estimateMinutes: 20 },
    now,
  );
  store.setTaskStatus(task.id, 'done', now);
  tracked(store, task.id, '2026-08-01T10:00:00Z', '2026-08-01T10:00:10Z');
  const repeat = store.saveTask(
    {
      ...input,
      sprintId: savedSprint.id,
      scheduledDate: '2026-09-13',
      repeat: { frequency: 'weekly', days: [7], until: '2026-09-20' },
    },
    now,
  );
  const summary = workspace(store).sprints[0];
  assert.equal(summary.totalTasks, 3);
  assert.equal(summary.completedTasks, 1);
  assert.equal(summary.estimatedMinutes, 20);
  assert.equal(summary.trackedSeconds, 10);
  assert.equal(workspace(store).statistics.totalSeconds, 0);
  assert.equal(store.deleteTaskSprint(savedSprint.id), true);
  assert.equal(store.deleteTaskSprint(savedSprint.id), false);
  assert.equal(store.getTask(task.id).sprintId, null);
  assert.equal(store.getTask(repeat.id).sprintId, null);
  assert.equal(workspace(store).sprints.length, 0);
  assert.equal(
    JSON.parse(
      store.database.prepare('SELECT template_json FROM task_recurrences').get()
        .template_json,
    ).sprintId,
    null,
  );
});

test('weekly recurrences use ISO weekdays and keep independent occurrences and deletion tombstones across restart', (t) => {
  const { store, open } = setup(t);
  const initial = store.saveTask(
    {
      ...input,
      title: 'Repeat',
      scheduledDate: '2026-09-13',
      dueDate: '2026-09-15',
      repeat: { frequency: 'weekly', days: [1, 7], until: '2026-09-21' },
    },
    now,
  );
  let tasks = workspace(store).tasks.sort((a, b) =>
    a.scheduledDate.localeCompare(b.scheduledDate),
  );
  assert.deepEqual(
    tasks.map((task) => task.scheduledDate),
    ['2026-09-13', '2026-09-14', '2026-09-20', '2026-09-21'],
  );
  assert.equal(tasks[1].dueDate, '2026-09-16');
  store.setTaskStatus(tasks[1].id, 'done', now);
  store.saveTask(
    { ...tasks[2], title: 'Only this occurrence', scheduledDate: '2026-09-22' },
    now,
  );
  assert.throws(
    () =>
      store.saveTask(
        {
          ...tasks[2],
          repeat: { frequency: 'weekly', days: [2], until: null },
        },
        now,
      ),
    { code: 'invalidTask' },
  );
  store.deleteTask(tasks[3].id, now);
  const expected = workspace(store);
  assert.equal(expected.tasks.length, 3);
  assert.equal(
    expected.tasks.find((task) => task.id === initial.id).status,
    'todo',
  );
  assert.equal(expected.recurrences[0].title, 'Repeat');
  store.close();
  const reopened = open();
  assert.deepEqual(workspace(reopened), expected);
  assert.equal(
    reopened.database.prepare('SELECT count(*) AS count FROM tasks').get()
      .count,
    4,
  );
});

test('monthly rules skip absent month days, include leap day, and lazily materialize historical windows without backfilling all years', (t) => {
  const { store } = setup(t);
  const initial = store.saveTask(
    {
      ...input,
      scheduledDate: '2020-01-15',
      repeat: { frequency: 'monthly', days: [29, 31], until: '2026-03-31' },
    },
    now,
  );
  let state = workspace(store, { from: '2024-02-01', to: '2024-03-31' });
  assert.deepEqual(state.tasks.map((task) => task.scheduledDate).sort(), [
    '2020-01-15',
    '2024-02-29',
    '2024-03-29',
    '2024-03-31',
  ]);
  state = workspace(store, { from: '2025-02-01', to: '2025-03-31' });
  assert.ok(!state.tasks.some((task) => task.scheduledDate === '2025-02-29'));
  assert.equal(state.tasks.length, 6);
  assert.equal(
    state.tasks.find((task) => task.id === initial.id).scheduledDate,
    '2020-01-15',
  );
});

test('disabling recurrence removes only untouched future todo/backlog occurrences and keeps today, edited, started and done history', (t) => {
  const { store } = setup(t);
  const initial = store.saveTask(
    {
      ...input,
      scheduledDate: '2026-09-12',
      repeat: {
        frequency: 'weekly',
        days: [1, 2, 3, 4, 5, 6, 7],
        until: '2026-09-20',
      },
    },
    now,
  );
  const tasks = workspace(store).tasks;
  const on = (day) => tasks.find((task) => task.scheduledDate === day);
  store.saveTask({ ...on('2026-09-14'), title: 'Edited' }, now);
  store.setTaskStatus(on('2026-09-15').id, 'in-progress', now);
  store.setTaskStatus(on('2026-09-15').id, 'todo', now);
  store.setTaskStatus(on('2026-09-16').id, 'done', now);
  tracked(
    store,
    on('2026-09-17').id,
    '2026-09-13T10:00:00Z',
    '2026-09-13T10:00:05Z',
  );
  assert.equal(store.disableTaskRecurrence(initial.recurrenceId, now), true);
  assert.equal(store.disableTaskRecurrence(initial.recurrenceId, now), false);
  const state = workspace(store);
  assert.deepEqual(state.tasks.map((task) => task.scheduledDate).sort(), [
    '2026-09-12',
    '2026-09-13',
    '2026-09-14',
    '2026-09-15',
    '2026-09-16',
    '2026-09-17',
  ]);
  assert.equal(state.recurrences[0].enabled, false);
});

test('time checkpoints aggregate by task/day/app, split at local midnight, replay once and exclude deleted tasks from statistics', (t) => {
  const { store, open } = setup(t);
  const previous = process.env.TZ;
  process.env.TZ = 'Europe/Kyiv';
  t.after(() => {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  });
  const task = store.saveTask({ ...input, dueDate: '2026-09-12' }, now);
  const other = store.saveTask({ ...input, title: 'Other' }, now);
  const args = [
    task.id,
    '2026-09-12T20:59:55Z',
    '2026-09-12T21:00:05Z',
    'browser',
  ];
  assert.equal(tracked(store, ...args).trackedSeconds, 10);
  assert.equal(tracked(store, ...args).trackedSeconds, 10);
  tracked(
    store,
    task.id,
    '2026-09-13T10:00:00Z',
    '2026-09-13T10:00:05Z',
    'browser',
  );
  tracked(
    store,
    task.id,
    '2026-09-13T10:00:05Z',
    '2026-09-13T10:00:10Z',
    'browser',
  );
  tracked(store, other.id, '2026-09-13T10:00:00Z', '2026-09-13T10:00:03Z');
  assert.equal(
    store.database
      .prepare('SELECT count(*) AS count FROM task_time_daily')
      .get().count,
    3,
  );
  const state = workspace(store, { from: '2026-09-13', to: '2026-09-13' });
  assert.equal(state.statistics.totalSeconds, 18);
  assert.equal(state.statistics.overdueCount, 1);
  assert.equal(state.statistics.openCount, 2);
  assert.deepEqual(state.statistics.byApp, [
    { appId: 'browser', seconds: 15 },
    { appId: null, seconds: 3 },
  ]);
  assert.equal(state.statistics.byTask[0].seconds, 15);
  const expected = workspace(store);
  store.close();
  const reopened = open();
  assert.deepEqual(workspace(reopened), expected);
  reopened.deleteTask(task.id, now);
  assert.equal(workspace(reopened).statistics.totalSeconds, 3);
  assert.equal(
    reopened.database
      .prepare(
        'SELECT sum(seconds) AS seconds FROM task_time_daily WHERE task_id = ?',
      )
      .get(task.id).seconds,
    20,
  );
});

test('calendar recurrence and time allocation remain correct across DST and enforce inclusive 366-day ranges', (t) => {
  const { store } = setup(t);
  const previous = process.env.TZ;
  process.env.TZ = 'Europe/Kyiv';
  t.after(() => {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  });
  store.saveTask(
    {
      ...input,
      scheduledDate: '2026-10-18',
      repeat: { frequency: 'weekly', days: [7], until: '2026-11-01' },
    },
    now,
  );
  assert.deepEqual(
    workspace(store, { from: '2026-10-18', to: '2026-11-01' })
      .tasks.map((task) => task.scheduledDate)
      .sort(),
    ['2026-10-18', '2026-10-25', '2026-11-01'],
  );
  const task = store.saveTask(input, now);
  tracked(store, task.id, '2026-10-25T00:59:55Z', '2026-10-25T01:00:05Z');
  assert.equal(
    workspace(store, { from: '2026-10-25', to: '2026-10-25' }).statistics
      .totalSeconds,
    10,
  );
  assert.equal(
    workspace(store, { from: '2024-01-01', to: '2024-12-31' }).statistics.days
      .length,
    366,
  );
  assert.throws(
    () => workspace(store, { from: '2024-01-01', to: '2025-01-01' }),
    { code: 'invalidTask' },
  );
});

test('invalid time slices never alter statistics and a second-day failure rolls back both aggregates and retry receipt', (t) => {
  const { store } = setup(t);
  const task = store.saveTask(input, now);
  const base = {
    taskId: task.id,
    startedAt: '2026-09-13T10:00:00Z',
    endedAt: '2026-09-13T10:00:05Z',
    appId: null,
  };
  for (const patch of [
    { taskId: 'bad' },
    { appId: '' },
    { appId: 1 },
    { startedAt: '2026-02-30T10:00:00Z' },
    { endedAt: base.startedAt },
    { endedAt: '2026-09-13T10:00:31Z' },
    { endedAt: '2026-09-13' },
  ])
    assert.throws(() => store.addTaskTime({ ...base, ...patch }), {
      code: 'invalidTask',
    });
  const previous = process.env.TZ;
  process.env.TZ = 'UTC';
  t.after(() => {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  });
  t.mock.method(console, 'error', () => {});
  store.database.exec(
    "CREATE TRIGGER fail_time BEFORE INSERT ON task_time_daily WHEN NEW.day = '2026-09-14' BEGIN SELECT RAISE(ABORT, 'test failure'); END",
  );
  const slice = {
    ...base,
    startedAt: '2026-09-13T23:59:55Z',
    endedAt: '2026-09-14T00:00:05Z',
  };
  assert.throws(() => store.addTaskTime(slice), { code: 'storageSave' });
  assert.equal(store.getTask(task.id).trackedSeconds, 0);
  assert.equal(
    store.database
      .prepare('SELECT last_time_ended_at FROM tasks WHERE id = ?')
      .get(task.id).last_time_ended_at,
    null,
  );
  store.database.exec('DROP TRIGGER fail_time');
  assert.equal(store.addTaskTime(slice).trackedSeconds, 10);
});

test('failed recurrence creation and generation roll back every task and template', (t) => {
  const { store } = setup(t);
  t.mock.method(console, 'error', () => {});
  store.database.exec(
    "CREATE TRIGGER fail_task BEFORE INSERT ON tasks BEGIN SELECT RAISE(ABORT, 'test failure'); END",
  );
  const repeated = {
    ...input,
    scheduledDate: '2026-09-13',
    repeat: { frequency: 'weekly', days: [1, 7], until: '2026-09-21' },
  };
  assert.throws(() => store.saveTask(repeated, now), { code: 'storageSave' });
  assert.equal(
    store.database
      .prepare('SELECT count(*) AS count FROM task_recurrences')
      .get().count,
    0,
  );
  store.database.exec('DROP TRIGGER fail_task');
  store.saveTask(repeated, now);
  store.database.exec(
    "CREATE TRIGGER fail_task BEFORE INSERT ON tasks WHEN NEW.scheduled_date = '2026-09-20' BEGIN SELECT RAISE(ABORT, 'test failure'); END",
  );
  assert.throws(() => workspace(store), { code: 'storageSave' });
  assert.equal(
    store.database.prepare('SELECT count(*) AS count FROM tasks').get().count,
    1,
  );
  store.database.exec('DROP TRIGGER fail_task');
  assert.equal(
    workspace(store).tasks.length,
    4,
    'failed generation must not cache an incomplete window',
  );
});

test('the task cap leaves existing work readable without partially materializing recurrences', (t) => {
  const { store } = setup(t);
  store.saveTask(
    {
      ...input,
      scheduledDate: '2026-09-13',
      repeat: { frequency: 'weekly', days: [1, 7], until: '2026-09-21' },
    },
    now,
  );
  const insert = store.database.prepare(
    `INSERT INTO tasks (id, title, description, status, priority, app_ids_json, created_at, updated_at) VALUES (?, 'Filler', '', 'todo', 'none', '[]', ?, ?)`,
  );
  store.transaction(() => {
    for (let index = 1; index < 4999; index += 1)
      insert.run(crypto.randomUUID(), now.toISOString(), now.toISOString());
  });
  assert.equal(workspace(store).generationLimited, true);
  assert.equal(
    workspace(store).generationLimited,
    true,
    'limited generation must not cache an incomplete window',
  );
  assert.equal(
    store.database.prepare('SELECT count(*) AS count FROM tasks').get().count,
    4999,
  );
  store.saveTask(input, now);
  assert.throws(() => store.saveTask(input, now), { code: 'invalidTask' });
  assert.equal(workspace(store).tasks.length, 5000);
});

test('canonical migrations back up v8 and preserves existing settings, application/site history and limits', (t) => {
  const { store, open, directory, databasePath } = setup(t);
  store.updateSettings({ websiteTrackingEnabled: true });
  store.recordSample(
    { id: 'browser', name: 'Browser', site: { domain: 'example.com' } },
    45,
    true,
    now,
  );
  store.saveLimit({
    appId: 'browser',
    appName: 'Browser',
    limitMinutes: 20,
    warningMinutes: 5,
  });
  const original = structuredClone(store.data);
  store.close();
  const old = new DatabaseSync(databasePath);
  old.exec(
    `${dropTasks} ${dropFitness} DELETE FROM schema_migrations WHERE version >= 9; PRAGMA user_version = 8;`,
  );
  old.close();
  const migrated = open();
  assert.deepEqual(migrated.data, original);
  assert.equal(
    migrated.database.prepare('PRAGMA user_version').get().user_version,
    11,
  );
  assert.equal(workspace(migrated).tasks.length, 0);
  const files = fs
    .readdirSync(directory)
    .filter((file) => /\.backup-v8-\d+$/.test(file));
  assert.equal(files.length, 1);
  const backupPath = path.join(directory, files[0]);
  const backup = new DatabaseSync(backupPath, { readOnly: true });
  assert.equal(backup.prepare('PRAGMA user_version').get().user_version, 8);
  assert.equal(
    backup.prepare('SELECT seconds FROM site_usage').get().seconds,
    45,
  );
  backup.close();
  if (process.platform !== 'win32')
    assert.equal(fs.statSync(backupPath).mode & 0o777, 0o600);
  migrated.saveTask(input, now);
  migrated.close();
  assert.equal(workspace(open()).tasks.length, 1);
});

test('an unrecognized partial task schema leaves v8 data intact without applying migrations', (t) => {
  const { store, databasePath } = setup(t);
  store.recordSample({ id: 'app', name: 'App' }, 10, true, now);
  store.close();
  const old = new DatabaseSync(databasePath);
  old.exec(
    `DROP TABLE task_time_daily; DROP TABLE tasks; DROP TABLE task_sprints; ${dropFitness} DELETE FROM schema_migrations WHERE version >= 9; PRAGMA user_version = 8;`,
  );
  old.close();
  assert.throws(() => new UsageStore(databasePath), /Несумісна структура/);
  const unchanged = new DatabaseSync(databasePath, { readOnly: true });
  try {
    assert.equal(
      unchanged.prepare('PRAGMA user_version').get().user_version,
      8,
    );
    assert.equal(
      unchanged
        .prepare(
          "SELECT count(*) AS count FROM sqlite_master WHERE name = 'task_sprints'",
        )
        .get().count,
      0,
    );
    assert.equal(
      unchanged.prepare('SELECT seconds FROM usage_entries').get().seconds,
      10,
    );
  } finally {
    unchanged.close();
  }
});
