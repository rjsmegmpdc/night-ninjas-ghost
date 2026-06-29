export const EASY_CEILING_RESERVE = 0.70;
export const SUBT_HOT_RESERVE = 0.88;
export const QUALITY_TARGET_FRACTION = 0.22;
export const QUALITY_BAND = { low: 0.20, high: 0.25 };

export type GuardSeverity = 'ok' | 'warn' | 'miss';

export interface GuardFlag {
  severity: GuardSeverity;
  title: string;
  body: string;
}

export interface SessionSample {
  dateIso: string;
  kind: 'easy' | 'long' | 'recovery' | 'quality' | 'other';
  reserve: number | null;
  avgHr?: number | null;
  minutes: number;
}

export interface NsHrCaps {
  easyHrCap?: number | null;
  subThresholdHrCap?: number | null;
}

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
    body: `${pct}% of your easy/long sessions crept${capNote}. Easy days creeping into moderate is the slow leak that erodes Norwegian Singles.`,
  };
}

export function evaluateRepIntensity(samples: SessionSample[], caps: NsHrCaps = {}): GuardFlag {
  const quality = samples.filter((s) => s.kind === 'quality' && repRanHot(s, caps) !== null);
  if (quality.length === 0) {
    return { severity: 'ok', title: 'Sub-threshold control', body: 'No quality sessions with heart-rate data in the window yet.' };
  }
  const tooHot = quality.filter((s) => repRanHot(s, caps) === true);
  if (tooHot.length === 0) {
    const capNote = caps.subThresholdHrCap != null ? ` (under your ${caps.subThresholdHrCap} bpm sub-threshold cap)` : '';
    return { severity: 'ok', title: 'Reps are controlled', body: `All ${quality.length} quality sessions stayed in the sub-threshold band${capNote}.` };
  }
  const pct = Math.round((tooHot.length / quality.length) * 100);
  const sev: GuardSeverity = pct >= 50 ? 'miss' : 'warn';
  const capNote = caps.subThresholdHrCap != null ? ` your ${caps.subThresholdHrCap} bpm sub-threshold cap` : ' threshold/VO2 effort';
  return {
    severity: sev,
    title: `${tooHot.length} of ${quality.length} sessions ran too hot`,
    body: `${pct}% of your sub-threshold sessions exceeded${capNote}. Sub-threshold is LT1-adjacent, deliberately below that.`,
  };
}

export interface QualityCap {
  qualityMinutes: number;
  totalMinutes: number;
  fraction: number;
  targetFraction: number;
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
    body = 'No sessions in the window yet.';
  } else if (fraction > QUALITY_BAND.high + 0.03) {
    severity = 'miss';
    body = `Quality is ${Math.round(fraction * 100)}% of volume, well over the 25% ceiling.`;
  } else if (fraction > QUALITY_BAND.high) {
    severity = 'warn';
    body = `Quality is ${Math.round(fraction * 100)}% of volume, just over the 25% ceiling.`;
  } else if (fraction > 0 && fraction < QUALITY_BAND.low - 0.05) {
    severity = 'warn';
    body = `Quality is only ${Math.round(fraction * 100)}% of volume, under the 20% floor.`;
  }

  return { qualityMinutes: Math.round(qualityMinutes), totalMinutes: Math.round(totalMinutes), fraction, targetFraction: QUALITY_TARGET_FRACTION, severity, body };
}

export interface MaxHrGuardInput {
  configuredMaxHr: number | null;
  hasMeasuredMax: boolean;
  age: number | null;
  observedMaxHr: number | null;
}

export function evaluateMaxHrValidity(input: MaxHrGuardInput): GuardFlag {
  const { configuredMaxHr, hasMeasuredMax, age, observedMaxHr } = input;

  if (configuredMaxHr !== null && observedMaxHr !== null && observedMaxHr > configuredMaxHr + 2) {
    return {
      severity: 'miss',
      title: 'Measured HR exceeds your configured max',
      body: `An activity hit ${Math.round(observedMaxHr)} bpm, above your configured max of ${configuredMaxHr}. Raise your max HR to at least ${Math.round(observedMaxHr)}.`,
    };
  }

  if (!hasMeasuredMax) {
    const est = age ? 220 - age : null;
    return {
      severity: 'warn',
      title: 'Zones are using an estimated max HR',
      body: est
        ? `Without a measured max HR, zones fall back to 220-age = ${est} bpm. That estimate has a standard error around 10-12 bpm.`
        : `No measured max HR in your profile and no age to estimate one — zones can't run reliably without a calibrated max.`,
    };
  }

  return { severity: 'ok', title: 'Max HR calibrated', body: `Zones are built on your measured max of ${configuredMaxHr} bpm.` };
}

export interface NsGuardReport {
  easyDiscipline: GuardFlag;
  repIntensity: GuardFlag;
  qualityCap: QualityCap;
  maxHrGuard: GuardFlag;
  worst: GuardSeverity;
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
