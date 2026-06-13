'use client';

import type {
  WeekTemplate,
  DayPlan,
  SessionTarget,
  SessionType,
} from '@/lib/plans/types';
import type { DayEvent } from '@/lib/plans/distribute-events';
import type { FirstDayOfWeek } from '@/lib/store/settings';
import { dowDisplayOrder, dowDisplayLabels } from '@/lib/plans/dow-display';
import { formatSpk } from '@/lib/plans/derive';

/* ============================================================================
 * MatrixRowData — the serialisable row record. Rendered the same way
 * regardless of whether it came from the initial server render or the
 * lazy-expand server action.
 * ========================================================================== */

export interface MatrixRowData {
  weekStartIso: string;
  programWeekNumber: number | null;
  dojo: string | null;
  template: WeekTemplate | null;
  totalActualKm: number | null;
  totalKmTarget: number | null;
  isPast: boolean;
  /**
   * True when this row's template was synthesised by the base-maintenance
   * generator rather than rendered by a coached plan period. The cell
   * UI renders a small `(base)` marker so the runner knows this isn't
   * a coached prescription — just a defensible default.
   */
  isBaseMaintenance?: boolean;
  /**
   * Per-day-of-week compliance flag, indexed [Mon..Sun]. Null entries
   * indicate "no past data to evaluate" — future days, rest days, or
   * days with no scheduled session. Provided only for past weeks where
   * compliance has been computed; null for future weeks.
   */
  dayCompliance?: (DayComplianceFlag | null)[];
  /** Week-level compliance pct (0-100). Null for non-past weeks. */
  weekCompliancePct?: number | null;
  /**
   * Per-day actual activities, indexed [Mon..Sun]. Each day's array
   * lists every activity that occurred on that day, ordered by start
   * time. Empty array (or undefined) means no activities recorded.
   *
   * When present, the cell renders these as stacked pills instead of
   * the planned-session label. Surfaces AM+PM doubles and warmup/
   * workout splits naturally — each Strava activity becomes its own
   * pill in the cell.
   */
  dayActuals?: (DayActual[] | null)[];
  /**
   * Per-day calendar events, indexed [Mon..Sun]. When a day has one or
   * more events (work commitment, holiday, sickness, work-trip), an icon
   * overlay renders in the cell's top-right with a hover-card showing
   * details. Null = no events on that day.
   *
   * Multi-day events (e.g. 5-day holiday) appear on every day they cover
   * within the week, giving a visible streak across the row.
   */
  dayEvents?: (DayEvent[] | null)[];
}

/** A single recorded activity on a day, condensed for matrix display. */
export interface DayActual {
  sportType: string | null;
  distanceKm: number | null;
  movingTimeS: number | null;
  /** seconds per km, derived from avgSpeedMs. Null for non-distance sports. */
  paceSpk: number | null;
  /** Activity name from source (e.g. "Lunch Run", "Tempo Workout"). */
  name: string | null;
  /** Local start time HH:MM, used for chronological ordering + tooltips. */
  startTimeHm: string;
}

/**
 * Compressed compliance signal for a single day. Maps from the engine's
 * SessionCompliance flags down to four buckets the matrix cell renders
 * as a small dot:
 *
 *   'hit'     — at or near target (✓, signal-ok)
 *   'soft'    — close but missed slightly (~, signal-warn)
 *   'miss'    — significantly below or absent (✗, signal-miss)
 *   'planned' — no actual yet (future or in-progress), session scheduled
 *               (faint dot, bone-mute) — placeholder so the at-a-glance
 *               read includes "session is on the calendar today"
 */
export type DayComplianceFlag = 'hit' | 'soft' | 'miss' | 'planned';

/* ============================================================================
 * MatrixHeader — Mon Tue Wed Thu Fri Sat Sun + Total (or Sun-first per pref)
 * ========================================================================== */

export function MatrixHeader({ firstDayOfWeek }: { firstDayOfWeek: FirstDayOfWeek }) {
  const labels = dowDisplayLabels(firstDayOfWeek);
  return (
    <div className="grid grid-cols-[80px_repeat(7,1fr)_70px] gap-px font-display tracking-wide-display uppercase text-[10px] text-bone-mute">
      <div className="px-2 py-1">Week</div>
      {labels.map((d) => (
        <div key={d} className="px-2 py-1 text-center">
          {d}
        </div>
      ))}
      <div className="px-2 py-1 text-right">Total</div>
    </div>
  );
}

/* ============================================================================
 * MatrixRow — single week row
 *
 * "Current week" is detected from the row's date range, not from a prop.
 * That means lazy-loaded rows correctly identify themselves; no need to
 * thread program-week-numbers around.
 * ========================================================================== */

export function MatrixRow({
  row,
  todayDow,
  todayIso,
  firstDayOfWeek,
}: {
  row: MatrixRowData;
  todayDow: number;
  todayIso: string;
  firstDayOfWeek: FirstDayOfWeek;
}) {
  const weekEndIso = addDaysIso(row.weekStartIso, 6);
  const isCurrentWeek = row.weekStartIso <= todayIso && todayIso <= weekEndIso;

  // Build the display column order. dowDisplayOrder returns the internal
  // dow values in the order they should appear left-to-right. Each cell
  // looks up the corresponding internal-indexed data.
  const columnOrder = dowDisplayOrder(firstDayOfWeek);

  const targetTotal = row.totalKmTarget;

  return (
    <div
      className={
        'grid grid-cols-[80px_repeat(7,1fr)_70px] gap-px transition-colors ' +
        (isCurrentWeek
          ? 'border-l-4 border-accent bg-accent/15 shadow-[inset_0_1px_0_0_rgba(255,95,0,0.25),inset_0_-1px_0_0_rgba(255,95,0,0.25)]'
          : 'border-l-2 border-transparent')
      }
    >
      {/* Week marker */}
      <div className="px-2 py-2 flex flex-col justify-center">
        <span className={
          'font-mono tabular-nums ' +
          (isCurrentWeek
            ? 'text-accent text-sm font-semibold'
            : 'text-xs text-bone-dim')
        }>
          {row.isBaseMaintenance
            ? '—'
            : row.programWeekNumber !== null
              ? `W${row.programWeekNumber}`
              : '—'}
        </span>
        <span className={
          'font-mono text-[9px] tabular-nums ' +
          (isCurrentWeek
            ? 'text-accent/80'
            : row.isBaseMaintenance
              ? 'text-bone-mute italic'
              : 'text-bone-mute')
        }>
          {isCurrentWeek
            ? 'THIS WEEK'
            : row.isBaseMaintenance
              ? '(base)'
              : formatShortDate(row.weekStartIso)}
        </span>
      </div>

      {/* Day cells - iterated in display order. Each iteration's `dow`
          is the INTERNAL (Mon=0..Sun=6) day-of-week index. The matrix
          column position is determined by the order in `columnOrder`. */}
      {columnOrder.map((dow) => {
        const day: DayPlan | null = row.template
          ? (row.template.days.find((d) => d.dow === dow) ?? null)
          : null;
        const isToday = isCurrentWeek && dow === todayDow;
        const flag = row.dayCompliance?.[dow] ?? null;
        const actuals = row.dayActuals?.[dow] ?? null;
        const events = row.dayEvents?.[dow] ?? null;
        return (
          <DayCell
            key={dow}
            day={day}
            isToday={isToday}
            complianceFlag={flag}
            actuals={actuals}
            events={events}
          />
        );
      })}

      {/* Total */}
      <div className="px-2 py-2 flex flex-col items-end justify-center">
        {targetTotal !== null && (
          <span className="font-mono text-xs text-bone-dim tabular-nums">
            {targetTotal.toFixed(0)}
          </span>
        )}
        {row.totalActualKm !== null && row.totalActualKm > 0 && (
          <span
            className={
              'font-mono text-[10px] tabular-nums ' +
              (targetTotal !== null
                ? complianceColour(row.totalActualKm, targetTotal)
                : 'text-bone-mute')
            }
          >
            {row.totalActualKm.toFixed(0)}
          </span>
        )}
      </div>
    </div>
  );
}

/* ============================================================================
 * DayCell — single day cell, colour-coded by session type
 *
 * Carries data-session-type attribute so the filter shell can
 * dim non-matching cells via CSS.
 * ========================================================================== */

function DayCell({
  day,
  isToday,
  complianceFlag,
  actuals,
  events,
}: {
  day: DayPlan | null;
  isToday: boolean;
  complianceFlag?: DayComplianceFlag | null;
  actuals?: DayActual[] | null;
  events?: DayEvent[] | null;
}) {
  // Branch 1 — actuals present: stack pills, border from highest-intensity actual
  if (actuals && actuals.length > 0) {
    return (
      <ActualsCell
        actuals={actuals}
        isToday={isToday}
        complianceFlag={complianceFlag}
        events={events}
      />
    );
  }

  // Branch 2 — no plan, no actuals: rest cell. Events still surface on rest days.
  if (!day || day.sessions.length === 0) {
    return (
      <div
        data-session-type="rest"
        className={
          'matrix-cell relative min-h-[44px] px-2 py-1 border ' +
          (isToday ? 'border-accent ring-2 ring-accent ring-inset' : 'border-ink-line/60') +
          ' bg-ink-shadow/30'
        }
      >
        {events && events.length > 0 && <EventOverlay events={events} />}
      </div>
    );
  }

  // Branch 3 — plan only (future or current week without activity yet):
  // render planned-session label
  const primary = pickPrimary(day.sessions);
  const colour = colourFor(primary.type);
  const cellLabel = labelFor(primary, day.sessions);
  const paceLabel = paceLabelFor(primary);

  return (
    <div
      data-session-type={primary.type}
      className={
        'matrix-cell relative min-h-[44px] px-2 py-1 border flex flex-col justify-center ' +
        colour +
        (isToday ? ' ring-2 ring-accent ring-inset' : '')
      }
      title={primary.label}
    >
      <span className="font-mono text-xs leading-tight tabular-nums">
        {cellLabel}
      </span>
      {paceLabel && (
        <span className="font-mono text-[9px] leading-tight opacity-70 tabular-nums">
          {paceLabel}
        </span>
      )}
      {complianceFlag && <ComplianceDot flag={complianceFlag} />}
      {events && events.length > 0 && <EventOverlay events={events} />}
    </div>
  );
}

/**
 * ActualsCell — renders a day's actual activities as stacked pills.
 *
 * Layout:
 *   - Border colour from the highest-intensity actual's sport type
 *     (so a day with a tempo + recovery jog reads as 'tempo')
 *   - Each activity as a one-line pill in chronological order
 *   - Cap at 3 visible pills; 4+ collapses last visible into "+N more"
 *   - Pill content: distance + pace for runs/rides, duration for
 *     non-distance sports (gym, yoga)
 *
 * Cell height is variable: ~44px for one pill, growing with each
 * additional. Bounded at 3 pills tall (~80-100px) by the +N collapse.
 */
function ActualsCell({
  actuals,
  isToday,
  complianceFlag,
  events,
}: {
  actuals: DayActual[];
  isToday: boolean;
  complianceFlag?: DayComplianceFlag | null;
  events?: DayEvent[] | null;
}) {
  const sessionType = inferDominantSessionType(actuals);
  const colour = colourFor(sessionType);

  const MAX_VISIBLE = 3;
  const overflow = actuals.length > MAX_VISIBLE ? actuals.length - (MAX_VISIBLE - 1) : 0;
  const visible = overflow > 0 ? actuals.slice(0, MAX_VISIBLE - 1) : actuals;

  const tooltip = actuals
    .map((a) => `${a.startTimeHm} ${formatActualSummary(a)}${a.name ? ' - ' + a.name : ''}`)
    .join('\n');

  return (
    <div
      data-session-type={sessionType}
      className={
        'matrix-cell relative min-h-[44px] px-2 py-1 border flex flex-col justify-center gap-0.5 ' +
        colour +
        (isToday ? ' ring-2 ring-accent ring-inset' : '')
      }
      title={tooltip}
    >
      {visible.map((a, i) => (
        <ActualPill key={i} actual={a} />
      ))}
      {overflow > 0 && (
        <span className="font-mono text-[9px] leading-tight opacity-70">
          +{overflow} more
        </span>
      )}
      {complianceFlag && <ComplianceDot flag={complianceFlag} />}
      {events && events.length > 0 && <EventOverlay events={events} />}
    </div>
  );
}

/** Single pill row inside an ActualsCell. Distance + pace for runs/rides;
 *  duration only for non-distance sports. Tight to fit 3 in a cell. */
function ActualPill({ actual }: { actual: DayActual }) {
  const summary = formatActualSummary(actual);
  return (
    <span className="font-mono text-xs leading-tight tabular-nums whitespace-nowrap">
      {summary}
    </span>
  );
}

/**
 * Format a single actual activity as a compact pill string.
 *
 *   Run / TrailRun / VirtualRun → "{km}k {m:ss}"   (e.g. "5k 4:15")
 *   Ride / VirtualRide → "{km}k 🚴"                (just distance)
 *   Walk / Hike → "{km}k 🚶"
 *   Strength / WeightTraining / Workout / Yoga → "{mm}m"   (duration only)
 *   Anything else with distance → "{km}k"
 *   Anything else without distance → "{mm}m"
 *
 * Glyphs intentionally minimal — the cell border colour already carries
 * the sport-type signal; pill content focuses on the metric.
 */
function formatActualSummary(a: DayActual): string {
  const isRun =
    a.sportType === 'Run' || a.sportType === 'TrailRun' || a.sportType === 'VirtualRun';
  const isRide =
    a.sportType === 'Ride' || a.sportType === 'VirtualRide' || a.sportType === 'MountainBikeRide';
  const isWalk = a.sportType === 'Walk' || a.sportType === 'Hike';
  const isStrength =
    a.sportType === 'WeightTraining' ||
    a.sportType === 'Workout' ||
    a.sportType === 'Crossfit';
  const isYoga = a.sportType === 'Yoga' || a.sportType === 'StrengthTraining';

  const km = a.distanceKm != null ? a.distanceKm.toFixed(a.distanceKm < 10 ? 1 : 0) : null;
  const mins = a.movingTimeS != null ? Math.round(a.movingTimeS / 60).toString() : null;
  const pace = a.paceSpk != null && isRun ? formatSpk(a.paceSpk) : null;

  if (isRun) {
    if (km && pace) return `${km}k ${pace}`;
    if (km) return `${km}k`;
    return mins ? `${mins}m run` : 'Run';
  }
  if (isRide) {
    return km ? `${km}k ride` : (mins ? `${mins}m ride` : 'Ride');
  }
  if (isWalk) {
    return km ? `${km}k walk` : (mins ? `${mins}m walk` : 'Walk');
  }
  if (isStrength) {
    return mins ? `${mins}m gym` : 'Gym';
  }
  if (isYoga) {
    return mins ? `${mins}m yoga` : 'Yoga';
  }
  // Generic fallback
  if (km) return `${km}k`;
  if (mins) return `${mins}m`;
  return a.sportType ?? '?';
}

/**
 * Pick the highest-intensity SessionType across the day's actuals so the
 * cell border + filter behaviour reflect "the hardest thing that
 * happened that day". Mirrors pickPrimary's logic but operates on
 * Strava sport types (not engine SessionType) and maps each to a
 * legend SessionType for colour lookup.
 */
function inferDominantSessionType(actuals: DayActual[]): SessionType {
  let best: SessionType = 'rest';
  let bestRank = -1;
  for (const a of actuals) {
    const st = sportTypeToSessionType(a.sportType);
    const rank = intensityRank(st);
    if (rank > bestRank) {
      best = st;
      bestRank = rank;
    }
  }
  return best;
}

/**
 * Map a Strava sport_type string to one of our legend SessionType
 * values. Used for colouring actual-activity cells in the matrix.
 *
 * Without HR or pace context we can't tell "easy run" vs "tempo run"
 * vs "interval run" from the sport_type alone — they're all 'Run'.
 * For the legend we use 'easy' as the default for any run; a future
 * Phase 2 enhancement could classify by pace zone against the active
 * plan's targets to upgrade the colour to 'tempo' or 'interval' when
 * appropriate.
 */
function sportTypeToSessionType(sportType: string | null): SessionType {
  if (!sportType) return 'easy';
  switch (sportType) {
    case 'Run':
    case 'TrailRun':
    case 'VirtualRun':
      return 'easy';
    case 'WeightTraining':
    case 'Workout':
    case 'Crossfit':
      return 'strength';
    case 'Yoga':
    case 'StrengthTraining':
      return 'cross';
    case 'Ride':
    case 'VirtualRide':
    case 'MountainBikeRide':
    case 'Walk':
    case 'Hike':
    case 'Swim':
      return 'cross';
    default:
      return 'easy';
  }
}

/**
 * Small compliance signal in the bottom-right of cells where compliance
 * has been evaluated. Four states:
 *   hit     ✓ signal-ok    (achieved)
 *   soft    ~ signal-warn  (close)
 *   miss    ✗ signal-miss  (missed or absent)
 *   planned · bone-mute    (scheduled but not yet evaluable — future or in-progress)
 */
function ComplianceDot({ flag }: { flag: DayComplianceFlag }) {
  if (flag === 'planned') {
    return (
      <span
        className="absolute bottom-0.5 right-1 font-mono text-[10px] leading-none text-bone-mute/50"
        aria-label="compliance: scheduled"
      >
        ·
      </span>
    );
  }

  const classes =
    flag === 'hit'
      ? 'text-signal-ok'
      : flag === 'soft'
      ? 'text-signal-warn'
      : 'text-signal-miss';
  const glyph = flag === 'hit' ? '✓' : flag === 'soft' ? '~' : '✗';
  return (
    <span
      className={
        'absolute bottom-0.5 right-1 font-mono text-[10px] leading-none ' + classes
      }
      aria-label={`compliance: ${flag}`}
    >
      {glyph}
    </span>
  );
}

/**
 * EventOverlay - small icon in top-right of a cell when calendar events
 * apply to that day. Shows the icon for the highest-impact event when
 * multiple are present, and a count badge when there's more than one.
 *
 * Hover/focus reveals a card with all events for that day, each showing
 * type, dates, and notes.
 *
 * Glyphs (compact, mono-friendly, no lucide dependency for the icon
 * itself - just unicode that matches the brand's terminal aesthetic):
 *   - 'holiday'   : H   (holiday)
 *   - 'sickness'  : S   (sickness)
 *   - 'work-trip' : W   (work travel)
 *   - 'other'     : E   (event - generic)
 *
 * We use letter glyphs over emoji because they:
 *   - Render predictably at 9px in the matrix cell
 *   - Match the mono-display brand voice
 *   - Don't introduce render variations across OSes
 */
function EventOverlay({ events }: { events: DayEvent[] }) {
  // Pick highest-priority event for primary glyph
  const primary = pickPrimaryEvent(events);
  const glyph = glyphFor(primary.type);
  const colourClass = colourClassFor(primary.type);
  const showCount = events.length > 1;

  // Build a static, plaintext title attribute as a baseline tooltip
  // (works even before the hover-card animates in, and supports
  // touch/keyboard contexts where hover doesn't apply).
  const titleAttr = events
    .map((e) => `${labelFor_event(e.type)}${e.notes ? ': ' + e.notes : ''} (${formatRange(e.startDate, e.endDate)})`)
    .join('\n');

  return (
    <span
      className={
        'absolute top-0.5 right-1 font-mono text-[9px] leading-none font-semibold tabular-nums ' +
        colourClass
      }
      aria-label={titleAttr}
      title={titleAttr}
    >
      {glyph}
      {showCount && <sup className="ml-0.5">{events.length}</sup>}
    </span>
  );
}

function pickPrimaryEvent(events: DayEvent[]): DayEvent {
  // Priority: sickness > work-trip > holiday > other (most disruptive first)
  const order: Record<DayEvent['type'], number> = {
    sickness: 4,
    'work-trip': 3,
    holiday: 2,
    other: 1,
  };
  return [...events].sort((a, b) => order[b.type] - order[a.type])[0];
}

function glyphFor(type: DayEvent['type']): string {
  switch (type) {
    case 'holiday':
      return 'H';
    case 'sickness':
      return 'S';
    case 'work-trip':
      return 'W';
    case 'other':
      return 'E';
  }
}

function colourClassFor(type: DayEvent['type']): string {
  switch (type) {
    case 'sickness':
      return 'text-signal-miss';
    case 'work-trip':
      return 'text-signal-warn';
    case 'holiday':
      return 'text-accent';
    case 'other':
      return 'text-bone-mute';
  }
}

function labelFor_event(type: DayEvent['type']): string {
  switch (type) {
    case 'holiday':
      return 'Holiday';
    case 'sickness':
      return 'Sickness';
    case 'work-trip':
      return 'Work trip';
    case 'other':
      return 'Event';
  }
}

function formatRange(startIso: string, endIso: string): string {
  if (startIso === endIso) {
    return formatShortDate(startIso);
  }
  return `${formatShortDate(startIso)} - ${formatShortDate(endIso)}`;
}

/* ============================================================================
 * Helpers
 * ========================================================================== */

function pickPrimary(sessions: SessionTarget[]): SessionTarget {
  const ordered = [...sessions].sort((a, b) => intensityRank(b.type) - intensityRank(a.type));
  return ordered[0];
}

function intensityRank(t: SessionType): number {
  switch (t) {
    case 'interval':
    case 'repetition':
      return 6;
    case 'tempo':
      return 5;
    case 'long':
      return 4;
    case 'easy':
      return 3;
    case 'recovery':
      return 2;
    case 'cross':
    case 'strength':
      return 1;
    case 'rest':
      return 0;
    default:
      return 0;
  }
}

function labelFor(primary: SessionTarget, all: SessionTarget[]): string {
  if (primary.type === 'interval' || primary.type === 'repetition') {
    const m = /(\d+\s*x\s*\d+)/i.exec(primary.label);
    if (m) return m[1].replace(/\s+/g, '');
  }

  if (primary.distanceKmMin && primary.distanceKmMax) {
    const mid = (primary.distanceKmMin + primary.distanceKmMax) / 2;
    const hasStrength = all.some((s) => s.type === 'strength');
    return hasStrength ? `${mid.toFixed(0)}/Gym` : mid.toFixed(0);
  }

  if (primary.distanceKmMin) return primary.distanceKmMin.toFixed(0);

  if (primary.type === 'strength') return 'Gym';
  if (primary.type === 'rest') return '';
  if (primary.type === 'cross') return 'Cross';

  return primary.label.split(/[—@,]/)[0].trim().slice(0, 8);
}

function paceLabelFor(s: SessionTarget): string | null {
  if ((s.type === 'interval' || s.type === 'repetition' || s.type === 'tempo') && s.paceZone) {
    return formatSpk(s.paceZone.minSpk);
  }
  return null;
}

/**
 * Colour mapping per session type. Reuses brand tokens — accent is the
 * canonical Night Ninjas orange, signal-* for compliance.
 *
 * Cell backgrounds are translucent so cells read as a wash; borders are
 * stronger (60% opacity) so each cell is visibly framed in its
 * legend-colour. Together this means each cell carries the legend
 * colour twice — once around it (border) and once through it (fill).
 *
 * Legend swatches use the saturated solid version of the same hue
 * (see swatchClassFor) so the tiny swatches in the sidebar are legible.
 */
export function colourFor(t: SessionType): string {
  switch (t) {
    case 'interval':
    case 'repetition':
      return 'border-bone-mute/70 bg-bone-mute/10 text-bone-dim';
    case 'tempo':
      return 'border-signal-ok/60 bg-signal-ok/10 text-signal-ok';
    case 'long':
      return 'border-matrix-long/60 bg-matrix-long/10 text-matrix-long';
    case 'easy':
    case 'recovery':
      return 'border-accent/60 bg-accent/10 text-accent';
    case 'cross':
    case 'strength':
      return 'border-matrix-strength/70 bg-matrix-strength/15 text-matrix-long';
    case 'rest':
      return 'border-ink-line/60 bg-ink-shadow/30 text-bone-mute';
  }
}

/**
 * Solid swatch colour for a session type — used in the legend so the
 * tiny swatches actually read at small sizes. Cells use the translucent
 * version above; legend uses this saturated version.
 */
export function swatchClassFor(t: SessionType): string {
  switch (t) {
    case 'interval':
    case 'repetition':
      return 'bg-bone-mute';
    case 'tempo':
      return 'bg-signal-ok';
    case 'long':
      return 'bg-matrix-long';
    case 'easy':
    case 'recovery':
      return 'bg-accent';
    case 'cross':
    case 'strength':
      return 'bg-matrix-strength';
    case 'rest':
      return 'bg-bone-mute/40 border border-ink-line';
  }
}

function complianceColour(actual: number, target: number): string {
  const pct = (actual / target) * 100;
  if (pct >= 95 && pct <= 110) return 'text-signal-ok';
  if (pct >= 85 && pct < 95) return 'text-signal-warn';
  return 'text-signal-miss';
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatShortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
  return `${d.getDate()} ${month}`;
}
