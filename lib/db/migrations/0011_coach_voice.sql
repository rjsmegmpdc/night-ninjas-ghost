-- Migration 0011 - Phase 9 coach voice + reflection
--
-- Adds three Sunday-night reflection columns to the journal table (one row per
-- day, no-clobber semantics match the wellness pattern) and creates the
-- block_debriefs table for structured end-of-block retrospectives.

-- Sunday reflection — 3-question prompt written to the day's journal row.
ALTER TABLE journal ADD COLUMN reflection_felt TEXT;
ALTER TABLE journal ADD COLUMN reflection_worked TEXT;
ALTER TABLE journal ADD COLUMN reflection_uncertain TEXT;

-- Block-end debrief: one row per completed plan period.
-- Unique on plan_period_id — updates in-place if the athlete revises.
CREATE TABLE IF NOT EXISTS block_debriefs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_period_id INTEGER NOT NULL,
    felt_about_block TEXT,
    main_learning TEXT,
    next_block_focus TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_block_debriefs_period ON block_debriefs(plan_period_id);
