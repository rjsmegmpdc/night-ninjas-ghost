import { describe, it, expect } from 'vitest';
import { getFrameworkStats, type FrameworkStatsInput } from './framework-stats';
import type { WeekStats } from './week-queries';
import type { WeekTemplate } from '@/lib/plans/types';
import type { WeekCompliance } from './compliance';
import type { IntensityDistribution } from './intensity-distribution';
import type { ProgramPhase } from '@/lib/plans/program-phase';
import type { NsGuardReport } from './ns-guardrails';

/* ---------------------------------------------------------------------- */
/* Fixtures                                                                  */
/* ---------------------------------------------------------------------- */

function makeStats(overrides: Partial<WeekStats> = {}): WeekStats {
  return {
    totalKm: 50,
    longRunKm: 18,
    totalMovingTimeS: 18000, // 5 hrs
    totalSessions: 5,
    avgPaceSpk: 360, // 6:00/km
    avgHr: 135,
    totalElevationGainM: 400,
    backToBackKm: 32,
    ...overrides,
  };
}

function makeTemplate(overrides: Partial<WeekTemplate> = {}): WeekTemplate {
  return {
    weekNumber: 5,
    phaseName: 'Base',
    totalKmTarget: 60,
    longRunKmTarget: 22,
    days: [
      { dow: 0, sessions: [{ label: 'Easy', type: 'easy' }] },
      { dow: 1, sessions: [{ label: 'NS Short', type: 'repetition' }] },
      { dow: 2, sessions: [{ label: 'Easy', type: 'easy' }] },
      { dow: 3, sessions: [{ label: 'NS Medium', type: 'tempo' }] },
      { dow: 4, sessions: [{ label: 'Easy/Rest', type: 'easy' }] },
      { dow: 5, sessions: [{ label: 'NS Long', type: 'tempo' }] },
      { dow: 6, sessions: [{ label: 'Long Run', type: 'long' }] },
    ],
    ...overrides,
  };
}

function makeCompliance(overrides: Partial<WeekCompliance> = {}): WeekCompliance {
  return {
    weekTemplate: makeTemplate(),
    totalKmActual: 50,
    longRunKmActual: 18,
    daysWithSessions: 5,
    days: [],
    ...overrides,
  };
}

function makePhase(overrides: Partial<ProgramPhase> = {}): ProgramPhase {
  return {
    kind: 'program-week-N',
    daysToRace: 120,
    weeksToProgramStart: null,
    programWeekNumber: 5,
    programWeeks: 20,
    daysSinceRace: null,
    label: 'Base phase',
    subline: 'Week 5 of 20',
    ...overrides,
  };
}

function makeNsReport(overrides: Partial<NsGuardReport> = {}): NsGuardReport {
  return {
    easyDiscipline: { severity: 'ok', title: 'Easy days are easy', body: '' },
    repIntensity: { severity: 'ok', title: 'Reps are controlled', body: '' },
    qualityCap: {
      qualityMinutes: 110,
      totalMinutes: 500,
      fraction: 0.22,
      targetFraction: 0.22,
      severity: 'ok',
      body: '',
    },
    maxHrGuard: { severity: 'ok', title: 'Max HR calibrated', body: '' },
    worst: 'ok',
    disciplineScore: 100,
    ...overrides,
  };
}

function makeIntensityDist(overrides: Partial<IntensityDistribution> = {}): IntensityDistribution {
  return {
    totalRunMin: 300,
    easyPct: 80,
    greyPct: 5,
    hardPct: 15,
    isPolarised: true,
    ...overrides,
  };
}

function baseInput(dojo: FrameworkStatsInput['dojo'], overrides: Partial<FrameworkStatsInput> = {}): FrameworkStatsInput {
  return {
    dojo,
    stats: makeStats(),
    template: makeTemplate(),
    activities: [],
    compliance: makeCompliance(),
    intensityDist: null,
    programPhase: makePhase(),
    nsReport: null,
    vdot: null,
    ...overrides,
  };
}

/* ---------------------------------------------------------------------- */
/* Custom / generic fallback                                                 */
/* ---------------------------------------------------------------------- */

describe('getFrameworkStats — custom', () => {
  it('returns 4 stats', () => {
    const result = getFrameworkStats(baseInput('custom'));
    expect(result).toHaveLength(4);
  });

  it('shows totalKm and sessions', () => {
    const result = getFrameworkStats(baseInput('custom', { stats: makeStats({ totalKm: 42.5, totalSessions: 4 }) }));
    expect(result[0].value).toBe('42.5');
    expect(result[0].unit).toBe('km');
    expect(result[2].subline).toContain('4 sessions');
  });

  it('shows — for missing pace', () => {
    const result = getFrameworkStats(baseInput('custom', { stats: makeStats({ avgPaceSpk: null }) }));
    expect(result[2].value).toBe('—:—');
  });

  it('shows — for missing HR', () => {
    const result = getFrameworkStats(baseInput('custom', { stats: makeStats({ avgHr: null }) }));
    expect(result[3].value).toBe('—');
    expect(result[3].subline).toBe('no HR data');
  });

  it('volume status ok when >= 80%', () => {
    // 50km / 60km target = 83% → ok
    const result = getFrameworkStats(baseInput('custom'));
    expect(result[0].status).toBe('ok');
  });

  it('volume status neutral when < 50%', () => {
    const result = getFrameworkStats(baseInput('custom', { stats: makeStats({ totalKm: 20 }) }));
    expect(result[0].status).toBe('neutral');
  });
});

/* ---------------------------------------------------------------------- */
/* Norwegian Singles                                                         */
/* ---------------------------------------------------------------------- */

describe('getFrameworkStats — norwegian-singles', () => {
  it('falls back to generic when nsReport is null', () => {
    const result = getFrameworkStats(baseInput('norwegian-singles', { nsReport: null }));
    expect(result[0].label).toBe('this week');
  });

  it('shows sub-T % from qualityCap', () => {
    const ns = makeNsReport({ qualityCap: { qualityMinutes: 90, totalMinutes: 450, fraction: 0.20, targetFraction: 0.22, severity: 'ok', body: '' } });
    const result = getFrameworkStats(baseInput('norwegian-singles', { nsReport: ns }));
    expect(result[0].label).toBe('sub-T volume');
    expect(result[0].value).toBe('20%');
    expect(result[0].status).toBe('ok');
  });

  it('miss status when over cap', () => {
    const ns = makeNsReport({ qualityCap: { qualityMinutes: 150, totalMinutes: 450, fraction: 0.33, targetFraction: 0.22, severity: 'miss', body: '' } });
    const result = getFrameworkStats(baseInput('norwegian-singles', { nsReport: ns }));
    expect(result[0].status).toBe('miss');
  });

  it('shows — for easy HR when no activities have HR', () => {
    const ns = makeNsReport();
    const result = getFrameworkStats(baseInput('norwegian-singles', { nsReport: ns, activities: [] }));
    expect(result[1].label).toBe('easy avg HR');
    expect(result[1].value).toBe('—');
    expect(result[1].unit).toBe('no HR');
    expect(result[1].status).toBe('neutral');
  });

  it('shows easy HR from non-quality day activities', () => {
    const ns = makeNsReport();
    // Mon (dow=0) is an easy day in the template; Thu (dow=3) is quality (tempo)
    // 2026-06-22 is Monday
    const easyAct = {
      id: 1, source: 'strava' as const, sourceId: '1', name: 'Easy run',
      type: 'Run', sportType: null,
      startDateUtc: '2026-06-22T07:00:00Z',
      startDateLocal: '2026-06-22T07:00:00', // Monday
      distanceM: 10000, movingTimeS: 3600, elapsedTimeS: 3600,
      elevationGainM: 50,
      avgSpeedMs: 2.78, maxSpeedMs: 3.0, avgHr: 125, maxHr: 135,
      avgCadence: null, sufferScore: null, kudos: null,
      gearId: null, gearName: null, rawJson: null,
      createdAt: new Date(), updatedAt: new Date(),
    };
    const result = getFrameworkStats(baseInput('norwegian-singles', { nsReport: ns, activities: [easyAct] }));
    expect(result[1].value).toBe('125');
    expect(result[1].unit).toBe('bpm');
    expect(result[1].status).toBe('ok'); // 125 <= 130
  });

  it('miss status when easy HR > 135', () => {
    const ns = makeNsReport();
    const hotAct = {
      id: 2, source: 'strava' as const, sourceId: '2', name: 'Too hot easy',
      type: 'Run', sportType: null,
      startDateUtc: '2026-06-22T07:00:00Z',
      startDateLocal: '2026-06-22T07:00:00',
      distanceM: 10000, movingTimeS: 3600, elapsedTimeS: 3600,
      elevationGainM: 50,
      avgSpeedMs: 2.78, maxSpeedMs: 3.5, avgHr: 140, maxHr: 155,
      avgCadence: null, sufferScore: null, kudos: null,
      gearId: null, gearName: null, rawJson: null,
      createdAt: new Date(), updatedAt: new Date(),
    };
    const result = getFrameworkStats(baseInput('norwegian-singles', { nsReport: ns, activities: [hotAct] }));
    expect(result[1].status).toBe('miss'); // 140 > 135
  });

  it('shows long run in stat 4', () => {
    const ns = makeNsReport();
    const result = getFrameworkStats(baseInput('norwegian-singles', { nsReport: ns }));
    expect(result[3].label).toBe('long run');
    expect(result[3].value).toBe('18.0');
    expect(result[3].unit).toBe('km');
  });
});

/* ---------------------------------------------------------------------- */
/* Polarised                                                                 */
/* ---------------------------------------------------------------------- */

describe('getFrameworkStats — polarised', () => {
  it('falls back to generic when no intensity data', () => {
    const result = getFrameworkStats(baseInput('polarised', { intensityDist: null }));
    expect(result[0].label).toBe('this week');
  });

  it('shows easy/hard/grey percentages', () => {
    const dist = makeIntensityDist({ easyPct: 82, hardPct: 13, greyPct: 5 });
    const result = getFrameworkStats(baseInput('polarised', { intensityDist: dist }));
    expect(result[0].label).toBe('easy %');
    expect(result[0].value).toBe('82%');
    expect(result[0].status).toBe('ok');
    expect(result[1].label).toBe('hard %');
    expect(result[1].value).toBe('13%');
    expect(result[1].status).toBe('warn'); // < 15%
    expect(result[2].label).toBe('grey zone');
    expect(result[2].value).toBe('5%');
    expect(result[2].status).toBe('ok'); // <= 5%
  });

  it('miss on easy % when badly polarised', () => {
    const dist = makeIntensityDist({ easyPct: 60, hardPct: 25, greyPct: 15 });
    const result = getFrameworkStats(baseInput('polarised', { intensityDist: dist }));
    expect(result[0].status).toBe('miss'); // 60 < 70
    expect(result[2].status).toBe('warn'); // 15 <= 15
  });

  it('hard status ok within 15-25% band', () => {
    const dist = makeIntensityDist({ easyPct: 80, hardPct: 20, greyPct: 0 });
    const result = getFrameworkStats(baseInput('polarised', { intensityDist: dist }));
    expect(result[1].status).toBe('ok');
  });

  it('4th stat is weekly volume', () => {
    const dist = makeIntensityDist();
    const result = getFrameworkStats(baseInput('polarised', { intensityDist: dist }));
    expect(result[3].label).toBe('this week');
    expect(result[3].value).toBe('50.0');
  });
});

/* ---------------------------------------------------------------------- */
/* Ultra                                                                     */
/* ---------------------------------------------------------------------- */

describe('getFrameworkStats — ultra', () => {
  it('shows time on feet in hours', () => {
    const result = getFrameworkStats(baseInput('ultra', { stats: makeStats({ totalMovingTimeS: 18000 }) }));
    expect(result[0].label).toBe('time on feet');
    expect(result[0].value).toBe('5.0'); // 18000 / 3600 = 5
    expect(result[0].unit).toBe('hrs');
  });

  it('shows elevation gain', () => {
    const result = getFrameworkStats(baseInput('ultra', { stats: makeStats({ totalElevationGainM: 1234 }) }));
    expect(result[1].label).toBe('vertical gain');
    expect(result[1].value).toBe('1234');
    expect(result[1].unit).toBe('m');
  });

  it('shows back-to-back km', () => {
    const result = getFrameworkStats(baseInput('ultra', { stats: makeStats({ backToBackKm: 45.5 }) }));
    expect(result[2].label).toBe('back-to-back');
    expect(result[2].value).toBe('45.5');
    expect(result[2].unit).toBe('km');
  });

  it('zero elevation shows 0', () => {
    const result = getFrameworkStats(baseInput('ultra', { stats: makeStats({ totalElevationGainM: 0 }) }));
    expect(result[1].value).toBe('0');
  });

  it('status neutral when no time on feet', () => {
    const result = getFrameworkStats(baseInput('ultra', { stats: makeStats({ totalMovingTimeS: 0 }) }));
    expect(result[0].status).toBe('neutral');
  });
});

/* ---------------------------------------------------------------------- */
/* Daniels — VDOT display                                                   */
/* ---------------------------------------------------------------------- */

describe('getFrameworkStats — daniels', () => {
  it('shows — for VDOT when null', () => {
    const result = getFrameworkStats(baseInput('daniels', { vdot: null }));
    expect(result[2].label).toBe('VDOT');
    expect(result[2].value).toBe('—');
    expect(result[2].status).toBe('neutral');
  });

  it('shows rounded VDOT when provided', () => {
    const result = getFrameworkStats(baseInput('daniels', { vdot: 41.3 }));
    expect(result[2].value).toBe('41');
    expect(result[2].status).toBe('ok');
  });

  it('shows — for T-pace when no sessions', () => {
    const result = getFrameworkStats(baseInput('daniels'));
    expect(result[0].label).toBe('T-pace');
    expect(result[0].value).toBe('—');
  });
});

/* ---------------------------------------------------------------------- */
/* Hansons                                                                   */
/* ---------------------------------------------------------------------- */

describe('getFrameworkStats — hansons', () => {
  it('returns 4 stats with correct labels', () => {
    const result = getFrameworkStats(baseInput('hansons'));
    expect(result.map((s) => s.label)).toEqual(['this week', 'MP-tempo pace', 'long run', 'sessions']);
  });

  it('shows session count', () => {
    const result = getFrameworkStats(baseInput('hansons', { stats: makeStats({ totalSessions: 6 }) }));
    expect(result[3].value).toBe('6');
  });

  it('shows no tempo placeholder when no quality sessions', () => {
    const result = getFrameworkStats(baseInput('hansons'));
    expect(result[1].value).toBe('—');
    expect(result[1].subline).toBe('no tempo yet');
  });
});

/* ---------------------------------------------------------------------- */
/* Higdon — week type                                                        */
/* ---------------------------------------------------------------------- */

describe('getFrameworkStats — higdon', () => {
  it('down week every 4th', () => {
    const phase4 = makePhase({ programWeekNumber: 4 });
    const result = getFrameworkStats(baseInput('higdon', { programPhase: phase4 }));
    expect(result[2].value).toBe('down');
  });

  it('build week otherwise', () => {
    const phase5 = makePhase({ programWeekNumber: 5 });
    const result = getFrameworkStats(baseInput('higdon', { programPhase: phase5 }));
    expect(result[2].value).toBe('build');
  });
});

/* ---------------------------------------------------------------------- */
/* Lydiard — phase label                                                     */
/* ---------------------------------------------------------------------- */

describe('getFrameworkStats — lydiard', () => {
  it('shows phaseName in first stat', () => {
    const result = getFrameworkStats(baseInput('lydiard'));
    expect(result[0].label).toBe('phase');
    expect(result[0].value).toBe('Base'); // from template.phaseName
  });

  it('shows weeks to race', () => {
    const phase = makePhase({ daysToRace: 84 }); // ceil(84/7) = 12
    const result = getFrameworkStats(baseInput('lydiard', { programPhase: phase }));
    expect(result[0].subline).toBe('12 wks to race');
  });

  it('shows — for aerobic % when no intensity data', () => {
    const result = getFrameworkStats(baseInput('lydiard', { intensityDist: null }));
    expect(result[3].value).toBe('—');
    expect(result[3].status).toBe('neutral');
  });

  it('shows aerobic % from intensityDist', () => {
    const dist = makeIntensityDist({ easyPct: 85 });
    const result = getFrameworkStats(baseInput('lydiard', { intensityDist: dist }));
    expect(result[3].value).toBe('85%');
    expect(result[3].status).toBe('ok');
  });
});
