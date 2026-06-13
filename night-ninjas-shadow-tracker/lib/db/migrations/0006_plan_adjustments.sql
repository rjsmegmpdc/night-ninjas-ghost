-- Migration 0006 - plan_adjustments table for Phase 3b
--
-- Empty table created now so R1 ships with the schema in place. Phase 3b
-- commences with rows being written by interpretState/applyAdjustment.

CREATE TABLE IF NOT EXISTS plan_adjustments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    proposed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    applied_at TEXT,
    dismissed_at TEXT,

    trigger TEXT NOT NULL,
    rationale TEXT NOT NULL,

    before_state TEXT,
    after_state TEXT,

    mode TEXT NOT NULL,
    week_start_iso TEXT
);

CREATE INDEX IF NOT EXISTS idx_plan_adjustments_proposed_at
    ON plan_adjustments(proposed_at);

CREATE INDEX IF NOT EXISTS idx_plan_adjustments_trigger
    ON plan_adjustments(trigger);
