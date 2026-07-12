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
  | 'custom'
  | 'ai-coach';
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
 * to the runner's actual life.
 * -------------------------------------------------------------------------- */

/** A recurring weekly session that should override or augment the dojo default. */
export interface RecurringSessionBinding {
  dow: Dow;
  intent: 'easy' | 'long' | 'tempo' | 'interval' | 'group-easy';
  label: string;
  distanceKm?: number;
  durationMin?: number;
}

/** A calendar event that affects training load this week. */
export type ImpactLevel = 'no-training' | 'reduced' | 'travel-only' | 'normal';

export interface WeekEvent {
  startDate: string;
  endDate: string;
  type: 'sickness' | 'holiday' | 'work-trip' | 'other';
  impact: ImpactLevel;
  notes?: string;
}

export interface WeekContext {
  weekStartIso: string;
  weekEndIso: string;
  goalRace: { date: string; distanceKm: number; targetTimeS: number } | null;
  tuneupRaces: { date: string; distanceKm: number; name: string }[];
  recurringSessions: RecurringSessionBinding[];
  events: WeekEvent[];
  ninjaLoopDays: Dow[];
}

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
 * reshapes a week.
 * -------------------------------------------------------------------------- */

export interface TaperConfig {
  schedule: { withinDays: number; factor: number }[];
  raceWeekStyle: 'two-day-rest' | 'short-shakeouts' | 'lydiard-fast-finish';
}

export interface VolumeScaleConfig {
  reducedFactor: number;
  travelOnlyFactor: number;
  noTrainingZeroesOut: boolean;
}

export interface TuneupConfig {
  enabled: boolean;
  taperDays: number;
  recoveryDays: number;
}

export interface CalendarConfig {
  taper: TaperConfig;
  volumeScale: VolumeScaleConfig;
  tuneups: TuneupConfig;
  honourRecurringSessions: boolean;
  annotateNinjaLoops: boolean;
}

/* ----------------------------------------------------------------------------
 * Phase banding and dojo state profile.
 * -------------------------------------------------------------------------- */

export type PhaseBand = 'base' | 'build' | 'peak' | 'taper' | 'off-program';

export interface DojoStateProfile {
  tsbFloor: Record<Exclude<PhaseBand, 'off-program'>, number>;
  protectedTypes: SessionType[];
  preferIntensityCut: boolean;
}

/* ----------------------------------------------------------------------------
 * PlanEngine — the contract every dojo implements.
 * -------------------------------------------------------------------------- */

export interface PlanEngine {
  dojo: Dojo;
  displayName: string;
  philosophy: string;
  defaultProgramWeeks: number;
  defaultLongRunCapKm: number;
  entryWeeklyLoadKm(level: 'beginner' | 'intermediate' | 'advanced'): number;
  status: 'full' | 'scaffold' | 'stub';
  calendarConfig: CalendarConfig;
  derivePaceZones(params: PlanParams): PaceZones;
  renderWeek(params: PlanParams, weekNumber: number, context?: WeekContext): WeekTemplate;
  stateProfile?: DojoStateProfile;
}
