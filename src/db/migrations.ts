/**
 * Ordered migration list — same schema as VELOCITY, ported to plain SQL.
 * Each entry runs once and is recorded in _migrations.
 * Add new entries at the END; never edit existing ones.
 */
export const MIGRATIONS: { name: string; sql: string }[] = [
  {
    name: '0001_initial_schema',
    sql: `
      CREATE TABLE IF NOT EXISTS activities (
        id              INTEGER PRIMARY KEY,
        strava_id       INTEGER UNIQUE,
        name            TEXT NOT NULL,
        type            TEXT NOT NULL,
        sport_type      TEXT NOT NULL,
        start_date      TEXT NOT NULL,
        distance        REAL NOT NULL DEFAULT 0,
        moving_time     INTEGER NOT NULL DEFAULT 0,
        elapsed_time    INTEGER NOT NULL DEFAULT 0,
        total_elevation REAL NOT NULL DEFAULT 0,
        average_speed   REAL NOT NULL DEFAULT 0,
        max_speed       REAL NOT NULL DEFAULT 0,
        average_heartrate REAL,
        max_heartrate   REAL,
        suffer_score    REAL,
        gear_id         TEXT,
        raw_json        TEXT,
        synced_at       TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS plans (
        id          INTEGER PRIMARY KEY,
        dojo        TEXT NOT NULL,
        params_json TEXT NOT NULL,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS plan_periods (
        id          INTEGER PRIMARY KEY,
        plan_id     INTEGER NOT NULL REFERENCES plans(id),
        start_date  TEXT NOT NULL,
        end_date    TEXT,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS shoes (
        id                  INTEGER PRIMARY KEY,
        strava_gear_id      TEXT UNIQUE,
        name                TEXT NOT NULL,
        brand               TEXT,
        model               TEXT,
        category            TEXT NOT NULL DEFAULT 'daily',
        target_km           REAL NOT NULL DEFAULT 800,
        retired             INTEGER NOT NULL DEFAULT 0,
        notes               TEXT,
        created_at          TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS journal (
        id                    INTEGER PRIMARY KEY,
        date                  TEXT NOT NULL UNIQUE,
        sleep_quality         INTEGER,
        energy_level          INTEGER,
        stress_level          INTEGER,
        resting_hr            INTEGER,
        hrv                   INTEGER,
        weight_kg             REAL,
        notes                 TEXT,
        reflection_felt       TEXT,
        reflection_worked     TEXT,
        reflection_uncertain  TEXT,
        created_at            TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS races (
        id          INTEGER PRIMARY KEY,
        date        TEXT NOT NULL,
        name        TEXT NOT NULL,
        distance_km REAL NOT NULL,
        goal_time   TEXT,
        notes       TEXT,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS calendar_events (
        id          INTEGER PRIMARY KEY,
        date        TEXT NOT NULL,
        title       TEXT NOT NULL,
        type        TEXT NOT NULL DEFAULT 'commitment',
        notes       TEXT,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS settings (
        key         TEXT PRIMARY KEY,
        value       TEXT NOT NULL,
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS sync_jobs (
        id          INTEGER PRIMARY KEY,
        status      TEXT NOT NULL DEFAULT 'pending',
        started_at  TEXT,
        finished_at TEXT,
        error       TEXT,
        fetched     INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_activities_start_date ON activities(start_date);
      CREATE INDEX IF NOT EXISTS idx_activities_type       ON activities(sport_type);
      CREATE INDEX IF NOT EXISTS idx_journal_date          ON journal(date);
    `,
  },
  {
    name: '0002_races_goal_level',
    sql: `
      ALTER TABLE races ADD COLUMN is_goal  INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE races ADD COLUMN level    TEXT    NOT NULL DEFAULT 'intermediate';
      ALTER TABLE races ADD COLUMN distance_label TEXT;

      CREATE TABLE IF NOT EXISTS recurring_sessions (
        id                    INTEGER PRIMARY KEY,
        name                  TEXT NOT NULL,
        dow                   INTEGER NOT NULL,
        session_type          TEXT NOT NULL DEFAULT 'easy',
        typical_distance_min  REAL,
        typical_distance_max  REAL,
        pace_label            TEXT,
        venue                 TEXT,
        notes                 TEXT,
        is_active             INTEGER NOT NULL DEFAULT 1,
        created_at            TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `,
  },
  {
    name: '0003_race_results_vo2max',
    sql: `
      CREATE TABLE IF NOT EXISTS race_results (
        id            INTEGER PRIMARY KEY,
        race_id       INTEGER NOT NULL,
        finish_time_s INTEGER,
        conditions    TEXT,
        rpe           INTEGER,
        lessons       TEXT,
        created_at    TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS vo2max_observations (
        id         INTEGER PRIMARY KEY,
        date       TEXT NOT NULL,
        source     TEXT NOT NULL,
        value      REAL NOT NULL,
        inputs     TEXT,
        note       TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `,
  },
  {
    name: '0004_athlete_profiles',
    sql: `
      CREATE TABLE IF NOT EXISTS athlete_profiles (
        athlete_id    INTEGER PRIMARY KEY,
        athlete_name  TEXT    NOT NULL DEFAULT '',
        scope         TEXT,
        sync_cursor   INTEGER,
        last_sync     TEXT,
        settings_json TEXT,
        updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
      );
    `,
  },
  {
    name: '0005_daily_health_metrics',
    sql: `
      CREATE TABLE IF NOT EXISTS daily_health_metrics (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        date             TEXT    NOT NULL,
        source           TEXT    NOT NULL DEFAULT 'manual',
        rhr_bpm          INTEGER,
        hrv_ms           REAL,
        sleep_duration_s INTEGER,
        sleep_score      INTEGER,
        stress_score     INTEGER,
        body_battery     INTEGER,
        vo2max_device    REAL,
        weight_kg        REAL,
        raw              TEXT,
        synced_at        TEXT    NOT NULL DEFAULT (datetime('now')),
        UNIQUE(date, source)
      );

      CREATE INDEX IF NOT EXISTS idx_health_date_source ON daily_health_metrics (date, source);
      CREATE INDEX IF NOT EXISTS idx_health_date        ON daily_health_metrics (date);
    `,
  },
];
