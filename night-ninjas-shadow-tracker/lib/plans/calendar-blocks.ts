/**
 * Calendar building blocks — composable, opinionated transforms that
 * each dojo picks from according to its own training philosophy.
 *
 * Earlier versions had a one-size-fits-all pipeline. That was a
 * mistake — different plans taper differently, scale volume
 * differently, and have different opinions on tune-up handling.
 *
 * Now each block is a pure function `(template, context, config, zones) => template`.
 * The engine composes its own pipeline by calling the blocks it wants
 * with its own configs. Universal blocks (recurring substitution, ninja
 * loops) take no config; opinionated blocks (taper, scale, tune-up)
 * take dojo-specific config.
 *
 * Adding a new dojo means: write `renderRaw()`, declare a CalendarConfig,
 * compose the blocks. No surgery here.
 */

import type {
  WeekTemplate,
  WeekContext,
  WeekAdaptation,
  WeekEvent,
  Dow,
  SessionTarget,
  PaceZones,
  TaperConfig,
  VolumeScaleConfig,
  TuneupConfig,
} from './types';

/* ============================================================================
 * Block: Taper
 * ============================================================================
 */

/**
 * Apply taper logic if the goal race is within the configured horizon.
 * Race week itself gets a custom structure (raceWeekStyle).
 */
export function applyTaper(
  template: WeekTemplate,
  context: WeekContext | undefined,
  config: TaperConfig
): WeekTemplate {
  if (!context?.goalRace) return template;

  const goalDate = new Date(context.goalRace.date);
  const weekStart = new Date(context.weekStartIso);
  const weekEnd = new Date(context.weekEndIso);

  // Race week — race day falls inside the week
  if (goalDate >= weekStart && goalDate <= weekEnd) {
    return makeRaceWeek(template, goalDate, weekStart, context, config);
  }

  // Pre-race tapering — find first matching horizon
  const daysToGoal = Math.floor((goalDate.getTime() - weekEnd.getTime()) / 86400000);
  if (daysToGoal < 0) return template;

  // Sort schedule descending by withinDays so we pick the most-restrictive match
  const sorted = [...config.schedule].sort((a, b) => a.withinDays - b.withinDays);
  for (const rule of sorted) {
    if (daysToGoal < rule.withinDays) {
      return scaleVolume(
        template,
        rule.factor,
        {
          kind: 'taper',
          label: 'Taper week',
          detail: `Goal race in ${daysToGoal + 1} days — volume × ${rule.factor.toFixed(2)}`,
        }
      );
    }
  }

  return template;
}

function makeRaceWeek(
  template: WeekTemplate,
  goalDate: Date,
  weekStart: Date,
  context: WeekContext,
  config: TaperConfig
): WeekTemplate {
  const daysFromMonday = Math.floor((goalDate.getTime() - weekStart.getTime()) / 86400000);
  const goalDow = ((daysFromMonday % 7) + 7) % 7 as Dow;
  const distanceKm = context.goalRace?.distanceKm ?? 42.195;

  const days = [];
  for (let dow = 0; dow < 7; dow++) {
    if (dow === goalDow) {
      days.push({
        dow: dow as Dow,
        sessions: [{
          label: `Goal race (${distanceKm.toFixed(distanceKm % 1 === 0 ? 0 : 1)}K)`,
          type: 'long' as const,
          distanceKmMin: distanceKm,
          distanceKmMax: distanceKm,
        }],
      });
    } else {
      days.push({
        dow: dow as Dow,
        sessions: raceWeekSessionFor(config.raceWeekStyle, dow, goalDow),
      });
    }
  }

  return {
    ...template,
    phaseName: 'Race week',
    totalKmTarget: Math.round(distanceKm + (config.raceWeekStyle === 'lydiard-fast-finish' ? 30 : 12)),
    longRunKmTarget: distanceKm,
    days,
    adaptations: [
      ...(template.adaptations ?? []),
      {
        kind: 'taper',
        label: 'Race week',
        detail: `Goal race on ${goalDate.toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'short' })}`,
      },
    ],
  };
}

function raceWeekSessionFor(
  style: TaperConfig['raceWeekStyle'],
  dow: number,
  goalDow: number
): SessionTarget[] {
  const daysBefore = goalDow - dow;

  if (style === 'two-day-rest') {
    if (daysBefore < 0) return [{ label: 'Recovery walk / rest', type: 'rest' }];
    if (daysBefore <= 2) return [{ label: 'Rest', type: 'rest' }];
    return [{ label: 'Easy shakeout', type: 'easy', distanceKmMin: 3, distanceKmMax: 6 }];
  }

  if (style === 'short-shakeouts') {
    if (daysBefore < 0) return [{ label: 'Recovery walk / rest', type: 'rest' }];
    if (daysBefore === 1) return [{ label: 'Pre-race shakeout', type: 'easy', distanceKmMin: 3, distanceKmMax: 5 }];
    if (daysBefore === 2) return [{ label: 'Rest', type: 'rest' }];
    return [{ label: 'Easy + strides', type: 'easy', distanceKmMin: 5, distanceKmMax: 8 }];
  }

  if (style === 'lydiard-fast-finish') {
    // Lydiard-style sharpening — sharper short efforts in race week
    if (daysBefore < 0) return [{ label: 'Recovery / easy', type: 'rest' }];
    if (daysBefore === 1) return [{ label: 'Rest', type: 'rest' }];
    if (daysBefore === 2) return [{ label: 'Strides', type: 'repetition', distanceKmMin: 4, distanceKmMax: 6 }];
    if (daysBefore === 3) return [{ label: 'Rest', type: 'rest' }];
    return [{ label: 'Easy run', type: 'easy', distanceKmMin: 6, distanceKmMax: 10 }];
  }

  return [{ label: 'Easy shakeout', type: 'easy', distanceKmMin: 3, distanceKmMax: 6 }];
}

/* ============================================================================
 * Block: Volume scaling for commitments
 * ============================================================================
 */

export function applyCommitmentScaling(
  template: WeekTemplate,
  context: WeekContext | undefined,
  config: VolumeScaleConfig
): WeekTemplate {
  if (!context || context.events.length === 0) return template;

  const overlapping = context.events.filter((e) => eventOverlapsWeek(e, context));
  if (overlapping.length === 0) return template;

  const impact = mostRestrictiveImpact(overlapping);
  if (impact === 'normal') return template;

  if (impact === 'no-training') {
    return {
      ...template,
      totalKmTarget: 0,
      longRunKmTarget: config.noTrainingZeroesOut ? 0 : template.longRunKmTarget,
      days: template.days.map((d) => ({
        dow: d.dow,
        sessions: [{ label: 'Rest (commitment)', type: 'rest' }],
      })),
      adaptations: [
        ...(template.adaptations ?? []),
        {
          kind: 'no-training',
          label: 'No training week',
          detail: describeEvents(overlapping),
        },
      ],
    };
  }

  if (impact === 'travel-only') {
    return {
      ...template,
      totalKmTarget: Math.round(template.totalKmTarget * config.travelOnlyFactor),
      longRunKmTarget: 0,
      days: template.days.map((d) => ({
        dow: d.dow,
        sessions: d.sessions.map((s) =>
          s.type === 'rest'
            ? s
            : ({
                label: 'Easy travel run',
                type: 'easy' as const,
                paceZone: s.paceZone,
                distanceKmMin: 3,
                distanceKmMax: 6,
              } satisfies SessionTarget)
        ),
      })),
      adaptations: [
        ...(template.adaptations ?? []),
        {
          kind: 'travel-only',
          label: 'Travel-only week',
          detail: describeEvents(overlapping),
        },
      ],
    };
  }

  if (impact === 'reduced') {
    return scaleVolume(
      template,
      config.reducedFactor,
      {
        kind: 'reduced',
        label: 'Reduced training',
        detail: describeEvents(overlapping),
      }
    );
  }

  return template;
}

/* ============================================================================
 * Block: Recurring sessions (universal)
 * ============================================================================
 */

export function substituteRecurringSessions(
  template: WeekTemplate,
  context: WeekContext | undefined,
  zones: PaceZones
): WeekTemplate {
  if (!context || context.recurringSessions.length === 0) return template;

  const days = template.days.map((day) => {
    const recurring = context.recurringSessions.find((r) => r.dow === day.dow);
    if (!recurring) return day;
    return {
      ...day,
      sessions: [recurringToSession(recurring, zones)],
    };
  });

  return {
    ...template,
    days,
    adaptations: [
      ...(template.adaptations ?? []),
      {
        kind: 'group-run',
        label: 'Group runs slotted',
        detail: context.recurringSessions
          .map((r) => `${dowName(r.dow)} ${r.label}`)
          .join(' · '),
      },
    ],
  };
}

function recurringToSession(
  r: { intent: 'easy' | 'long' | 'tempo' | 'interval' | 'group-easy'; label: string; distanceKm?: number; durationMin?: number },
  zones: PaceZones
): SessionTarget {
  switch (r.intent) {
    case 'tempo':
      return {
        label: r.label,
        type: 'tempo',
        paceZone: zones.threshold,
        distanceKmMin: r.distanceKm,
        distanceKmMax: r.distanceKm,
      };
    case 'interval':
      return {
        label: r.label,
        type: 'interval',
        paceZone: zones.interval,
        distanceKmMin: r.distanceKm,
        distanceKmMax: r.distanceKm,
      };
    case 'long':
      return {
        label: r.label,
        type: 'long',
        paceZone: zones.long,
        distanceKmMin: r.distanceKm,
        distanceKmMax: r.distanceKm,
      };
    default:
      return {
        label: r.label,
        type: 'easy',
        paceZone: zones.easy,
        distanceKmMin: r.distanceKm,
        distanceKmMax: r.distanceKm,
        durationMinMin: r.durationMin,
        durationMinMax: r.durationMin,
      };
  }
}

/* ============================================================================
 * Block: Tune-up race adjustments
 * ============================================================================
 */

export function applyTuneupAdjustments(
  template: WeekTemplate,
  context: WeekContext | undefined,
  config: TuneupConfig
): WeekTemplate {
  if (!config.enabled || !context || context.tuneupRaces.length === 0) {
    return template;
  }

  const weekStart = new Date(context.weekStartIso);
  let days = [...template.days];

  for (const race of context.tuneupRaces) {
    const raceDate = new Date(race.date);
    const daysFromMonday = Math.floor((raceDate.getTime() - weekStart.getTime()) / 86400000);
    if (daysFromMonday < 0 || daysFromMonday > 6) continue;
    const raceDow = daysFromMonday as Dow;

    days = days.map((d) => {
      if (d.dow === raceDow) {
        return {
          dow: d.dow,
          sessions: [{
            label: `Tune-up race · ${race.name}`,
            type: 'long' as const,
            distanceKmMin: race.distanceKm,
            distanceKmMax: race.distanceKm,
          }],
        };
      }
      const distanceFromRace = Math.abs(d.dow - raceDow);
      if (d.dow < raceDow && distanceFromRace <= config.taperDays) {
        return {
          dow: d.dow,
          sessions: [{ label: 'Pre-race easy', type: 'easy' as const, distanceKmMin: 3, distanceKmMax: 6 }],
        };
      }
      if (d.dow > raceDow && distanceFromRace <= config.recoveryDays) {
        return {
          dow: d.dow,
          sessions: [{ label: 'Recovery', type: 'recovery' as const, distanceKmMin: 0, distanceKmMax: 5 }],
        };
      }
      return d;
    });
  }

  return {
    ...template,
    days,
    adaptations: [
      ...(template.adaptations ?? []),
      {
        kind: 'tuneup-race',
        label: 'Tune-up race',
        detail: context.tuneupRaces.map((r) => `${r.name} ${r.date}`).join('; '),
      },
    ],
  };
}

/* ============================================================================
 * Block: Ninja Loop annotations (universal)
 * ============================================================================
 */

export function annotateNinjaLoopDays(
  template: WeekTemplate,
  context: WeekContext | undefined
): WeekTemplate {
  if (!context || context.ninjaLoopDays.length === 0) return template;

  return {
    ...template,
    adaptations: [
      ...(template.adaptations ?? []),
      {
        kind: 'ninja-loop',
        label: 'Ninja Loop',
        detail: `${context.ninjaLoopDays.map(dowName).join(', ')} — group meet day`,
      },
    ],
  };
}

/* ============================================================================
 * Helpers
 * ============================================================================
 */

function scaleVolume(
  template: WeekTemplate,
  factor: number,
  adaptation: WeekAdaptation
): WeekTemplate {
  return {
    ...template,
    totalKmTarget: Math.round(template.totalKmTarget * factor),
    longRunKmTarget: Math.round(template.longRunKmTarget * factor),
    days: template.days.map((d) => ({
      dow: d.dow,
      sessions: d.sessions.map((s) => {
        if (s.type === 'rest') return s;
        return {
          ...s,
          distanceKmMin: s.distanceKmMin != null ? Math.round(s.distanceKmMin * factor * 10) / 10 : undefined,
          distanceKmMax: s.distanceKmMax != null ? Math.round(s.distanceKmMax * factor * 10) / 10 : undefined,
        };
      }),
    })),
    adaptations: [...(template.adaptations ?? []), adaptation],
  };
}

function eventOverlapsWeek(e: WeekEvent, context: WeekContext): boolean {
  return e.startDate <= context.weekEndIso && e.endDate >= context.weekStartIso;
}

function mostRestrictiveImpact(events: WeekEvent[]): WeekEvent['impact'] {
  const order: WeekEvent['impact'][] = ['no-training', 'travel-only', 'reduced', 'normal'];
  for (const level of order) {
    if (events.some((e) => e.impact === level)) return level;
  }
  return 'normal';
}

function describeEvents(events: WeekEvent[]): string {
  return events
    .map((e) => `${e.type.replace('-', ' ')} (${e.startDate} → ${e.endDate})`)
    .join('; ');
}

const DOW_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
function dowName(d: Dow): string {
  return DOW_NAMES[d];
}

/* ============================================================================
 * Pre-built composer for "structured plan with full calendar awareness"
 *
 * Most structured dojos want all five blocks applied in the conventional
 * order. This helper just wires that up so engines don't have to repeat
 * the boilerplate. Engines can still call individual blocks if they want
 * a different order or to skip steps.
 * ============================================================================
 */

export function applyStructuredCalendar(
  template: WeekTemplate,
  context: WeekContext | undefined,
  zones: PaceZones,
  config: import('./types').CalendarConfig
): WeekTemplate {
  let t = { ...template, adaptations: template.adaptations ?? [] };

  // Order matters: taper before scaling so race week is locked in,
  // then scaling so commitments override taper if user is sick during taper.
  t = applyTaper(t, context, config.taper);
  t = applyCommitmentScaling(t, context, config.volumeScale);
  if (config.honourRecurringSessions) {
    t = substituteRecurringSessions(t, context, zones);
  }
  t = applyTuneupAdjustments(t, context, config.tuneups);
  if (config.annotateNinjaLoops) {
    t = annotateNinjaLoopDays(t, context);
  }
  return t;
}
