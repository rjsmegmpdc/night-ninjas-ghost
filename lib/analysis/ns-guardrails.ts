/**
 * NS-2 / NS-3 - Norwegian Singles guardrails (PURE).
 *
 * No DB, no server-only. These encode the discipline that makes the
 * Norwegian Singles method work, and the classic ways amateurs break it:
 *
 *   1. EASY-DAY DISCIPLINE: easy days must be genuinely easy. If an easy /
 *      recovery / long session is run above the easy HR ceiling, the easy
 *      days stop protecting the quality days. The single most common NS
 *      failure after #2.
 *
 *   2. REP-TOO-HOT: sub-threshold means LT1-adjacent, NOT LT2/VO2. If a
 *      quality session's intensity lands at interval/threshold-max effort,
 *      the athlete is running reps too hot - the defining NS mistake.
 *      "I could do several more reps" is the calibration; reps at true
 *      threshold fail that test.
 *
 *   3. QUALITY-CAP METER: accumulated quality time should stay ~20-25% of
 *      weekly volume (the engine pins 22%). Over-cap means too much fast
 *      running; well under means the stimulus may be too low.
 *
 *   4. MAX-HR VALIDITY GUARD: HR-reserve zones are only as good as the max
 *      HR they're built on. Flag two problems: (a) zones derived from the
 *      age-predicted 220-age estimate rather than a measured max (220-age
 *      has a standard error of ~10-12 bpm - useless for individual zoning);
 *      (b) an observed activity max HR that exceeds the configured max,
 *      which proves the configured value is too low.
 *
 * Intensity is expressed as HR reserve (Karvonen fraction 0..1), the same
 * basis as the load engine, so a value maps to the same zones:
 *   easy < 0.70 <= marathon < 0.82 <= threshold < 0.88 <= interval
 */

export const EASY_CEILING_RESERVE = 0.70;   // at/above this, not easy
export const SUBT_HOT_RESERVE = 0.88;        // at/above this, rep is LT2+ (too hot)
export const QUALITY_TARGET_FRACTION = 0.22; // engine's pinned quality cap
export const QUALITY_BAND = { low: 0.20, high: 0.25 };

export type GuardSeverity = 'ok' | 'warn' | 'miss';

export interface GuardFlag {
  severity: GuardSeverity;
  title: string;
  body: string;
}

/* ---- 1. Easy-day discipline --------------------------------------------- */

export interface SessionSample {
  dateIso: string;
  /** Prescribed/category intent: easy | long | recovery | quality | other */
  kind: 'easy' | 'long' | 'recovery' | 'quality' | 'other';
  /** Karvonen HR reserve fraction 0..1, or null when no HR available */
  reserve: number | null;
  /** Absolute average HR for the session, or null. Enables absolute caps. */
  avgHr?: number | null;
  /** Minutes of the session, for the quality meter */
  minutes: number;
}

/**
 * Optional absolute HR caps (NS personal calibration). When provided, these
 * override the reserve-based thresholds - a hand-calibrated 128/141 cap is
 * more faithful than back-computing from a max-HR fraction.
 */
export interface NsHrCaps {
  easyHrCap?: number | null;
  subThresholdHrCap?: number | null;
}

/**
 * Decide whether an easy session ran "hot". Prefers the absolute easy HR cap
 * when both the cap and the session's avg HR are present; otherwise falls
 * back to the reserve ceiling.
 */
function easyRanHot(s: SessionSample, caps: NsHrCaps): boolean | null {
  if (caps.easyHrCap != null && s.avgHr != null) return s.avgHr >= caps.easyHrCap;
  if (s.reserve != null) return s.reserve >= EASY_CEILING_RESERVE;
  return null;
}

function repRanHot(s: SessionSample, caps: NsHrCaps): boolean | null {
  if (caps.subThresholdHrCap != null && s.avgHr != null) return s.avgHr >= caps.subThresholdHrCap;
  if (s.reserve != null) return s.reserve >= SUBT_HOT_RESERVE;
  return null;
}

export function evaluateEasyDiscipline(samples: SessionSample[], caps: NsHrCaps = {}): GuardFlag {
  const easy = samples.filter((s) => (s.kind === 'easy' || s.kind === 'long' || s.kind === 'recovery') && easyRanHot(s, caps) !== null);
  if (easy.length === 0) {
    return { severity: 'ok', title: 'Easy-day discipline', body: 'No easy sessions with heart-rate data in the window yet.' };
  }
  const tooHard = easy.filter((s) => easyRanHot(s, caps) === true);
  const pct = Math.round((tooHard.length / easy.length) * 100);
  if (tooHard.length === 0) {
    const capNote = caps.easyHrCap != null ? ` (under your ${caps.easyHrCap} bpm easy cap)` : '';
    return { severity: 'ok', title: 'Easy days are easy', body: `All ${easy.length} easy/long sessions stayed easy${capNote}. This is what protects your quality days.` };
  }
  const sev: GuardSeverity = pct >= 40 ? 'miss' : 'warn';
  const capNote = caps.easyHrCap != null ? ` above your ${caps.easyHrCap} bpm easy cap` : ' above the easy HR ceiling';
  return {
    severity: sev,
    title: `${tooHard.length} of ${easy.length} easy days ran hot`,
    body: `${pct}% of your easy/long sessions crept${capNote}. Easy days creeping into moderate is the slow leak that erodes Norwegian Singles - the easy days are meant to be genuinely conversational so the quality days can be sharp.`,
  };
}

/* ---- 2. Rep-too-hot ------------------------------------------------------ */

export function evaluateRepIntensity(samples: SessionSample[], caps: NsHrCaps = {}): GuardFlag {
  const quality = samples.filter((s) => s.kind === 'quality' && repRanHot(s, caps) !== null);
  if (quality.length === 0) {
    return { severity: 'ok', title: 'Sub-threshold control', body: 'No quality sessions with heart-rate data in the window yet.' };
  }
  const tooHot = quality.filter((s) => repRanHot(s, caps) === true);
  if (tooHot.length === 0) {
    const capNote = caps.subThresholdHrCap != null ? ` (under your ${caps.subThresholdHrCap} bpm sub-threshold cap)` : '';
    return { severity: 'ok', title: 'Reps are controlled', body: `All ${quality.length} quality sessions stayed in the sub-threshold band${capNote}. You could have done several more reps - exactly right.` };
  }
  const pct = Math.round((tooHot.length / quality.length) * 100);
  const sev: GuardSeverity = pct >= 50 ? 'miss' : 'warn';
  const capNote = caps.subThresholdHrCap != null ? ` your ${caps.subThresholdHrCap} bpm sub-threshold cap` : ' threshold/VO2 effort';
  return {
    severity: sev,
    title: `${tooHot.length} of ${quality.length} sessions ran too hot`,
    body: `${pct}% of your sub-threshold sessions exceeded${capNote}. Sub-threshold is LT1-adjacent, deliberately below that - the point is controlled, repeatable volume of quality, not hard intervals. If you're hitting the wall on the last rep, you went too fast.`,
  };
}

/* ---- 3. Quality-cap meter ------------------------------------------------ */

export interface QualityCap {
  qualityMinutes: number;
  totalMinutes: number;
  fraction: number;       // 0..1
  targetFraction: number; // 0.22
  severity: GuardSeverity;
  body: string;
}

export function computeQualityCap(samples: SessionSample[]): QualityCap {
  const totalMinutes = samples.reduce((s, x) => s + x.minutes, 0);
  const qualityMinutes = samples.filter((s) => s.kind === 'quality').reduce((s, x) => s + x.minutes, 0);
  const fraction = totalMinutes > 0 ? qualityMinutes / totalMinutes : 0;

  let severity: GuardSeverity = 'ok';
  let body = `Quality is ${Math.round(fraction * 100)}% of volume, inside the 20-25% target band.`;
  if (totalMinutes === 0) {
    severity = 'ok';
    body = 'No sessions in the window yet.';
  } else if (fraction > QUALITY_BAND.high + 0.03) {
    severity = 'miss';
    body = `Quality is ${Math.round(fraction * 100)}% of volume, well over the 25% ceiling. Too much fast running crowds out the easy aerobic base - trim a quality session or add easy volume.`;
  } else if (fraction > QUALITY_BAND.high) {
    severity = 'warn';
    body = `Quality is ${Math.round(fraction * 100)}% of volume, just over the 25% ceiling. Keep an eye on it.`;
  } else if (fraction > 0 && fraction < QUALITY_BAND.low - 0.05) {
    severity = 'warn';
    body = `Quality is only ${Math.round(fraction * 100)}% of volume, under the 20% floor. The stimulus may be too low - you have room for another sub-threshold session.`;
  }

  return { qualityMinutes: Math.round(qualityMinutes), totalMinutes: Math.round(totalMinutes), fraction, targetFraction: QUALITY_TARGET_FRACTION, severity, body };
}

/* ---- 4. Max-HR validity guard ------------------------------------------- */

export interface MaxHrGuardInput {
  /** Configured max HR from profile, or null if unset */
  configuredMaxHr: number | null;
  /** Whether the configured value is measured (true) or absent (false) */
  hasMeasuredMax: boolean;
  /** Athlete age, for the age-predicted fallback note */
  age: number | null;
  /** Highest activity max HR observed in the window, or null */
  observedMaxHr: number | null;
}

export function evaluateMaxHrValidity(input: MaxHrGuardInput): GuardFlag {
  const { configuredMaxHr, hasMeasuredMax, age, observedMaxHr } = input;

  // (b) observed exceeds configured - configured is provably too low
  if (configuredMaxHr !== null && observedMaxHr !== null && observedMaxHr > configuredMaxHr + 2) {
    return {
      severity: 'miss',
      title: 'Measured HR exceeds your configured max',
      body: `An activity hit ${Math.round(observedMaxHr)} bpm, above your configured max of ${configuredMaxHr}. Your HR zones are built on that ceiling, so every zone is skewed. Raise your max HR to at least ${Math.round(observedMaxHr)} - ideally from a proper max test.`,
    };
  }

  // (a) no measured max - zones are on the 220-age estimate
  if (!hasMeasuredMax) {
    const est = age ? 220 - age : null;
    return {
      severity: 'warn',
      title: 'Zones are using an estimated max HR',
      body: est
        ? `Without a measured max HR, zones fall back to 220-age = ${est} bpm. That estimate has a standard error around 10-12 bpm, so your easy/sub-threshold boundaries could be off by a zone. A short max-HR test would calibrate everything - including the easy-day and rep-too-hot guards above.`
        : `No measured max HR set, and no age to estimate one. HR-based guards can't run reliably until you set a max HR in your profile.`,
    };
  }

  return {
    severity: 'ok',
    title: 'Max HR calibrated',
    body: `Zones are built on your measured max of ${configuredMaxHr} bpm. The HR-based guards above are reliable.`,
  };
}

/* ---- Aggregate ----------------------------------------------------------- */

export interface NsGuardReport {
  easyDiscipline: GuardFlag;
  repIntensity: GuardFlag;
  qualityCap: QualityCap;
  maxHrGuard: GuardFlag;
  /** Worst severity across all guards, for a headline badge */
  worst: GuardSeverity;
  /**
   * Weighted 0-100 discipline score.
   * Easy-day discipline 40%, rep intensity 30%, quality cap 20%, max-HR 10%.
   * 100 = fully on method. Each guard: ok=100, warn=50, miss=0.
   */
  disciplineScore: number;
}

const SEV_RANK: Record<GuardSeverity, number> = { ok: 0, warn: 1, miss: 2 };

function sevScore(s: GuardSeverity): number {
  return s === 'ok' ? 100 : s === 'warn' ? 50 : 0;
}

export function computeNsDisciplineScore(
  easyDiscipline: GuardFlag,
  repIntensity: GuardFlag,
  qualityCap: QualityCap,
  maxHrGuard: GuardFlag,
): number {
  return Math.round(
    sevScore(easyDiscipline.severity) * 0.40 +
    sevScore(repIntensity.severity) * 0.30 +
    sevScore(qualityCap.severity) * 0.20 +
    sevScore(maxHrGuard.severity) * 0.10,
  );
}

export function buildNsGuardReport(samples: SessionSample[], maxHr: MaxHrGuardInput, caps: NsHrCaps = {}): NsGuardReport {
  const easyDiscipline = evaluateEasyDiscipline(samples, caps);
  const repIntensity = evaluateRepIntensity(samples, caps);
  const qualityCap = computeQualityCap(samples);
  const maxHrGuard = evaluateMaxHrValidity(maxHr);
  const severities = [easyDiscipline.severity, repIntensity.severity, qualityCap.severity, maxHrGuard.severity];
  const worst = severities.reduce((w, s) => (SEV_RANK[s] > SEV_RANK[w] ? s : w), 'ok' as GuardSeverity);
  const disciplineScore = computeNsDisciplineScore(easyDiscipline, repIntensity, qualityCap, maxHrGuard);
  return { easyDiscipline, repIntensity, qualityCap, maxHrGuard, worst, disciplineScore };
}
