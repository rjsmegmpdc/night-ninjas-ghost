-- Night Ninjas — Shadow Tracker
-- Migration 0003 — Sync jobs table for stateful resumable Strava syncs

CREATE TABLE IF NOT EXISTS sync_jobs (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  source                   TEXT    NOT NULL,
  job_type                 TEXT    NOT NULL,
  status                   TEXT    NOT NULL,
  started_at               INTEGER NOT NULL,
  completed_at             INTEGER,
  last_heartbeat_at        INTEGER NOT NULL,
  cursor_before            INTEGER,
  cursor_after             INTEGER,
  oldest_fetched           TEXT,
  newest_fetched           TEXT,
  pages_fetched            INTEGER NOT NULL DEFAULT 0,
  added                    INTEGER NOT NULL DEFAULT 0,
  updated                  INTEGER NOT NULL DEFAULT 0,
  estimated_total          INTEGER,
  rate_limit_resets_at     INTEGER,
  error_message            TEXT,
  parent_job_id            INTEGER
);

CREATE INDEX IF NOT EXISTS sync_jobs_status_idx ON sync_jobs(status);
CREATE INDEX IF NOT EXISTS sync_jobs_source_type_idx ON sync_jobs(source, job_type);
