-- Migration 0010 - race_results table for Phase 6 part 2 (post-race debrief)
--
-- One row per goal race. The races row stays immutable (the plan is set before
-- the race); the result is logged after. Holds the achieved finish time,
-- conditions, perceived effort (RPE 1-10), and lessons for the next block.

CREATE TABLE IF NOT EXISTS race_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    race_id INTEGER NOT NULL,
    finish_time_s INTEGER,
    conditions TEXT,
    rpe INTEGER,
    lessons TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_race_results_race ON race_results(race_id);
