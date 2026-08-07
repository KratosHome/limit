function writeSettings(database, settings) {
  database
    .prepare(
      `UPDATE settings SET
        language = ?, tracking_enabled = ?, website_tracking_enabled = ?,
        launch_at_login = ?, idle_threshold_seconds = ?
      WHERE id = 1`,
    )
    .run(
      settings.language,
      Number(settings.trackingEnabled),
      Number(settings.websiteTrackingEnabled),
      Number(settings.launchAtLogin),
      settings.idleThresholdSeconds,
    );
}

function writeUsageEntry(database, dayKey, entry, hour, site = null) {
  database
    .prepare(
      `INSERT INTO usage_entries (
        day, app_id, name, category, executable_path, seconds,
        launches, last_title, last_seen_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(day, app_id) DO UPDATE SET
        name = excluded.name,
        category = excluded.category,
        executable_path = excluded.executable_path,
        seconds = excluded.seconds,
        launches = excluded.launches,
        last_title = excluded.last_title,
        last_seen_at = excluded.last_seen_at`,
    )
    .run(
      dayKey,
      entry.id,
      entry.name,
      entry.category,
      entry.executablePath || null,
      entry.seconds,
      entry.launches,
      entry.lastTitle,
      entry.lastSeenAt,
    );
  database
    .prepare(
      `INSERT INTO hourly_usage (day, app_id, hour, seconds)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(day, app_id, hour) DO UPDATE SET seconds = excluded.seconds`,
    )
    .run(dayKey, entry.id, Number(hour), entry.hourly[hour]);
  if (!site) return;
  database
    .prepare(
      `INSERT INTO site_usage (day, app_id, domain, seconds, last_seen_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(day, app_id, domain) DO UPDATE SET
         seconds = excluded.seconds,
         last_seen_at = excluded.last_seen_at`,
    )
    .run(dayKey, entry.id, site.domain, site.seconds, site.lastSeenAt);
}

function writeLimit(database, limit) {
  database
    .prepare(
      `INSERT INTO limits (
        app_id, app_name, daily_limit_minutes, warning_minutes, enabled,
        last_warning_date, last_reached_date, paused_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(app_id) DO UPDATE SET
        app_name = excluded.app_name,
        daily_limit_minutes = excluded.daily_limit_minutes,
        warning_minutes = excluded.warning_minutes,
        enabled = excluded.enabled,
        last_warning_date = excluded.last_warning_date,
        last_reached_date = excluded.last_reached_date,
        paused_date = excluded.paused_date`,
    )
    .run(
      limit.appId,
      limit.appName,
      limit.dailyLimitMinutes,
      limit.warningMinutes,
      Number(limit.enabled),
      limit.lastWarningDate,
      limit.lastReachedDate,
      limit.pausedDate,
    );
}

function deleteLimit(database, appId) {
  database.prepare('DELETE FROM limits WHERE app_id = ?').run(appId);
}

function writePausedDate(database, appId, pausedDate) {
  database
    .prepare('UPDATE limits SET paused_date = ? WHERE app_id = ?')
    .run(pausedDate, appId);
}

function writeNotificationDate(database, appId, kind, day) {
  const statement =
    kind === 'warning'
      ? 'UPDATE limits SET last_warning_date = ? WHERE app_id = ?'
      : 'UPDATE limits SET last_reached_date = ? WHERE app_id = ?';
  database.prepare(statement).run(day, appId);
}

module.exports = {
  deleteLimit,
  writeLimit,
  writeNotificationDate,
  writePausedDate,
  writeSettings,
  writeUsageEntry,
};
