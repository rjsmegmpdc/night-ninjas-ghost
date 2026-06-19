-- Migration 0009 - interruptions table for Phase 4
--
-- Athlete-logged breaks in training: injury, illness, travel, other.
-- Phase 4 informs only - logged injuries never auto-adjust the plan (the 3b
-- pipeline reads hasActiveInjuryOrIllness to suppress automatic mode).

CREATE TABLE IF NOT EXISTS interruptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,            -- injury | illness | travel | other
    body_region TEXT,             -- nullable; set for injuries
    severity TEXT NOT NULL,       -- niggle | moderate | severe
    start_date TEXT NOT NULL,
    end_date TEXT,                -- nullable = ongoing
    note TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_interruptions_start ON interruptions(start_date);
CREATE INDEX IF NOT EXISTS idx_interruptions_end ON interruptions(end_date);
