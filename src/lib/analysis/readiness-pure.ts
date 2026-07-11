/**
 * Athlete readiness score (0–100) computed from HRV, sleep, body battery, and stress.
 *
 * Pure function — no DB, no browser APIs. Safe to test with Vitest node env.
 */

export interface ReadinessInputs {
  hrvMs: number | null;
  rhrBpm: number | null;
  sleepScore: number | null;      // 0–100
  sleepDurationS: number | null;  // seconds
  stressScore: number | null;     // 0–100 (lower = better)
  bodyBattery: number | null;     // 0–100
}

export interface ReadinessFactor {
  name: string;
  contribution: number;  // -1 to +1 (negative = pulling score down)
  note: string;          // e.g. "HRV 12% below baseline"
}

export interface ReadinessScore {
  score: number;          // 0–100, integer
  label: string;          // 'Optimal' | 'Good' | 'Moderate' | 'Low' | 'Rest'
  color: string;          // Tailwind token
  factors: ReadinessFactor[];
  recommendation: string; // one short sentence
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// ---------------------------------------------------------------------------
// Per-component sub-scores (each 0–100)
// ---------------------------------------------------------------------------

function hrvSubScore(hrvMs: number | null, baselineHrvMs: number | null | undefined): number {
  if (hrvMs === null) return 60;
  if (baselineHrvMs != null && baselineHrvMs > 0) {
    const raw = 50 + ((hrvMs - baselineHrvMs) / baselineHrvMs) * 100;
    return clamp(raw, 0, 100);
  }
  // Absolute scale without baseline
  if (hrvMs < 20)  return 20;
  if (hrvMs < 40)  return 50;
  if (hrvMs < 60)  return 70;
  if (hrvMs < 80)  return 85;
  return 100;
}

function sleepSubScore(sleepScore: number | null): number {
  if (sleepScore === null) return 60;
  return clamp(sleepScore, 0, 100);
}

function bodyBatterySubScore(bodyBattery: number | null): number {
  if (bodyBattery === null) return 60;
  return clamp(bodyBattery, 0, 100);
}

function stressSubScore(stressScore: number | null): number {
  if (stressScore === null) return 60;
  return clamp(100 - stressScore, 0, 100);
}

function rhrSubScore(rhrBpm: number | null, baselineRhr: number | null | undefined): number {
  if (rhrBpm === null) return 60;
  if (baselineRhr != null && baselineRhr > 0) {
    // Below baseline = good (lower RHR = better recovered)
    const diff = baselineRhr - rhrBpm;
    const raw = 60 + diff * 4; // 1 bpm below baseline ~ +4 points
    return clamp(raw, 0, 100);
  }
  // Absolute scale without baseline
  if (rhrBpm < 50)  return 90;
  if (rhrBpm < 60)  return 80;
  if (rhrBpm < 70)  return 60;
  if (rhrBpm < 80)  return 40;
  return 20;
}

// ---------------------------------------------------------------------------
// Factor derivation helpers
// ---------------------------------------------------------------------------

function toContribution(subScore: number): number {
  // normalise sub-score to -1..+1 relative to the neutral 60
  return clamp((subScore - 60) / 40, -1, 1);
}

// ---------------------------------------------------------------------------
// Main export: computeReadiness
// ---------------------------------------------------------------------------

export function computeReadiness(
  inputs: ReadinessInputs,
  baselines?: Partial<ReadinessInputs>,
): ReadinessScore {
  const hrvS    = hrvSubScore(inputs.hrvMs,    baselines?.hrvMs);
  const sleepS  = sleepSubScore(inputs.sleepScore);
  const battS   = bodyBatterySubScore(inputs.bodyBattery);
  const stressS = stressSubScore(inputs.stressScore);
  const rhrS    = rhrSubScore(inputs.rhrBpm,   baselines?.rhrBpm);

  // Weighted average (weights sum to 1.0)
  const raw =
    hrvS    * 0.35 +
    sleepS  * 0.25 +
    battS   * 0.20 +
    stressS * 0.15 +
    rhrS    * 0.05;

  const score = Math.round(clamp(raw, 0, 100));

  // Label + color + recommendation
  let label: string;
  let color: string;
  let recommendation: string;
  if (score >= 80) {
    label = 'Optimal';
    color = 'text-signal-ok';
    recommendation = 'Ready for your key session';
  } else if (score >= 65) {
    label = 'Good';
    color = 'text-signal-ok';
    recommendation = 'Good to train, monitor effort';
  } else if (score >= 50) {
    label = 'Moderate';
    color = 'text-accent';
    recommendation = 'Moderate session only — listen to your body';
  } else if (score >= 35) {
    label = 'Low';
    color = 'text-signal-warn';
    recommendation = 'Easy run or rest — recovery needed';
  } else {
    label = 'Rest';
    color = 'text-signal-miss';
    recommendation = 'Rest day — your body needs to recover';
  }

  // Build factors (only non-null inputs, only non-zero contribution)
  const factors: ReadinessFactor[] = [];

  if (inputs.hrvMs !== null) {
    const contrib = toContribution(hrvS);
    if (contrib !== 0) {
      const bl = baselines?.hrvMs;
      const note = bl != null && bl > 0
        ? `HRV ${((inputs.hrvMs - bl) / bl * 100).toFixed(0)}% ${inputs.hrvMs >= bl ? 'above' : 'below'} baseline`
        : `HRV ${inputs.hrvMs.toFixed(1)}ms (absolute scale)`;
      factors.push({ name: 'HRV', contribution: contrib, note });
    }
  }

  if (inputs.sleepScore !== null) {
    const contrib = toContribution(sleepS);
    if (contrib !== 0) {
      factors.push({
        name: 'Sleep quality',
        contribution: contrib,
        note: `Sleep score ${inputs.sleepScore}/100`,
      });
    }
  }

  if (inputs.bodyBattery !== null) {
    const contrib = toContribution(battS);
    if (contrib !== 0) {
      factors.push({
        name: 'Body battery',
        contribution: contrib,
        note: `Body battery ${inputs.bodyBattery}/100`,
      });
    }
  }

  if (inputs.stressScore !== null) {
    const contrib = toContribution(stressS);
    if (contrib !== 0) {
      factors.push({
        name: 'Stress',
        contribution: contrib,
        note: `Stress score ${inputs.stressScore}/100 (inverted)`,
      });
    }
  }

  if (inputs.rhrBpm !== null) {
    const contrib = toContribution(rhrS);
    if (contrib !== 0) {
      const bl = baselines?.rhrBpm;
      const note = bl != null && bl > 0
        ? `RHR ${inputs.rhrBpm}bpm (${inputs.rhrBpm <= bl ? 'at or below' : 'above'} baseline ${bl}bpm)`
        : `RHR ${inputs.rhrBpm}bpm (absolute scale)`;
      factors.push({ name: 'Resting HR', contribution: contrib, note });
    }
  }

  return { score, label, color, factors, recommendation };
}

// ---------------------------------------------------------------------------
// Main export: computeBaselineFromHistory
// ---------------------------------------------------------------------------

/**
 * Given up to 28 days of biometric readings, return median HRV and RHR to use
 * as baselines for readiness scoring. Medians are more robust than means for
 * biometric data (outliers from illness or travel skew means badly).
 */
export function computeBaselineFromHistory(
  history: ReadinessInputs[],
): Partial<ReadinessInputs> {
  const hrvValues  = history.map((h) => h.hrvMs).filter((v): v is number => v !== null);
  const rhrValues  = history.map((h) => h.rhrBpm).filter((v): v is number => v !== null);

  const result: Partial<ReadinessInputs> = {};
  const mHrv = median(hrvValues);
  if (mHrv !== null) result.hrvMs = mHrv;
  const mRhr = median(rhrValues);
  if (mRhr !== null) result.rhrBpm = mRhr;
  return result;
}
