const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const source = ts.transpileModule(
  fs.readFileSync(path.join(__dirname, '../../src/lib/task-day.ts'), 'utf8'),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  },
).outputText;
const modelModule = { exports: {} };
vm.runInNewContext(source, {
  module: modelModule,
  exports: modelModule.exports,
});
const { buildTaskDayModel } = modelModule.exports;
const DAY = '2026-09-13';
const plain = (value) => JSON.parse(JSON.stringify(value));
const ids = (tasks) => Array.from(tasks, (task) => task.id);

function task(id, patch = {}) {
  return {
    id,
    number: 1,
    title: id,
    description: '',
    status: 'todo',
    priority: 'none',
    scheduledDate: DAY,
    scheduledTime: null,
    dueDate: null,
    estimateMinutes: null,
    appIds: [],
    sprintId: null,
    recurrenceId: null,
    createdAt: `${DAY}T00:00:00.000Z`,
    updatedAt: `${DAY}T00:00:00.000Z`,
    completedAt: null,
    trackedSeconds: 99999,
    ...patch,
  };
}

function statistics(patch = {}) {
  return {
    range: { from: DAY, to: DAY },
    totalSeconds: 0,
    completedCount: 100,
    openCount: 100,
    overdueCount: 100,
    days: [],
    byTask: [],
    byApp: [],
    ...patch,
  };
}

test('day plan separates open backlog, excluded dates and cancelled tasks while counting done tasks', () => {
  const model = buildTaskDayModel(
    [
      task('timed', { scheduledTime: '08:00', estimateMinutes: 45 }),
      task('done', { status: 'done', estimateMinutes: 20 }),
      task('untimed', { status: 'backlog' }),
      task('cancelled', { status: 'cancelled', estimateMinutes: 1440 }),
      task('yesterday', { scheduledDate: '2026-09-12' }),
      task('tomorrow', { scheduledDate: '2026-09-14' }),
      task('backlog', { scheduledDate: null, status: 'backlog' }),
      task('active-undated', { scheduledDate: null, status: 'in-progress' }),
      task('done-undated', { scheduledDate: null, status: 'done' }),
      task('cancelled-undated', { scheduledDate: null, status: 'cancelled' }),
    ],
    statistics(),
    DAY,
  );
  assert.deepEqual(ids(model.plannedTasks), ['timed', 'done', 'untimed']);
  assert.deepEqual(ids(model.unscheduledTasks), ['done', 'untimed']);
  assert.deepEqual(ids(model.unplannedBacklog), ['backlog', 'active-undated']);
  assert.equal(model.completedCount, 1);
  assert.equal(model.openCount, 2);
  assert.equal(model.totalEstimatedSeconds, 65 * 60);
  assert.equal(model.unionScheduledMinutes, 45);
});

test('tracked time comes only from the selected day statistics, including activity outside the plan', () => {
  const model = buildTaskDayModel(
    [
      task('timed', { scheduledTime: '08:00' }),
      task('untimed'),
      task('no-time'),
      task('cancelled', { status: 'cancelled' }),
      task('other-day', { scheduledDate: '2026-09-12' }),
    ],
    statistics({
      totalSeconds: 420,
      byTask: [
        { taskId: 'timed', title: 'timed', seconds: 60 },
        { taskId: 'untimed', title: 'untimed', seconds: 120 },
        { taskId: 'cancelled', title: 'cancelled', seconds: 30 },
        { taskId: 'other-day', title: 'other-day', seconds: 210 },
      ],
    }),
    DAY,
  );
  assert.equal(model.dayTimeKnown, true);
  assert.equal(model.totalDayTrackedSeconds, 420);
  assert.equal(model.plannedTrackedSeconds, 180);
  assert.equal(model.outsidePlanSeconds, 240);
  assert.equal(model.scheduledBlocks[0].trackedSeconds, 60);
  assert.equal(model.actualByTask.untimed, 120);
  assert.equal(model.actualByTask['no-time'], undefined);
});

test('a multi-day or other-day response has unknown day time, never lifetime or aggregate time', () => {
  const tasks = [
    task('planned', { scheduledTime: '12:00', estimateMinutes: 15 }),
  ];
  for (const range of [
    { from: '2026-09-12', to: DAY },
    { from: DAY, to: '2026-09-14' },
    { from: '2026-09-12', to: '2026-09-12' },
  ]) {
    const model = buildTaskDayModel(
      tasks,
      statistics({
        range,
        totalSeconds: 9000,
        byTask: [{ taskId: 'planned', title: 'planned', seconds: 9000 }],
        days: [{ day: DAY, seconds: 9000, completed: 1 }],
      }),
      DAY,
    );
    assert.equal(model.dayTimeKnown, false);
    assert.equal(model.totalDayTrackedSeconds, null);
    assert.equal(model.plannedTrackedSeconds, null);
    assert.equal(model.outsidePlanSeconds, null);
    assert.equal(model.scheduledBlocks[0].trackedSeconds, null);
    assert.deepEqual(plain(model.actualByTask), {});
    assert.equal(model.totalEstimatedSeconds, 900);
  }
});

test('conflicts detect containment and chains but not adjacent or unknown-duration blocks', () => {
  const model = buildTaskDayModel(
    [
      task('chain-end', { scheduledTime: '12:00', estimateMinutes: 60 }),
      task('inside', { scheduledTime: '10:00', estimateMinutes: 15 }),
      task('adjacent', { scheduledTime: '13:00', estimateMinutes: 30 }),
      task('outer', { scheduledTime: '09:00', estimateMinutes: 180 }),
      task('point', { scheduledTime: '11:00' }),
      task('chain-mid', { scheduledTime: '11:30', estimateMinutes: 60 }),
      task('cancelled', {
        scheduledTime: '13:00',
        estimateMinutes: 60,
        status: 'cancelled',
      }),
    ],
    statistics(),
    DAY,
  );
  assert.deepEqual(Array.from(model.conflictTaskIds), [
    'outer',
    'inside',
    'chain-mid',
    'chain-end',
  ]);
  assert.equal(model.unionScheduledMinutes, 270);
  const point = model.scheduledBlocks.find(
    (block) => block.task.id === 'point',
  );
  assert.equal(point.estimated, false);
  assert.equal(point.startMinutes, 660);
  assert.equal(point.endMinutes, 660);
  assert.equal(point.visibleEndMinutes, 660);
});

test('cross-midnight estimates retain their full duration but union and drawing stop at midnight', () => {
  const model = buildTaskDayModel(
    [
      task('late', { scheduledTime: '23:30', estimateMinutes: 120 }),
      task('inside', { scheduledTime: '23:45', estimateMinutes: 30 }),
      task('next-day', {
        scheduledDate: '2026-09-14',
        scheduledTime: '00:00',
        estimateMinutes: 60,
      }),
    ],
    statistics(),
    DAY,
  );
  assert.deepEqual(
    plain(
      model.scheduledBlocks.map(
        ({ startMinutes, endMinutes, visibleEndMinutes, estimated }) => ({
          startMinutes,
          endMinutes,
          visibleEndMinutes,
          estimated,
        }),
      ),
    ),
    [
      {
        startMinutes: 1410,
        endMinutes: 1530,
        visibleEndMinutes: 1440,
        estimated: true,
      },
      {
        startMinutes: 1425,
        endMinutes: 1455,
        visibleEndMinutes: 1440,
        estimated: true,
      },
    ],
  );
  assert.equal(model.totalEstimatedSeconds, 150 * 60);
  assert.equal(model.unionScheduledMinutes, 30);
  assert.deepEqual(Array.from(model.conflictTaskIds), ['late', 'inside']);
});

test('empty and unestimated days retain zero versus unknown and never invent durations', () => {
  const empty = buildTaskDayModel([], statistics(), DAY);
  assert.equal(empty.dayTimeKnown, true);
  assert.equal(empty.totalDayTrackedSeconds, 0);
  assert.equal(empty.plannedTrackedSeconds, 0);
  assert.equal(empty.outsidePlanSeconds, 0);
  assert.equal(empty.completedCount, 0);
  assert.equal(empty.openCount, 0);
  const model = buildTaskDayModel(
    [
      task('first', { scheduledTime: '00:00' }),
      task('last', { scheduledTime: '23:59' }),
    ],
    statistics(),
    DAY,
  );
  assert.equal(model.totalEstimatedSeconds, 0);
  assert.equal(model.unionScheduledMinutes, 0);
  assert.equal(model.scheduledBlocks[1].endMinutes, 1439);
  assert.equal(model.scheduledBlocks[1].trackedSeconds, 0);
  assert.deepEqual(Array.from(model.conflictTaskIds), []);
});

test('day coordinates remain local wall-clock minutes on DST dates and inputs stay untouched', () => {
  for (const day of ['2026-03-29', '2026-10-25']) {
    const tasks = [
      task('later', {
        number: 2,
        scheduledDate: day,
        scheduledTime: '03:30',
        estimateMinutes: 90,
      }),
      task('earlier', {
        number: 1,
        scheduledDate: day,
        scheduledTime: '03:30',
        estimateMinutes: 30,
      }),
    ];
    const stats = statistics({ range: { from: day, to: day } });
    const before = JSON.stringify({ tasks, stats });
    tasks.forEach(Object.freeze);
    Object.freeze(tasks);
    Object.freeze(stats);
    const model = buildTaskDayModel(tasks, stats, day);
    assert.deepEqual(ids(model.scheduledBlocks.map((block) => block.task)), [
      'earlier',
      'later',
    ]);
    assert.equal(model.scheduledBlocks[0].startMinutes, 210);
    assert.equal(model.scheduledBlocks[1].endMinutes, 300);
    assert.equal(model.unionScheduledMinutes, 90);
    assert.equal(JSON.stringify({ tasks, stats }), before);
  }
});
