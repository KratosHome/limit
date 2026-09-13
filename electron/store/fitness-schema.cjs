// Preserve the original fitness migration used before the task manager.
module.exports = `
CREATE TABLE fitness_daily (
  day TEXT PRIMARY KEY NOT NULL CHECK (
    length(day) = 10
    AND day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    AND day >= '1900-01-01'
    AND date(day, '+0 days') IS NOT NULL
    AND date(day, '+0 days') = day
  ),
  steps INTEGER CHECK (steps BETWEEN 0 AND 200000),
  exercise_minutes REAL CHECK (exercise_minutes BETWEEN 0 AND 1440),
  distance_km REAL CHECK (distance_km BETWEEN 0 AND 1000),
  note TEXT NOT NULL DEFAULT '' CHECK (
    length(note) <= 500 AND instr(note, char(0)) = 0
  ),
  source TEXT NOT NULL CHECK (source IN ('manual', 'apple-health')),
  updated_at TEXT NOT NULL,
  CHECK (steps IS NOT NULL OR exercise_minutes IS NOT NULL OR distance_km IS NOT NULL)
) STRICT;

CREATE TABLE fitness_preferences (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  show_steps INTEGER NOT NULL DEFAULT 0 CHECK (show_steps IN (0, 1)),
  show_exercise INTEGER NOT NULL DEFAULT 0 CHECK (show_exercise IN (0, 1))
) STRICT;
INSERT INTO fitness_preferences (id) VALUES (1);
`;
