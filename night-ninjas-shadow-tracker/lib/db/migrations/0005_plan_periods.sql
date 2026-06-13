-- plan_periods: time-bounded record of which dojo+goal was active when.
-- See lib/plans/plan-periods.ts for the query layer that reads this.
-- All inline statement-internal comments removed for runner compatibility.

CREATE TABLE IF NOT EXISTS plan_periods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dojo TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT,
    goal_race_id INTEGER,
    goal_distance_km REAL,
    goal_target_time_s INTEGER,
    program_weeks INTEGER NOT NULL DEFAULT 18,
    level TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_plan_periods_start ON plan_periods(start_date);

CREATE INDEX IF NOT EXISTS idx_plan_periods_active ON plan_periods(end_date) WHERE end_date IS NULL;
