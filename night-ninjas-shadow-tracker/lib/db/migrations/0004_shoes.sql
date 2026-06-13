-- Night Ninjas — Shadow Tracker
-- Migration 0004 — Shoes feature (Stage 1)

-- Add gear columns to activities
ALTER TABLE activities ADD COLUMN gear_id TEXT;
ALTER TABLE activities ADD COLUMN gear_name TEXT;
CREATE INDEX IF NOT EXISTS activities_gear_idx ON activities(gear_id);

-- Shoes table — mirror + enrichment over Strava gear
CREATE TABLE IF NOT EXISTS shoes (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  strava_gear_id       TEXT UNIQUE,
  name                 TEXT NOT NULL,
  brand                TEXT,
  model                TEXT,
  category             TEXT,
  carbon_plate         INTEGER NOT NULL DEFAULT 0,
  strava_distance_km   REAL,
  recommended_km       REAL,
  user_target_km       REAL,
  purchase_date        TEXT,
  retire_date          TEXT,
  status               TEXT NOT NULL DEFAULT 'active',
  is_favourite         INTEGER NOT NULL DEFAULT 0,
  manual_entry         INTEGER NOT NULL DEFAULT 0,
  photo_filename       TEXT,
  nudge_dismissed_at   INTEGER,
  notes                TEXT,
  created_at           INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at           INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS shoes_strava_gear_idx ON shoes(strava_gear_id);
CREATE INDEX IF NOT EXISTS shoes_status_idx ON shoes(status);

-- Activity↔Shoe assignment (manual shoes only)
CREATE TABLE IF NOT EXISTS activity_shoe_assignments (
  activity_id  INTEGER NOT NULL PRIMARY KEY,
  shoe_id      INTEGER NOT NULL,
  assigned_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS activity_shoe_assignments_shoe_idx ON activity_shoe_assignments(shoe_id);

-- Manual price watches per shoe per retailer
CREATE TABLE IF NOT EXISTS shoe_price_watches (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  shoe_id      INTEGER NOT NULL,
  retailer     TEXT NOT NULL,
  price        REAL NOT NULL,
  currency     TEXT NOT NULL,
  url          TEXT,
  notes        TEXT,
  observed_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS shoe_price_watches_shoe_idx ON shoe_price_watches(shoe_id);
