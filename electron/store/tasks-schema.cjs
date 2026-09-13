const dayCheck = (column) =>
  `length(${column}) = 10 AND ${column} BETWEEN '1900-01-01' AND '2100-12-31' AND ${column} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(${column}, '+0 days') IS NOT NULL AND date(${column}, '+0 days') = ${column}`;

module.exports = `
  CREATE TABLE task_sprints (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
    goal TEXT NOT NULL CHECK (length(goal) <= 10000),
    start_date TEXT NOT NULL CHECK (${dayCheck('start_date')}),
    end_date TEXT NOT NULL CHECK (${dayCheck('end_date')}),
    status TEXT NOT NULL CHECK (status IN ('planned', 'active', 'completed')),
    CHECK (end_date >= start_date AND julianday(end_date) - julianday(start_date) <= 365)
  ) STRICT;
  CREATE TABLE task_recurrences (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'monthly')),
    days_json TEXT NOT NULL CHECK (json_valid(days_json) AND json_type(days_json) = 'array'),
    start_date TEXT NOT NULL CHECK (${dayCheck('start_date')}),
    until_date TEXT CHECK (until_date IS NULL OR (${dayCheck('until_date')})),
    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    template_json TEXT NOT NULL CHECK (json_valid(template_json) AND json_type(template_json) = 'object'),
    CHECK (until_date IS NULL OR (until_date >= start_date AND until_date <= date(start_date, '+10 years')))
  ) STRICT;
  CREATE TABLE tasks (
    number INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
    description TEXT NOT NULL CHECK (length(description) <= 10000),
    status TEXT NOT NULL CHECK (status IN ('backlog', 'todo', 'in-progress', 'done', 'cancelled')),
    priority TEXT NOT NULL CHECK (priority IN ('none', 'low', 'medium', 'high', 'urgent')),
    scheduled_date TEXT CHECK (scheduled_date IS NULL OR (${dayCheck('scheduled_date')})),
    scheduled_time TEXT CHECK (scheduled_time IS NULL OR (scheduled_date IS NOT NULL AND length(scheduled_time) = 5 AND scheduled_time GLOB '[0-2][0-9]:[0-5][0-9]' AND scheduled_time <= '23:59')),
    due_date TEXT CHECK (due_date IS NULL OR (${dayCheck('due_date')})),
    estimate_minutes INTEGER CHECK (estimate_minutes BETWEEN 1 AND 1440),
    app_ids_json TEXT NOT NULL CHECK (json_valid(app_ids_json) AND json_type(app_ids_json) = 'array' AND json_array_length(app_ids_json) <= 20),
    sprint_id TEXT REFERENCES task_sprints(id) ON DELETE SET NULL,
    recurrence_id TEXT REFERENCES task_recurrences(id),
    recurrence_date TEXT CHECK (recurrence_date IS NULL OR (${dayCheck('recurrence_date')})),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT,
    completed_day TEXT CHECK (completed_day IS NULL OR (${dayCheck('completed_day')})),
    started_at TEXT,
    last_time_started_at TEXT,
    last_time_ended_at TEXT,
    edited INTEGER NOT NULL DEFAULT 0 CHECK (edited IN (0, 1)),
    deleted_at TEXT,
    CHECK ((status = 'done' AND completed_at IS NOT NULL AND completed_day IS NOT NULL) OR (status <> 'done' AND completed_at IS NULL AND completed_day IS NULL)),
    CHECK ((recurrence_id IS NULL AND recurrence_date IS NULL) OR (recurrence_id IS NOT NULL AND recurrence_date IS NOT NULL)),
    UNIQUE (recurrence_id, recurrence_date)
  ) STRICT;
  CREATE INDEX tasks_live_schedule ON tasks(deleted_at, scheduled_date);
  CREATE INDEX tasks_sprint ON tasks(sprint_id);
  CREATE TABLE task_time_daily (
    task_id TEXT NOT NULL REFERENCES tasks(id),
    day TEXT NOT NULL CHECK (${dayCheck('day')}),
    app_id TEXT NOT NULL DEFAULT '' CHECK (length(app_id) <= 512),
    seconds REAL NOT NULL CHECK (seconds > 0 AND seconds <= 9007199254740991),
    PRIMARY KEY (task_id, day, app_id)
  ) STRICT;
  CREATE INDEX task_time_daily_date ON task_time_daily(day);
`;
