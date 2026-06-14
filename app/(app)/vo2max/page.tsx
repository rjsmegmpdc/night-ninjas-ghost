import { logPageView } from '@/lib/store/instrument';
import { getVo2View, getVo2Insights } from '@/lib/analysis/vo2max';
import { getAthleteProfile, getNsHrCalibration, seedNsDefaultsOnce } from '@/lib/store/settings';
import { Vo2TrendCard } from '@/components/vo2max/vo2-trend-card';
import { Vo2Capture } from '@/components/vo2max/vo2-capture';
import { Vo2ProfileForm } from '@/components/vo2max/vo2-profile-form';
import { Vo2InsightsCard } from '@/components/vo2max/vo2-insights-card';
import { NsCalibrationCard } from '@/components/vo2max/ns-calibration-card';

export default async function Vo2MaxPage() {
  logPageView('/vo2max');

  await seedNsDefaultsOnce();
  const [view, profile] = await Promise.all([getVo2View(), getAthleteProfile()]);
  const insights = await getVo2Insights(view);
  const nsCalibration = await getNsHrCalibration();

  return (
    <div className="px-12 py-10 max-w-5xl mx-auto space-y-8">
      <header className="border-b border-ink-line pb-6 space-y-1">
        <span className="nn-caps">analytics - vo2 max</span>
        <h1 className="font-display tracking-wide-display text-5xl uppercase">
          VO2 Max
        </h1>
        <div className="font-mono text-bone-dim text-sm max-w-2xl">
          Your aerobic ceiling, tracked across field tests, lab results and
          device estimates. Observed only - it informs, it doesn't change your
          paces.
        </div>
      </header>

      <Vo2TrendCard view={view} profile={profile} />

      <Vo2InsightsCard report={insights} />

      <Vo2Capture profile={profile} />

      <Vo2ProfileForm profile={profile} />

      <NsCalibrationCard calibration={nsCalibration} />
    </div>
  );
}
