const { randomUUID } = require('node:crypto');

// Preserve paired-device configuration when upgrading earlier development builds.
const healthSyncSchema = `
CREATE TABLE health_sync_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  server_id TEXT NOT NULL CHECK (
    length(server_id) = 36
    AND substr(server_id, 9, 1) = '-' AND substr(server_id, 14, 1) = '-'
    AND substr(server_id, 19, 1) = '-' AND substr(server_id, 24, 1) = '-'
    AND length(replace(server_id, '-', '')) = 32
    AND replace(server_id, '-', '') NOT GLOB '*[^0-9a-f]*'
  ),
  device_id TEXT CHECK (
    length(device_id) = 36
    AND substr(device_id, 9, 1) = '-' AND substr(device_id, 14, 1) = '-'
    AND substr(device_id, 19, 1) = '-' AND substr(device_id, 24, 1) = '-'
    AND length(replace(device_id, '-', '')) = 32
    AND replace(device_id, '-', '') NOT GLOB '*[^0-9a-f]*'
  ),
  device_name TEXT CHECK (length(device_name) BETWEEN 1 AND 100 AND instr(device_name, char(0)) = 0),
  encrypted_key TEXT CHECK (
    length(encrypted_key) BETWEEN 4 AND 16384
    AND length(encrypted_key) % 4 = 0
    AND encrypted_key NOT GLOB '*[^A-Za-z0-9+/=]*'
  ),
  last_sequence INTEGER NOT NULL DEFAULT 0 CHECK (last_sequence BETWEEN 0 AND 9007199254740991),
  last_synced_at TEXT CHECK (last_synced_at IS NULL OR (length(last_synced_at) BETWEEN 20 AND 30 AND datetime(last_synced_at) IS NOT NULL)),
  CHECK (
    (device_id IS NULL AND device_name IS NULL AND encrypted_key IS NULL AND last_sequence = 0 AND last_synced_at IS NULL)
    OR (device_id IS NOT NULL AND device_name IS NOT NULL AND encrypted_key IS NOT NULL)
  )
) STRICT;
CREATE TABLE fitness_sync_deleted (
  day TEXT PRIMARY KEY NOT NULL CHECK (
    length(day) = 10
    AND day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    AND day >= '1900-01-01'
    AND date(day, '+0 days') IS NOT NULL
    AND date(day, '+0 days') = day
  )
) STRICT;
`;

function createHealthSyncSchema(database) {
  database.exec(healthSyncSchema);
  database
    .prepare('INSERT INTO health_sync_config (id, server_id) VALUES (1, ?)')
    .run(randomUUID());
}

module.exports = { healthSyncSchema, createHealthSyncSchema };
