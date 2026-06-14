/**
 * Plan engine types.
 *
 * Each plan (Lydiard / Hansons / Custom) implements `PlanEngine`. The engine
 * derives weekly templates from a goal + level, and the report compares
 * actual activities against the template.
 *
 * Adding a new plan = one new file implementing `PlanEngine`. No surgery
 * elsewhere.
 */

export type Dojo =
  | 'lydiard'
  | 'hansons'
  | 'norwegian-singles'
  | 'daniels'
  | 'pfitzinger'
  | 'higdon'
  | 'polarised'
  | 'ultra'
  | 'custom';
export type Level = 'beginner' | 'intermediate' | 'advanced';

/** Day-of-week. ISO order — Mon=0, Sun=6. */
export type Dow = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/* ----------------------------------------------------------------------------
 * Pace zones — the universal currency. Every plan reduces to these.
 * Stored as seconds-per-km. min/max define an acceptable band.
 * -------------------------------------------------------------------------- */
export interface PaceZone {
  minSpk: number; // sec/km, faster end of band (smaller number)
  maxSpk: number; // sec/km, slower end of band
}

export interface PaceZones {
  recovery: PaceZone;
  easy: PaceZone;
  long: PaceZone;
  marathon: PaceZone;   // marathon pace (MP)
  threshold: PaceZone;  // tempo / lactate threshold
  interval: PaceZone;   // 5K-ish race pace
  repetition: PaceZone; // 1500m / mile race pace
}

/* ----------------------------------------------------------------------------
 * Session prescription — what the plan asks for on a given day.
 * -------------------------------------------------------------------------- */
export type SessionType =
  | 'recovery'     // Very easy, often optional
  | 'easy'         // Aerobic base
  | 'long'         // Long run
  | 'tempo'        // Threshold / marathon-pace effort
  | 'interval'     // VO2max work
  | 'repetition'   // Speed / form / neuromuscular
  | 'cross'        // Bike, swim, etc — duration-based
  | 'strength'     // Resistance work — duration-based
  | 'rest';        // Explicit rest day

export interface SessionTarget {
  /** Display label. e.g. "Tue tempo @ MP" */
  label: string;
  type: SessionType;
  /** Pace band for run-types. Undefined for cross/strength/rest. */
  paceZone?: PaceZone;
  /** Target distance range (km). Undefined = any. */
  distanceKmMin?: number;
  distanceKmMax?: number;
  /** Target duration range (minutes). Used for cross/strength. */
  durationMinMin?: number;
  durationMinMax?: number;
  /** Optional descriptive notes shown in tooltips. */
  notes?: string;
}

export interface DayPlan {
  dow: Dow;
  /** Multiple sessions allowed per day (e.g. easy run + strength). */
  sessions: SessionTarget[];
}

/* ----------------------------------------------------------------------------
 * WeekTemplate — what the runner is meant to do this week.
 * -------------------------------------------------------------------------- */
export interface WeekTemplate {
  weekNumber: number;       // 1-indexed, week of the program
  phaseName: string;        // "Base", "Build", "Peak", "Taper"
  totalKmTarget: number;    // weekly volume target
  longRunKmTarget: number;  // longest single run target
  days: DayPlan[];
  /** Notes shown at the top of the weekly report. */
  notes?: string;
  /**
   * Calendar adaptations applied to this week. Used by the UI to show
   * the runner what got changed and why. Empty array means "raw plan,
   * nothing was adapted from the calendar."
   */
  adaptations?: WeekAdaptation[];
}

/** A change made to the raw template by the calendar pipeline. */
export interface WeekAdaptation {
  kind: 'taper' | 'reduced' | 'no-training' | 'travel-only' | 'group-run' | 'tuneup-race' | 'ninja-loop';
  /** Short label for UI display. */
  label: string;
  /** Optional supporting detail. */
  detail?: string;
}

/** Augmented session target with origin metadata. */
export interface SessionTargetWithOrigin extends SessionTarget {
  /** Where this session came from. 'engine' = raw plan output. */
  origin?: 'engine' | 'group-run' | 'tuneup-race' | 'rest-injected' | 'taper';
}

/* ----------------------------------------------------------------------------
 * Plan parameters — what the user picks in the wizard.
 * -------------------------------------------------------------------------- */
export interface PlanParams {
  goalDistanceKm: number;     // 42.195 = marathon, 21.0975 = HM, 10 = 10K
  goalTimeS: number;          // target finish time, seconds
  level: Level;
  /** Optional volume cap — for users like Matt who break above 85km/wk. */
  weeklyVolumeCapKm?: number;
  /** Optional long-run cap — Hansons defaults to 26km. */
  longRunCapKm?: number;
  /** Total program length in weeks. Each plan defines its default. */
  programWeeks?: number;
  /** Date the program starts (ISO YYYY-MM-DD). Drives week numbering. */
  startDate: string;
}

/* ----------------------------------------------------------------------------
 * WeekContext — calendar-aware inputs that adapt the engine's raw template
 * to the runner's actual life. Built by the active-plan resolver from
 * races + recurring sessions + calendar events + holidays.
 *
 * If you pass `null` (or an empty/default context), the engine returns its
 * uncalibrated raw template — useful for previewing a generic plan.
 * -------------------------------------------------------------------------- */

/** A recurring weekly session that should override or augment the dojo default. */
export interface RecurringSessionBinding {
  dow: Dow;
  /** What kind of session — drives whether it replaces a quality day or fills an easy slot. */
  intent: 'easy' | 'long' | 'tempo' | 'interval' | 'group-easy';
  /** Display label used in the rendered week (e.g. "Shoe Science Tuesday"). */
  label: string;
  /** Optional distance / duration the user knows the group covers. */
  distanceKm?: number;
  durationMin?: number;
}

/** A calendar event that affects training load this week. */
export type ImpactLevel = 'no-training' | 'reduced' | 'travel-only' | 'normal';

export interface WeekEvent {
  /** Inclusive ISO start. */
  startDate: string;
  /** Inclusive ISO end. */
  endDate: string;
  type: 'sickness' | 'holiday' | 'work-trip' | 'other';
  impact: ImpactLevel;
  notes?: string;
}

/** Context describing this specific week of training, used to adapt the template. */
export interface WeekContext {
  /** ISO date of this week's Monday. */
  weekStartIso: string;
  /** ISO date of this week's Sunday. */
  weekEndIso: string;

  /** The athlete's goal race, if it falls during the program. */
  goalRace: { date: string; distanceKm: number; targetTimeS: number } | null;

  /** Tune-up races that fall in this week (excludes goal race). */
  tuneupRaces: { date: string; distanceKm: number; name: string }[];

  /** Recurring sessions active this week. */
  recurringSessions: RecurringSessionBinding[];

  /** Calendar events overlapping this week. */
  events: WeekEvent[];

  /** Day-of-weeks that are NZ public holidays with Ninja Loop set. */
  ninjaLoopDays: Dow[];
}

/** Empty/default context — useful for tests or when no calendar data exists. */
export function emptyWeekContext(weekStartIso: string, weekEndIso: string): WeekContext {
  return {
    weekStartIso,
    weekEndIso,
    goalRace: null,
    tuneupRaces: [],
    recurringSessions: [],
    events: [],
    ninjaLoopDays: [],
  };
}

/* ----------------------------------------------------------------------------
 * CalendarConfig — each dojo declares its opinion on how the calendar
 * reshapes a week. The engine consumes its own config when composing
 * the calendar building blocks in renderWeek().
 *
 * Some blocks are universal (recurring substitution, ninja loop annotation);
 * the dojo can opt out of those via the booleans. Other blocks (taper,
 * volume scaling, tune-up handling) are configured by the dojo's training
 * philosophy.
 * -------------------------------------------------------------------------- */

export interface TaperConfig {
  /**
   * Volume multipliers applied when the goal race is N days away.
   * Ordered by descending day-count — the first matching threshold wins.
   * e.g. [{ days: 14, factor: 0.85 }, { days: 7, factor: 0.7 }] means
   * within 14 days reduce 15%, within 7 days reduce 30%.
   */
  schedule: { withinDays: number; factor: number }[];
  /** What kind of race week structure to render. */
  raceWeekStyle: 'two-day-rest' | 'short-shakeouts' | 'lydiard-fast-finish';
}

export interface VolumeScaleConfig {
  /** Factor applied for `reduced` impact events. */
  reducedFactor: number;
  /** Factor applied for `travel-only` impact events. */
  travelOnlyFactor: number;
  /** Whether 'no training' weeks should also remove the long run. */
  noTrainingZeroesOut: boolean;
}

export interface TuneupConfig {
  /** Whether tune-up races should rearrange the surrounding week. */
  enabled: boolean;
  /** How many days before a tune-up to ease off. */
  taperDays: number;
  /** How many days after to recover. */
  recoveryDays: number;
}

export interface CalendarConfig {
  taper: TaperConfig;
  volumeScale: VolumeScaleConfig;
  tuneups: TuneupConfig;
  /** Whether to substitute group runs in for the engine's prescribed sessions. */
  honourRecurringSessions: boolean;
  /** Whether to annotate Ninja Loop days. */
  annotateNinjaLoops: boolean;
}

/* ----------------------------------------------------------------------------
 * PlanEngine — the contract every dojo implements.
 * -------------------------------------------------------------------------- */
/* ----------------------------------------------------------------------------
 * Phase 3b - dojo state profile. The training philosophy expressed as data:
 * how much fatigue this method tolerates per phase, which sessions are its
 * signature (never cut by soft adjustments), and whether it prefers to ease
 * intensity or volume when the athlete is over-fatigued.
 * -------------------------------------------------------------------------- */

export type PhaseBand = 'base' | 'build' | 'peak' | 'taper' | 'off-program';

export interface DojoStateProfile {
  tsbFloor: Record<Exclude<PhaseBand, 'off-program'>, number>;
  protectedTypes: SessionType[];
  preferIntensityCut: boolean;
}

export interface PlanEngine {
  /** Identifier — must match the Dojo union. */
  dojo: Dojo;
  /** Human-readable name. */
  displayName: string;
  /** One-paragraph philosophy summary (shown in the dojo picker). */
  philosophy: string;
  /** Default program length in weeks if user doesn't override. */
  defaultProgramWeeks: number;
  /** Default long-run cap in km. */
  defaultLongRunCapKm: number;

  /**
   * Expected weekly running load (km) the athlete should be at to enter
   * Week 1 of this program safely, indexed by athlete level.
   *
   * This is what powers the "ramp" surface: the system compares the
   * athlete's actual chronic load (CTL-derived weekly km from the last
   * 90 days) against this entry expectation. If the gap is too big for
   * the time available before the program starts, we warn early.
   *
   * Sources:
   * - Hansons book recommends 25-40km/wk before Week 1 by level
   * - Lydiard expects much higher base (50+km/wk for intermediate)
   * - Daniels assumes mileage matches goal-pace zones
   * - Pfitzinger has explicit per-level entry tables
   *
   * Custom dojo returns the user's current chronic load (no warning).
   */
  entryWeeklyLoadKm(level: 'beginner' | 'intermediate' | 'advanced'): number;

  /**
   * Implementation status. 'full' = fleshed out, 'scaffold' = baseline
   * weeks work but week-by-week specifics are rough, 'stub' = registered
   * but explicit "coming next" placeholder.
   * Surfaced in the dojo picker so users know what they're choosing.
   */
  status: 'full' | 'scaffold' | 'stub';

  /** This dojo's calendar opinion. */
  calendarConfig: CalendarConfig;

  /**
   * Derive pace zones for the given parameters. The same goal may produce
   * subtly different zones across plans — Hansons tempo is at MP, Daniels
   * tempo is at lactate threshold (faster).
   */
  derivePaceZones(params: PlanParams): PaceZones;

  /**
   * Render the week template for a given week number.
   *
   * The engine produces its raw template, then composes calendar building
   * blocks (taper, volumeScale, recurring substitution, etc) according to
   * its own CalendarConfig.
   *
   * weekNumber is 1-indexed and capped at programWeeks.
   */
  renderWeek(params: PlanParams, weekNumber: number, context?: WeekContext): WeekTemplate;
  /**
   * Phase 3b - fatigue tolerance profile. Optional; engines without one
   * are interpreted with DEFAULT_PROFILE (conservative).
   */
  stateProfile?: DojoStateProfile;
}
