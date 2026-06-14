-- Migration 0007 - daily_health_metrics table for Phase 12
--
-- Source-agnostic biometric storage. One row per (date, source).
-- Garmin sync (Phase 12 first integration) writes here; Apple Health,
-- Whoop, Coros, and manual entry follow the same shape later.

CREATE TABLE IF NOT EXISTS daily_health_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    source TEXT NOT NULL,

    rhr_bpm INTEGER,
    hrv_ms REAL,
    sleep_duration_s INTEGER,
    sleep_score INTEGER,
    stress_score INTEGER,
    body_battery INTEGER,
    vo2max_device REAL,
    weight_kg REAL,

    raw TEXT,
    synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_health_date_source
    ON daily_health_metrics(date, source);

CREATE INDEX IF NOT EXISTS idx_health_date
    ON daily_health_metrics(date);
