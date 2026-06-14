-- Migration 0008 - vo2max_observations table for R2.5
--
-- Stores manual-lab / cooper / rockport VO2 max readings. Device estimates
-- continue to live in daily_health_metrics.vo2max_device.

CREATE TABLE IF NOT EXISTS vo2max_observations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    source TEXT NOT NULL,
    value REAL NOT NULL,
    inputs TEXT,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vo2max_date ON vo2max_observations(date);
CREATE INDEX IF NOT EXISTS idx_vo2max_source ON vo2max_observations(source);
