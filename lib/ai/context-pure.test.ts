import { describe, it, expect } from 'vitest';
import { snapshotToText, type AthleteSnapshot } from './context-pure';

const base: AthleteSnapshot = {
  asOfIso: '2026-06-23',
  dojo: 'hansons',
  weekNumber: 4,
  programWeeks: 18,
  phaseKind: 'program-week-N',
  daysToRace: 120,
  todaySession: { label: 'Tue tempo', type: 'tempo', prescription: '8km @ MP' },
  week: { totalKm: 42.5, longRunKm: 18, avgPaceSpk: 300, avgHr: 142, sessions: 4, targetKm: 70 },
  state: { ctl: 55, atl: 60, tsb: -5, formClass: 'loaded', confidence: 'calibrated' },
  recentActivities: [
    { date: '2026-06-22', type: 'Run', name: 'Easy', distanceKm: 10, avgPaceSpk: 330, avgHr: 135 },
  ],
  activeInjuries: [],
};

describe('snapshotToText', () => {
  it('includes program week and phase', () => {
    const t = snapshotToText(base);
    expect(t).toContain('week 4 of 18');
    expect(t).toContain('program-week-N');
  });

  it('includes TSB and form class', () => {
    const t = snapshotToText(base);
    expect(t).toContain('TSB -5');
    expect(t).toContain('loaded');
  });

  it("includes today's session", () => {
    const t = snapshotToText(base);
    expect(t).toContain("Today's planned session: Tue tempo");
    expect(t).toContain('8km @ MP');
  });

  it('formats pace correctly (300spk = 5:00/km)', () => {
    const t = snapshotToText(base);
    expect(t).toContain('5:00/km');
  });

  it('reports no injuries when none active', () => {
    expect(snapshotToText(base)).toContain('Active injuries/illness: none logged');
  });

  it('renders active injury details', () => {
    const t = snapshotToText({
      ...base,
      activeInjuries: [{ type: 'injury', bodyRegion: 'calf', severity: 'moderate', since: '2026-06-10' }],
    });
    expect(t).toContain('injury (moderate) calf, since 2026-06-10');
    expect(t).not.toContain('none logged');
  });

  it('handles a rest day', () => {
    const t = snapshotToText({ ...base, todaySession: null });
    expect(t).toContain('Today: rest day');
    expect(t).not.toContain("Today's planned session");
  });

  it('handles missing athlete state', () => {
    const t = snapshotToText({ ...base, state: null });
    expect(t).not.toContain('Freshness');
    expect(t).not.toContain('CTL');
  });

  it('includes days to race', () => {
    expect(snapshotToText(base)).toContain('Days to goal race: 120');
  });

  it('shows phase only when no week number', () => {
    const t = snapshotToText({ ...base, weekNumber: null, programWeeks: null });
    expect(t).toContain('Program phase: program-week-N');
    // Positive assertion: no week/number combination should appear
    expect(t).not.toMatch(/week\s+\d/);
  });

  it('includes recent activity', () => {
    const t = snapshotToText(base);
    expect(t).toContain('2026-06-22 Run "Easy"');
    expect(t).toContain('135bpm');
  });

  it('omits HR when avgHr is null', () => {
    const t = snapshotToText({ ...base, week: { ...base.week, avgHr: null } });
    expect(t).not.toContain('142bpm');
  });

  it('handles weekNumber 0 without treating it as a missing week', () => {
    // weekNumber=0 is falsy in JS — implementation must not use `if (weekNumber)` bare
    const t = snapshotToText({ ...base, weekNumber: 0, programWeeks: 18 });
    expect(t).not.toContain('Program phase: program-week-N');
    expect(t).toContain('week 0');
  });
});
