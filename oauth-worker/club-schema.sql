-- Night Ninjas club datastore (Cloudflare D1)
-- Apply with:
--   npx wrangler d1 execute ghost-club --remote --file=club-schema.sql

CREATE TABLE IF NOT EXISTS members (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  sex        TEXT    NOT NULL CHECK (sex IN ('M','F')),
  yob        INTEGER,                -- year of birth; age group derived per event year
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Course efforts (Ninja Loop, Waiwera, ...)
CREATE TABLE IF NOT EXISTS results (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id  INTEGER NOT NULL REFERENCES members(id),
  course     TEXT    NOT NULL,       -- 'ninja-loop' | 'waiwera'
  date       TEXT    NOT NULL,       -- YYYY-MM-DD
  time_s     INTEGER NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_results_course ON results(course, date);
CREATE INDEX IF NOT EXISTS idx_results_member ON results(member_id);

-- Ninja Champs — one entry per member per year
CREATE TABLE IF NOT EXISTS champs_entries (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id  INTEGER NOT NULL REFERENCES members(id),
  year       INTEGER NOT NULL,
  pb5k_s     INTEGER,               -- rolling-12mo PBs, seconds
  pb10k_s    INTEGER,
  pb21k_s    INTEGER,
  actual_s   INTEGER,               -- Millwater finish time; null until finished
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (member_id, year)
);

-- Past winners (includes pre-app history, so name is free text)
CREATE TABLE IF NOT EXISTS champs_winners (
  year INTEGER PRIMARY KEY,
  name TEXT    NOT NULL,
  note TEXT
);
