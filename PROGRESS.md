## Branch
feat/weekly-report-patrol-hero

## Session: 2026-06-26

### In progress
- Weekly report Patrol hero — backend pass

### Key decisions made
- Display: PERSISTENT — persist full report payload JSON (weeklyReportPayload in
  settings store). Frontend reads snapshot on every Patrol load.
- QA STANDARD (standing, all future VELOCITY work): negative tests required for
  all UI components and integrations — error states, null/empty props, disabled
  states, invalid inputs, failed async, renders-when-data-absent.
