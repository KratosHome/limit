const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { AppError, ERROR_CODES } = require('./errors.cjs');
const { createLimitId } = require('./store/data-model.cjs');

class UnsupportedDatabaseVersionError extends Error {}
class DatabaseMigrationError extends Error {}

function isCorruptDatabaseError(error) {
  const details = [error?.message, error?.errstr]
    .filter((value) => typeof value === 'string')
    .join('\n');
  return /not a database|database disk image is malformed|file is encrypted/i.test(
    details,
  );
}

class SQLiteStorage {
  constructor(databasePath, options) {
    this.databasePath = databasePath;
    this.legacyJsonPath = options.legacyJsonPath || null;
    this.cloneDefaultData = options.dataAdapter.cloneDefaultData;
    this.normalizeData = options.dataAdapter.normalizeData;
    this.normalizeCategory = options.dataAdapter.normalizeCategory;
    this.normalizeSiteDomain = options.dataAdapter.normalizeSiteDomain;
    this.defaultLanguage = options.defaultLanguage === 'en' ? 'en' : 'uk';
    this.data = this.cloneDefaultData();
    this.database = null;
    this.lastPersistenceError = null;
    this.recoveryCreated = false;
    this.writeBlocked = false;
    this.open();
  }

  open() {
    fs.mkdirSync(path.dirname(this.databasePath), { recursive: true });
    try {
      this.database = new DatabaseSync(this.databasePath, { timeout: 5000 });
      this.initializeSchema();
    } catch (error) {
      try {
        this.database?.close();
      } catch {
        // The failed connection may already be closed.
      }
      this.database = null;
      if (
        error instanceof UnsupportedDatabaseVersionError ||
        error instanceof DatabaseMigrationError ||
        !isCorruptDatabaseError(error)
      )
        throw error;
      try {
        const recoveryPath = `${this.databasePath}.corrupt-${Date.now()}`;
        if (fs.existsSync(this.databasePath))
          fs.renameSync(this.databasePath, recoveryPath);
        for (const suffix of ['-wal', '-shm']) {
          const sidecarPath = `${this.databasePath}${suffix}`;
          if (fs.existsSync(sidecarPath))
            fs.renameSync(sidecarPath, `${recoveryPath}${suffix}`);
        }
        this.recoveryCreated = true;
      } catch (backupError) {
        console.error(
          'Не вдалося створити резервну копію пошкодженої бази:',
          backupError.message,
        );
        this.writeBlocked = true;
      }
      this.lastPersistenceError = ERROR_CODES.STORAGE_READ;
      this.database = this.writeBlocked
        ? new DatabaseSync(':memory:')
        : new DatabaseSync(this.databasePath, { timeout: 5000 });
      this.initializeSchema();
    }

    if (this.isInitialized()) {
      this.data = this.readAllData();
      return;
    }

    let initialData = this.cloneDefaultData();
    if (this.legacyJsonPath && fs.existsSync(this.legacyJsonPath)) {
      try {
        initialData = this.normalizeData(
          JSON.parse(fs.readFileSync(this.legacyJsonPath, 'utf8')),
        );
      } catch (error) {
        console.warn('Не вдалося імпортувати історію JSON:', error.message);
        try {
          fs.copyFileSync(
            this.legacyJsonPath,
            `${this.legacyJsonPath}.corrupt-${Date.now()}`,
          );
          this.recoveryCreated = true;
        } catch (backupError) {
          console.error(
            'Не вдалося створити резервну копію пошкодженого JSON:',
            backupError.message,
          );
        }
        this.lastPersistenceError = ERROR_CODES.STORAGE_IMPORT;
      }
    }
    this.replaceAllData(initialData);
  }

  initializeSchema() {
    this.database.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA busy_timeout = 5000;
      PRAGMA temp_store = MEMORY;

      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      ) STRICT;
    `);

    const migrations = [
      {
        version: 1,
        name: 'initial_schema',
        up: `
          CREATE TABLE IF NOT EXISTS metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
          ) STRICT;

          CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            tracking_enabled INTEGER NOT NULL CHECK (tracking_enabled IN (0, 1)),
            website_tracking_enabled INTEGER NOT NULL CHECK (website_tracking_enabled IN (0, 1)),
            launch_at_login INTEGER NOT NULL CHECK (launch_at_login IN (0, 1)),
            idle_threshold_seconds INTEGER NOT NULL CHECK (idle_threshold_seconds BETWEEN 15 AND 3600)
          ) STRICT;

          CREATE TABLE IF NOT EXISTS usage_entries (
            day TEXT NOT NULL,
            app_id TEXT NOT NULL,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            executable_path TEXT,
            seconds REAL NOT NULL CHECK (seconds >= 0),
            launches INTEGER NOT NULL CHECK (launches >= 0),
            last_title TEXT NOT NULL,
            last_seen_at TEXT,
            PRIMARY KEY (day, app_id)
          ) STRICT;

          CREATE TABLE IF NOT EXISTS hourly_usage (
            day TEXT NOT NULL,
            app_id TEXT NOT NULL,
            hour INTEGER NOT NULL CHECK (hour BETWEEN 0 AND 23),
            seconds REAL NOT NULL CHECK (seconds >= 0),
            PRIMARY KEY (day, app_id, hour),
            FOREIGN KEY (day, app_id) REFERENCES usage_entries(day, app_id) ON DELETE CASCADE
          ) STRICT;

          CREATE TABLE IF NOT EXISTS site_usage (
            day TEXT NOT NULL,
            app_id TEXT NOT NULL,
            domain TEXT NOT NULL,
            seconds REAL NOT NULL CHECK (seconds >= 0),
            last_seen_at TEXT,
            PRIMARY KEY (day, app_id, domain),
            FOREIGN KEY (day, app_id) REFERENCES usage_entries(day, app_id) ON DELETE CASCADE
          ) STRICT;

          CREATE TABLE IF NOT EXISTS limits (
            app_id TEXT PRIMARY KEY,
            app_name TEXT NOT NULL,
            daily_limit_minutes INTEGER NOT NULL CHECK (daily_limit_minutes BETWEEN 1 AND 1440),
            warning_minutes INTEGER NOT NULL CHECK (warning_minutes >= 0),
            enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
            last_warning_date TEXT,
            last_reached_date TEXT,
            paused_date TEXT
          ) STRICT;
        `,
      },
      {
        version: 2,
        name: 'settings_language',
        up: `
          ALTER TABLE settings ADD COLUMN language TEXT NOT NULL DEFAULT '${this.defaultLanguage}'
            CHECK (language IN ('uk', 'en'));
        `,
      },
      {
        version: 3,
        name: 'category_ids',
        up: `
          UPDATE usage_entries
          SET category = CASE
            WHEN lower(trim(category)) = 'browser'
              OR trim(category) IN ('Браузер', 'браузер') THEN 'browser'
            WHEN lower(trim(category)) = 'communication'
              OR trim(category) IN ('Спілкування', 'спілкування') THEN 'communication'
            WHEN lower(trim(category)) = 'development'
              OR trim(category) IN ('Розробка', 'розробка') THEN 'development'
            WHEN lower(trim(category)) = 'design'
              OR trim(category) IN ('Дизайн', 'дизайн') THEN 'design'
            WHEN lower(trim(category)) = 'entertainment'
              OR trim(category) IN ('Розваги', 'розваги') THEN 'entertainment'
            WHEN lower(trim(category)) = 'productivity'
              OR trim(category) IN ('Продуктивність', 'продуктивність') THEN 'productivity'
            WHEN lower(trim(category)) = 'other'
              OR trim(category) IN ('Інше', 'інше') THEN 'other'
            ELSE 'other'
          END;
        `,
      },
      {
        version: 4,
        name: 'site_limits',
        up: `
          ALTER TABLE limits ADD COLUMN source_app_id TEXT;
          ALTER TABLE limits ADD COLUMN site_domain TEXT;
          UPDATE limits SET source_app_id = app_id WHERE source_app_id IS NULL;
        `,
      },
      {
        version: 5,
        name: 'retry_native_notifications',
        up: `
          UPDATE limits
          SET last_warning_date = NULL,
              last_reached_date = NULL;
        `,
      },
      {
        version: 6,
        name: 'notification_preference',
        up: `
          ALTER TABLE settings
          ADD COLUMN notifications_enabled INTEGER NOT NULL DEFAULT 1
            CHECK (notifications_enabled IN (0, 1));
        `,
      },
      {
        version: 7,
        name: 'canonical_site_limit_ids',
        up: (database) => {
          const siteLimits = database
            .prepare(
              `SELECT app_id, source_app_id, site_domain
               FROM limits
               WHERE site_domain IS NOT NULL`,
            )
            .all();
          const updateId = database.prepare(
            'UPDATE limits SET app_id = ? WHERE app_id = ?',
          );
          for (const limit of siteLimits) {
            updateId.run(
              createLimitId(
                limit.source_app_id || limit.app_id,
                limit.site_domain,
              ),
              limit.app_id,
            );
          }
        },
      },
    ];
    const latestVersion = migrations.at(-1).version;
    const currentVersion =
      this.database
        .prepare(
          'SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations',
        )
        .get().version || 0;
    if (currentVersion > latestVersion) {
      throw new UnsupportedDatabaseVersionError(
        `База створена новішою версією Limit (schema ${currentVersion})`,
      );
    }

    if (currentVersion > 0 && currentVersion < latestVersion)
      this.createMigrationBackup(currentVersion);

    for (const migration of migrations) {
      if (migration.version <= currentVersion) continue;
      this.database.exec('BEGIN IMMEDIATE');
      try {
        if (typeof migration.up === 'function') {
          migration.up(this.database);
        } else {
          this.database.exec(migration.up);
        }
        this.database
          .prepare(
            `INSERT INTO schema_migrations (version, name, applied_at)
             VALUES (?, ?, ?)`,
          )
          .run(migration.version, migration.name, new Date().toISOString());
        this.database.exec(`PRAGMA user_version = ${migration.version}`);
        this.database.exec('COMMIT');
      } catch (error) {
        try {
          this.database.exec('ROLLBACK');
        } catch {
          // Preserve the migration error.
        }
        throw new DatabaseMigrationError(
          `Не вдалося застосувати SQLite migration ${migration.version}`,
          { cause: error },
        );
      }
    }
    this.secureFilePermissions();
  }

  createMigrationBackup(currentVersion) {
    this.database.exec('PRAGMA wal_checkpoint(FULL)');
    const backupPath = `${this.databasePath}.backup-v${currentVersion}-${Date.now()}`;
    fs.copyFileSync(this.databasePath, backupPath);
    if (process.platform !== 'win32') fs.chmodSync(backupPath, 0o600);
  }

  secureFilePermissions() {
    if (process.platform === 'win32' || this.databasePath === ':memory:')
      return;
    for (const filePath of [
      this.databasePath,
      `${this.databasePath}-wal`,
      `${this.databasePath}-shm`,
    ]) {
      if (!fs.existsSync(filePath)) continue;
      fs.chmodSync(filePath, 0o600);
    }
  }

  isInitialized() {
    return Boolean(
      this.database
        .prepare("SELECT 1 FROM metadata WHERE key = 'initialized'")
        .get(),
    );
  }

  transaction(callback) {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const result = callback();
      this.database.exec('COMMIT');
      this.secureFilePermissions();
      if (!this.recoveryCreated && !this.writeBlocked)
        this.lastPersistenceError = null;
      return result;
    } catch (error) {
      try {
        this.database.exec('ROLLBACK');
      } catch {
        // Preserve the original write error.
      }
      console.error('Не вдалося виконати SQLite-транзакцію:', error);
      this.lastPersistenceError = ERROR_CODES.STORAGE_SAVE;
      throw new AppError(
        ERROR_CODES.STORAGE_SAVE,
        'SQLite transaction failed',
        {
          cause: error,
        },
      );
    }
  }

  replaceAllData(value) {
    const data = this.normalizeData(value);
    this.transaction(() => {
      this.database.exec(`
        DELETE FROM hourly_usage;
        DELETE FROM site_usage;
        DELETE FROM usage_entries;
        DELETE FROM limits;
        DELETE FROM settings;
      `);
      this.database
        .prepare(
          `INSERT INTO settings (
            id, language, tracking_enabled, website_tracking_enabled,
            notifications_enabled, launch_at_login, idle_threshold_seconds
          ) VALUES (1, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          data.settings.language,
          Number(data.settings.trackingEnabled),
          Number(data.settings.websiteTrackingEnabled),
          Number(data.settings.notificationsEnabled),
          Number(data.settings.launchAtLogin),
          data.settings.idleThresholdSeconds,
        );

      const insertEntry = this.database.prepare(`
        INSERT INTO usage_entries (
          day, app_id, name, category, executable_path, seconds,
          launches, last_title, last_seen_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertHourly = this.database.prepare(`
        INSERT INTO hourly_usage (day, app_id, hour, seconds)
        VALUES (?, ?, ?, ?)
      `);
      const insertSite = this.database.prepare(`
        INSERT INTO site_usage (day, app_id, domain, seconds, last_seen_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      for (const [dayKey, day] of Object.entries(data.usageByDay)) {
        if (!day || typeof day !== 'object' || Array.isArray(day)) continue;
        for (const entry of Object.values(day)) {
          if (
            !entry ||
            typeof entry !== 'object' ||
            !entry.id ||
            !entry.name ||
            String(entry.id).length > 512 ||
            String(entry.name).length > 120
          )
            continue;
          insertEntry.run(
            dayKey,
            String(entry.id),
            String(entry.name),
            this.normalizeCategory(entry.category, String(entry.name)),
            typeof entry.executablePath === 'string' &&
              path.isAbsolute(entry.executablePath)
              ? entry.executablePath
              : null,
            Math.max(0, Number(entry.seconds) || 0),
            Math.max(0, Math.round(Number(entry.launches) || 0)),
            typeof entry.lastTitle === 'string' ? entry.lastTitle : '',
            typeof entry.lastSeenAt === 'string' ? entry.lastSeenAt : null,
          );
          for (const [hour, seconds] of Object.entries(entry.hourly || {})) {
            const hourNumber = Number(hour);
            if (
              Number.isInteger(hourNumber) &&
              hourNumber >= 0 &&
              hourNumber <= 23 &&
              Number.isFinite(seconds) &&
              seconds >= 0
            )
              insertHourly.run(dayKey, entry.id, hourNumber, seconds);
          }
          for (const siteEntry of Object.values(entry.sites || {})) {
            const domain = this.normalizeSiteDomain(siteEntry?.domain);
            if (!domain) continue;
            insertSite.run(
              dayKey,
              entry.id,
              domain,
              Math.max(0, Number(siteEntry.seconds) || 0),
              typeof siteEntry.lastSeenAt === 'string'
                ? siteEntry.lastSeenAt
                : null,
            );
          }
        }
      }

      const insertLimit = this.database.prepare(`
        INSERT INTO limits (
          app_id, source_app_id, site_domain, app_name, daily_limit_minutes, warning_minutes, enabled,
          last_warning_date, last_reached_date, paused_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const limit of Object.values(data.limits)) {
        if (!limit?.appId || !limit?.appName) continue;
        const siteDomain = this.normalizeSiteDomain(limit.siteDomain);
        const dailyLimitMinutes = Math.min(
          1440,
          Math.max(1, Math.round(Number(limit.dailyLimitMinutes) || 1)),
        );
        insertLimit.run(
          createLimitId(limit.appId, siteDomain),
          limit.appId,
          siteDomain,
          limit.appName,
          dailyLimitMinutes,
          Math.min(
            Math.max(0, Math.round(Number(limit.warningMinutes) || 0)),
            Math.max(0, dailyLimitMinutes - 1),
          ),
          Number(limit.enabled !== false),
          limit.lastWarningDate || null,
          limit.lastReachedDate || null,
          limit.pausedDate || null,
        );
      }
      this.database
        .prepare(
          "INSERT OR REPLACE INTO metadata (key, value) VALUES ('initialized', ?)",
        )
        .run(new Date().toISOString());
    });
    this.data = this.readAllData();
  }

  readAllData() {
    const data = this.cloneDefaultData();
    const settings = this.database
      .prepare('SELECT * FROM settings WHERE id = 1')
      .get();
    if (settings) {
      data.settings = {
        language: settings.language === 'en' ? 'en' : 'uk',
        trackingEnabled: Boolean(settings.tracking_enabled),
        websiteTrackingEnabled: Boolean(settings.website_tracking_enabled),
        notificationsEnabled: Boolean(settings.notifications_enabled),
        launchAtLogin: Boolean(settings.launch_at_login),
        idleThresholdSeconds: settings.idle_threshold_seconds,
      };
    }

    for (const row of this.database
      .prepare('SELECT * FROM usage_entries')
      .all()) {
      const day = (data.usageByDay[row.day] ||= {});
      Object.defineProperty(day, row.app_id, {
        configurable: true,
        enumerable: true,
        value: {
          id: row.app_id,
          name: row.name,
          category: this.normalizeCategory(row.category, row.name),
          seconds: row.seconds,
          launches: row.launches,
          hourly: {},
          sites: {},
          lastTitle: row.last_title,
          lastSeenAt: row.last_seen_at,
          ...(row.executable_path
            ? { executablePath: row.executable_path }
            : {}),
        },
        writable: true,
      });
    }
    for (const row of this.database
      .prepare('SELECT * FROM hourly_usage')
      .all()) {
      const entry = data.usageByDay[row.day]?.[row.app_id];
      if (entry) entry.hourly[String(row.hour)] = row.seconds;
    }
    for (const row of this.database.prepare('SELECT * FROM site_usage').all()) {
      const entry = data.usageByDay[row.day]?.[row.app_id];
      if (!entry) continue;
      Object.defineProperty(entry.sites, row.domain, {
        configurable: true,
        enumerable: true,
        value: {
          domain: row.domain,
          seconds: row.seconds,
          lastSeenAt: row.last_seen_at,
        },
        writable: true,
      });
    }
    for (const row of this.database.prepare('SELECT * FROM limits').all()) {
      Object.defineProperty(data.limits, row.app_id, {
        configurable: true,
        enumerable: true,
        value: {
          id: row.app_id,
          appId: row.source_app_id || row.app_id,
          appName: row.app_name,
          siteDomain: row.site_domain || null,
          dailyLimitMinutes: row.daily_limit_minutes,
          warningMinutes: row.warning_minutes,
          enabled: Boolean(row.enabled),
          lastWarningDate: row.last_warning_date,
          lastReachedDate: row.last_reached_date,
          pausedDate: row.paused_date,
        },
        writable: true,
      });
    }
    return data;
  }

  getStatus() {
    return {
      errorCode: this.lastPersistenceError,
      recoveryCreated: this.recoveryCreated,
    };
  }

  persistNow() {
    if (this.writeBlocked) return false;
    try {
      this.database.exec('PRAGMA optimize');
      this.database.exec('PRAGMA wal_checkpoint(PASSIVE)');
      this.secureFilePermissions();
      return true;
    } catch (error) {
      console.error('Не вдалося завершити SQLite maintenance:', error);
      this.lastPersistenceError = ERROR_CODES.STORAGE_MAINTENANCE;
      return false;
    }
  }

  close() {
    if (!this.database) return;
    this.persistNow();
    this.database.close();
    this.database = null;
  }
}

module.exports = { SQLiteStorage };
