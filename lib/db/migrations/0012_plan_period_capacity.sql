-- Phase 14: per-block capacity settings on plan_periods.
-- Previously the only per-block config was start_date and program_weeks;
-- volume and long-run caps came from the global settings table.
-- These columns let an athlete target different load levels per block
-- without changing their cross-block defaults in Settings.
--
-- NULL = "use global settings / engine default" (backward-compatible;
-- existing rows keep NULL so the fallback chain is unchanged).
ALTER TABLE plan_periods ADD COLUMN weekly_volume_cap_km REAL;
ALTER TABLE plan_periods ADD COLUMN long_run_cap_km REAL;
