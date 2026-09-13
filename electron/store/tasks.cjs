const { randomUUID } = require('node:crypto');
const { AppError, ERROR_CODES } = require('../errors.cjs');
const { localDay } = require('./date-utils.cjs');
const MAX_TASKS = 5000;
const generationCaches = new WeakMap();
function invalidateGeneration(store) {
  generationCaches.delete(store);
}
const STATUSES = ['backlog', 'todo', 'in-progress', 'done', 'cancelled'];
const PRIORITIES = ['none', 'low', 'medium', 'high', 'urgent'];
const taskColumns = `t.id, t.number, t.title, t.description, t.status, t.priority,
  t.scheduled_date AS scheduledDate, t.scheduled_time AS scheduledTime, t.due_date AS dueDate,
  t.estimate_minutes AS estimateMinutes, t.app_ids_json AS appIds, t.sprint_id AS sprintId,
  t.recurrence_id AS recurrenceId, t.created_at AS createdAt, t.updated_at AS updatedAt,
  t.completed_at AS completedAt, COALESCE((SELECT SUM(seconds) FROM task_time_daily WHERE task_id = t.id), 0) AS trackedSeconds`;

function invalid(code = ERROR_CODES.INVALID_TASK) {
  throw new AppError(code);
}
function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}
function id(value) {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    invalid();
  return value.toLowerCase();
}
function text(value, maximum, required = false) {
  if (typeof value !== 'string' || value.includes('\0')) invalid();
  const result = value.trim();
  if (result.length > maximum || (required && !result)) invalid();
  return result;
}
function date(value) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value < '1900-01-01' ||
    value > '2100-12-31'
  )
    invalid();
  const parsed = new Date(`${value}T12:00:00Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  )
    invalid();
  return value;
}
function addDays(day, count) {
  const value = new Date(`${day}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0, 10);
}
function range(input) {
  if (!object(input)) invalid();
  const from = date(input.from);
  const to = date(input.to);
  if (to < from || to > addDays(from, 365)) invalid();
  return { from, to };
}
function timestamp(now) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) invalid();
  date(localDay(now));
  return now.toISOString();
}
function mapTask(row) {
  return row ? { ...row, appIds: JSON.parse(row.appIds) } : null;
}
function getTask(store, input) {
  return mapTask(
    store.database
      .prepare(
        `SELECT ${taskColumns} FROM tasks t WHERE t.id = ? AND t.deleted_at IS NULL`,
      )
      .get(id(input)),
  );
}
function normalizeTask(store, input) {
  if (
    !object(input) ||
    !STATUSES.includes(input.status) ||
    !PRIORITIES.includes(input.priority)
  )
    invalid();
  const task = {
    title: text(input.title, 200, true),
    description: text(input.description, 10000),
    status: input.status,
    priority: input.priority,
    scheduledDate:
      input.scheduledDate === null ? null : date(input.scheduledDate),
    scheduledTime: input.scheduledTime,
    dueDate: input.dueDate === null ? null : date(input.dueDate),
    estimateMinutes: input.estimateMinutes,
    appIds: input.appIds,
    sprintId: input.sprintId === null ? null : id(input.sprintId),
  };
  if (
    task.scheduledTime !== null &&
    (typeof task.scheduledTime !== 'string' ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(task.scheduledTime) ||
      !task.scheduledDate)
  )
    invalid();
  if (
    task.estimateMinutes !== null &&
    (!Number.isInteger(task.estimateMinutes) ||
      task.estimateMinutes < 1 ||
      task.estimateMinutes > 1440)
  )
    invalid();
  if (!Array.isArray(task.appIds) || task.appIds.length > 20) invalid();
  task.appIds = [
    ...new Set(task.appIds.map((value) => text(value, 512, true))),
  ];
  if (
    task.sprintId &&
    !store.database
      .prepare('SELECT 1 FROM task_sprints WHERE id = ?')
      .get(task.sprintId)
  )
    invalid();
  return task;
}
function normalizeRepeat(input, startDate) {
  if (
    !object(input) ||
    !['weekly', 'monthly'].includes(input.frequency) ||
    !startDate ||
    !Array.isArray(input.days) ||
    !input.days.length ||
    input.days.length > (input.frequency === 'weekly' ? 7 : 31)
  )
    invalid();
  const maximum = input.frequency === 'weekly' ? 7 : 31;
  if (
    input.days.some((day) => !Number.isInteger(day) || day < 1 || day > maximum)
  )
    invalid();
  const until = input.until === null ? null : date(input.until);
  const latest = new Date(`${startDate}T12:00:00Z`);
  latest.setUTCFullYear(latest.getUTCFullYear() + 10);
  if (until && (until < startDate || until > latest.toISOString().slice(0, 10)))
    invalid();
  return {
    frequency: input.frequency,
    days: [...new Set(input.days)].sort((a, b) => a - b),
    until,
  };
}
function insertTask(store, task, now, recurrenceId = null) {
  const taskId = randomUUID();
  const at = timestamp(now);
  store.database
    .prepare(
      `INSERT INTO tasks (id, title, description, status, priority, scheduled_date, scheduled_time, due_date, estimate_minutes, app_ids_json, sprint_id, recurrence_id, recurrence_date, created_at, updated_at, completed_at, completed_day, started_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      taskId,
      task.title,
      task.description,
      task.status,
      task.priority,
      task.scheduledDate,
      task.scheduledTime,
      task.dueDate,
      task.estimateMinutes,
      JSON.stringify(task.appIds),
      task.sprintId,
      recurrenceId,
      recurrenceId ? task.scheduledDate : null,
      at,
      at,
      task.status === 'done' ? at : null,
      task.status === 'done' ? localDay(now) : null,
      task.status === 'in-progress' ? at : null,
    );
  return taskId;
}
function saveTask(store, input, now = new Date()) {
  const task = normalizeTask(store, input);
  const at = timestamp(now);
  const existing = input.id === undefined ? null : getTask(store, input.id);
  if (input.id !== undefined && !existing) invalid();
  if (existing && input.repeat != null) invalid();
  const repeat =
    !existing && input.repeat != null
      ? normalizeRepeat(input.repeat, task.scheduledDate)
      : null;
  if (
    !existing &&
    store.database.prepare('SELECT count(*) AS count FROM tasks').get().count >=
      MAX_TASKS
  )
    invalid();
  const taskId = store.transaction(() => {
    if (existing) {
      const completedAt =
        task.status === 'done' ? existing.completedAt || at : null;
      // Renaming an already completed task must not move its historical day
      // when the user has since travelled to another timezone.
      const completedDay = completedAt
        ? existing.completedAt
          ? store.database
              .prepare('SELECT completed_day FROM tasks WHERE id = ?')
              .get(existing.id).completed_day
          : localDay(now)
        : null;
      store.database
        .prepare(
          `UPDATE tasks SET title = ?, description = ?, status = ?, priority = ?, scheduled_date = ?, scheduled_time = ?, due_date = ?, estimate_minutes = ?, app_ids_json = ?, sprint_id = ?, updated_at = ?, completed_at = ?, completed_day = ?, edited = 1,
        started_at = CASE WHEN ? = 'in-progress' THEN COALESCE(started_at, ?) ELSE started_at END WHERE id = ? AND deleted_at IS NULL`,
        )
        .run(
          task.title,
          task.description,
          task.status,
          task.priority,
          task.scheduledDate,
          task.scheduledTime,
          task.dueDate,
          task.estimateMinutes,
          JSON.stringify(task.appIds),
          task.sprintId,
          at,
          completedAt,
          completedDay,
          task.status,
          at,
          existing.id,
        );
      return existing.id;
    }
    let recurrenceId = null;
    if (repeat) {
      recurrenceId = randomUUID();
      store.database
        .prepare(
          'INSERT INTO task_recurrences (id, title, frequency, days_json, start_date, until_date, template_json) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          recurrenceId,
          task.title,
          repeat.frequency,
          JSON.stringify(repeat.days),
          task.scheduledDate,
          repeat.until,
          JSON.stringify({
            ...task,
            status: task.status === 'backlog' ? 'backlog' : 'todo',
          }),
        );
    }
    return insertTask(store, task, now, recurrenceId);
  });
  invalidateGeneration(store);
  return getTask(store, taskId);
}
function setTaskStatus(store, inputId, status, now = new Date()) {
  const task = getTask(store, inputId);
  if (!task || !STATUSES.includes(status)) invalid();
  return saveTask(store, { ...task, status }, now);
}
function deleteTask(store, inputId, now = new Date()) {
  const taskId = id(inputId);
  const at = timestamp(now);
  const deleted = store.transaction(
    () =>
      store.database
        .prepare(
          'UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
        )
        .run(at, at, taskId).changes > 0,
  );
  invalidateGeneration(store);
  return deleted;
}
function getSprints(store) {
  return store.database
    .prepare(
      `SELECT s.id, s.name, s.goal, s.start_date AS startDate, s.end_date AS endDate, s.status,
    COUNT(t.id) AS totalTasks, COALESCE(SUM(t.status = 'done'), 0) AS completedTasks,
    COALESCE(SUM(t.estimate_minutes), 0) AS estimatedMinutes,
    COALESCE(SUM((SELECT SUM(seconds) FROM task_time_daily WHERE task_id = t.id)), 0) AS trackedSeconds
    FROM task_sprints s LEFT JOIN tasks t ON t.sprint_id = s.id AND t.deleted_at IS NULL GROUP BY s.id ORDER BY s.start_date, s.id`,
    )
    .all()
    .map((row) => ({ ...row }));
}
function saveTaskSprint(store, input) {
  let normalized;
  try {
    if (
      !object(input) ||
      !['planned', 'active', 'completed'].includes(input.status)
    )
      invalid();
    const dates = range({ from: input.startDate, to: input.endDate });
    normalized = {
      id: input.id === undefined ? randomUUID() : id(input.id),
      name: text(input.name, 200, true),
      goal: text(input.goal, 10000),
      startDate: dates.from,
      endDate: dates.to,
      status: input.status,
    };
    if (
      input.id !== undefined &&
      !store.database
        .prepare('SELECT 1 FROM task_sprints WHERE id = ?')
        .get(normalized.id)
    )
      invalid();
  } catch (error) {
    if (error.code === ERROR_CODES.INVALID_TASK)
      invalid(ERROR_CODES.INVALID_SPRINT);
    throw error;
  }
  store.transaction(() =>
    store.database
      .prepare(
        `INSERT INTO task_sprints (id, name, goal, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, goal = excluded.goal, start_date = excluded.start_date, end_date = excluded.end_date, status = excluded.status`,
      )
      .run(
        normalized.id,
        normalized.name,
        normalized.goal,
        normalized.startDate,
        normalized.endDate,
        normalized.status,
      ),
  );
  invalidateGeneration(store);
  return getSprints(store).find((sprint) => sprint.id === normalized.id);
}
function deleteTaskSprint(store, inputId) {
  const sprintId = id(inputId);
  const deleted = store.transaction(() => {
    store.database
      .prepare(
        `UPDATE task_recurrences SET template_json = json_set(template_json, '$.sprintId', NULL) WHERE json_extract(template_json, '$.sprintId') = ?`,
      )
      .run(sprintId);
    return (
      store.database
        .prepare('DELETE FROM task_sprints WHERE id = ?')
        .run(sprintId).changes > 0
    );
  });
  invalidateGeneration(store);
  return deleted;
}
function disableTaskRecurrence(store, inputId, now = new Date()) {
  const recurrenceId = id(inputId);
  const at = timestamp(now);
  const today = localDay(now);
  const disabled = store.transaction(() => {
    const changed =
      store.database
        .prepare(
          'UPDATE task_recurrences SET enabled = 0 WHERE id = ? AND enabled = 1',
        )
        .run(recurrenceId).changes > 0;
    if (changed)
      store.database
        .prepare(
          `UPDATE tasks SET deleted_at = ?, updated_at = ? WHERE recurrence_id = ? AND scheduled_date > ? AND deleted_at IS NULL AND status IN ('backlog', 'todo') AND edited = 0 AND started_at IS NULL AND NOT EXISTS (SELECT 1 FROM task_time_daily WHERE task_id = tasks.id)`,
        )
        .run(at, at, recurrenceId, today);
    return changed;
  });
  invalidateGeneration(store);
  return disabled;
}
function generateOccurrences(store, dates, now) {
  const today = localDay(now);
  date(today);
  // Timer checkpoints do not change recurrence rules. Remember successful
  // windows, but refresh after task mutations, day/range changes, or a commit
  // from another SQLite connection (including another store instance).
  const dataVersion = store.database
    .prepare('PRAGMA data_version')
    .get().data_version;
  let cache = generationCaches.get(store);
  if (!cache || cache.dataVersion !== dataVersion) {
    cache = { dataVersion, windows: new Set() };
    generationCaches.set(store, cache);
  }
  const cacheKey = `${today}:${dates.from}:${dates.to}`;
  if (cache.windows.has(cacheKey)) return false;
  const rolling = {
    from: today,
    to: [addDays(today, 90), '2100-12-31'].sort()[0],
  };
  const candidates = [];
  const remaining =
    MAX_TASKS -
    store.database.prepare('SELECT count(*) AS count FROM tasks').get().count;
  for (const recurrence of store.database
    .prepare('SELECT * FROM task_recurrences WHERE enabled = 1')
    .all()) {
    const template = JSON.parse(recurrence.template_json);
    const ruleDays = JSON.parse(recurrence.days_json);
    const existing = new Set(
      store.database
        .prepare('SELECT recurrence_date FROM tasks WHERE recurrence_id = ?')
        .all(recurrence.id)
        .map((row) => row.recurrence_date),
    );
    for (const window of [dates, rolling]) {
      const from = [window.from, recurrence.start_date].sort().at(-1);
      const to = [window.to, recurrence.until_date || '2100-12-31'].sort()[0];
      for (let day = from; day <= to; day = addDays(day, 1)) {
        const value = new Date(`${day}T12:00:00Z`);
        const matches = ruleDays.includes(
          recurrence.frequency === 'weekly'
            ? value.getUTCDay() || 7
            : value.getUTCDate(),
        );
        if (!matches || existing.has(day)) continue;
        existing.add(day);
        if (candidates.length >= remaining) return true;
        let dueDate = null;
        if (template.dueDate) {
          const offset = Math.round(
            (Date.parse(`${template.dueDate}T12:00Z`) -
              Date.parse(`${recurrence.start_date}T12:00Z`)) /
              86400000,
          );
          dueDate = addDays(day, offset);
          if (dueDate < '1900-01-01' || dueDate > '2100-12-31') dueDate = null;
        }
        candidates.push({
          task: { ...template, scheduledDate: day, dueDate },
          recurrenceId: recurrence.id,
        });
      }
    }
  }
  if (candidates.length)
    store.transaction(() => {
      for (const value of candidates)
        insertTask(store, value.task, now, value.recurrenceId);
    });
  cache.windows.add(cacheKey);
  if (cache.windows.size > 32)
    cache.windows.delete(cache.windows.values().next().value);
  return false;
}
function addTaskTime(store, input) {
  if (!object(input)) invalid();
  const taskId = id(input.taskId);
  const appId = input.appId === null ? null : text(input.appId, 512, true);
  const parseInstant = (value) => {
    if (
      typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)
    )
      invalid();
    date(value.slice(0, 10));
    const parsed = new Date(value);
    if (
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 19) !== value.slice(0, 19)
    )
      invalid();
    return parsed;
  };
  const start = parseInstant(input.startedAt);
  const end = parseInstant(input.endedAt);
  const seconds = (end - start) / 1000;
  if (seconds <= 0 || seconds > 30) invalid();
  const task = getTask(store, taskId);
  if (!task) return null;
  const chunks = [];
  let cursor = start;
  while (cursor < end) {
    const midnight = new Date(cursor);
    midnight.setHours(24, 0, 0, 0);
    const finish = Math.min(midnight.getTime(), end.getTime());
    chunks.push({
      day: date(localDay(cursor)),
      seconds: (finish - cursor.getTime()) / 1000,
    });
    cursor = new Date(finish);
  }
  store.transaction(() => {
    const current = store.database
      .prepare(
        'SELECT last_time_started_at, last_time_ended_at, deleted_at FROM tasks WHERE id = ?',
      )
      .get(taskId);
    if (
      !current ||
      current.deleted_at ||
      (current.last_time_started_at === start.toISOString() &&
        current.last_time_ended_at === end.toISOString())
    )
      return;
    const insertDay = store.database.prepare(
      'INSERT INTO task_time_daily (task_id, day, app_id, seconds) VALUES (?, ?, ?, ?) ON CONFLICT(task_id, day, app_id) DO UPDATE SET seconds = seconds + excluded.seconds',
    );
    for (const chunk of chunks)
      insertDay.run(taskId, chunk.day, appId || '', chunk.seconds);
    store.database
      .prepare(
        'UPDATE tasks SET started_at = COALESCE(started_at, ?), updated_at = ?, last_time_started_at = ?, last_time_ended_at = ? WHERE id = ?',
      )
      .run(
        start.toISOString(),
        end.toISOString(),
        start.toISOString(),
        end.toISOString(),
        taskId,
      );
  });
  return getTask(store, taskId);
}
function getTaskWorkspace(store, input, now = new Date()) {
  const dates = range(input);
  timestamp(now);
  const generationLimited = generateOccurrences(store, dates, now);
  const tasks = store.database
    .prepare(
      `SELECT ${taskColumns} FROM tasks t WHERE t.deleted_at IS NULL ORDER BY t.number DESC`,
    )
    .all()
    .map(mapTask);
  const time = store.database
    .prepare(
      `SELECT d.day, d.seconds, NULLIF(d.app_id, '') AS appId, t.id AS taskId, t.title FROM task_time_daily d JOIN tasks t ON t.id = d.task_id WHERE t.deleted_at IS NULL AND d.day BETWEEN ? AND ?`,
    )
    .all(dates.from, dates.to);
  const dayStats = new Map();
  for (let day = dates.from; day <= dates.to; day = addDays(day, 1))
    dayStats.set(day, { day, seconds: 0, completed: 0 });
  const byTask = new Map();
  const byApp = new Map();
  let totalSeconds = 0;
  for (const row of time) {
    totalSeconds += row.seconds;
    dayStats.get(row.day).seconds += row.seconds;
    const entry = byTask.get(row.taskId) || {
      taskId: row.taskId,
      title: row.title,
      seconds: 0,
    };
    entry.seconds += row.seconds;
    byTask.set(row.taskId, entry);
    byApp.set(row.appId, (byApp.get(row.appId) || 0) + row.seconds);
  }
  let completedCount = 0;
  for (const row of store.database
    .prepare(
      "SELECT completed_day AS day, count(*) AS count FROM tasks WHERE deleted_at IS NULL AND status = 'done' AND completed_day BETWEEN ? AND ? GROUP BY completed_day",
    )
    .all(dates.from, dates.to)) {
    completedCount += row.count;
    dayStats.get(row.day).completed = row.count;
  }
  const open = tasks.filter(
    (task) => !['done', 'cancelled'].includes(task.status),
  );
  const recurrences = store.database
    .prepare(
      'SELECT id, title, frequency, days_json AS days, start_date AS startDate, until_date AS until, enabled FROM task_recurrences ORDER BY start_date, id',
    )
    .all()
    .map((row) => ({
      ...row,
      days: JSON.parse(row.days),
      enabled: Boolean(row.enabled),
    }));
  return {
    tasks,
    sprints: getSprints(store),
    recurrences,
    generationLimited,
    statistics: {
      range: dates,
      totalSeconds,
      completedCount,
      openCount: open.length,
      overdueCount: open.filter(
        (task) => task.dueDate && task.dueDate < localDay(now),
      ).length,
      days: [...dayStats.values()],
      byTask: [...byTask.values()].sort(
        (a, b) => b.seconds - a.seconds || a.taskId.localeCompare(b.taskId),
      ),
      byApp: [...byApp]
        .map(([appId, seconds]) => ({ appId, seconds }))
        .sort(
          (a, b) =>
            b.seconds - a.seconds ||
            (a.appId || '').localeCompare(b.appId || ''),
        ),
    },
  };
}
module.exports = {
  getTaskWorkspace,
  getTask,
  saveTask,
  setTaskStatus,
  deleteTask,
  saveTaskSprint,
  deleteTaskSprint,
  disableTaskRecurrence,
  addTaskTime,
};
