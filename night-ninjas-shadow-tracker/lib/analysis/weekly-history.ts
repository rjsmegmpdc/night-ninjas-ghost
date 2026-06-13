import 'server-only';
import {
  getIntensityDistribution,
  type IntensityDistribution,
} from './intensity-distribution';
import type { AthleteCalibration } from './load';
import {
  checkMileageProgression,
  type MileageProgression,
} from './progression';

/**
 * Weekly intensity history - returns N weeks of intensity distribution
 * data for sparkline rendering on Strike. Each entry includes the week
 * start ISO and the easy/grey/hard split.
 *
 * Weeks with no running activity contribute null (gap in the sparkline).
 */
export async function getWeeklyIntensityHistory(
  weeks: number,
  calibration: AthleteCalibration = {}
): Promise<Array<{ weekStartIso: string; distribution: IntensityDistribution | null }>> {
  // Build week-start dates going backward from the current Monday
  const today = new Date();
  // Monday of this week
  const dow = (today.getDay() + 6) % 7;
  const thisMonday = new Date(today);
  thisMonday.setDate(thisMonday.getDate() - dow);
  thisMonday.setHours(0, 0, 0, 0);

  const results: Array<{ weekStartIso: string; distribution: IntensityDistribution | null }> = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const weekStart = new Date(thisMonday);
    weekStart.setDate(weekStart.getDate() - 7 * w);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const startIso = weekStart.toISOString().slice(0, 10);
    const endIso = weekEnd.toISOString().slice(0, 10);
    const dist = await getIntensityDistribution(startIso, endIso, calibration);
    results.push({ weekStartIso: startIso, distribution: dist });
  }
  return results;
}

/**
 * Weekly mileage history - returns N weeks of running km totals plus the
 * progression check applied at each week. Used to render mileage
 * trajectory + flag streak on Strike.
 */
export async function getWeeklyMileageHistory(
  weeks: number
): Promise<Array<{ weekStartIso: string; progression: MileageProgression | null }>> {
  const today = new Date();
  const dow = (today.getDay() + 6) % 7;
  const thisMonday = new Date(today);
  thisMonday.setDate(thisMonday.getDate() - dow);
  thisMonday.setHours(0, 0, 0, 0);

  const results: Array<{ weekStartIso: string; progression: MileageProgression | null }> = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const weekStart = new Date(thisMonday);
    weekStart.setDate(weekStart.getDate() - 7 * w);
    const startIso = weekStart.toISOString().slice(0, 10);
    const prog = await checkMileageProgression(startIso);
    results.push({ weekStartIso: startIso, progression: prog });
  }
  return results;
}
