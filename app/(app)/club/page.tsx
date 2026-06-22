import { logPageView } from '@/lib/store/instrument';
import {
  getAthleteId,
  getSchedulePasswordHash,
  getClubParkrunId,
  getClubWindowDefault,
  getClubTermsAcceptedAt,
  getClubLastShareGeneratedAt,
} from '@/lib/store/settings';
import { getGitHubPat } from '@/lib/store/secrets';
import { ClubPage } from '@/components/club-share/club-page';

/**
 * /club — Night Ninjas club schedule sharing hub.
 *
 * Sections:
 *   1. Identity         — athlete ID (numeric parkrun ID)
 *   2. Schedule Password — plain-text entry hashed SHA-256 on save
 *   3. GitHub Connection — PAT for publishing to nightninja-report
 *   4. Generate & Publish — window selector, terms, generate, result
 */
export default async function ClubPageRoute() {
  logPageView('/club');

  const [
    athleteId,
    passwordHash,
    gitHubPat,
    parkrunId,
    windowDefault,
    termsAcceptedAt,
    lastGeneratedAt,
  ] = await Promise.all([
    getAthleteId(),
    getSchedulePasswordHash(),
    getGitHubPat(),
    getClubParkrunId(),
    getClubWindowDefault(),
    getClubTermsAcceptedAt(),
    getClubLastShareGeneratedAt(),
  ]);

  return (
    <div className="px-4 sm:px-8 lg:px-12 py-8 sm:py-10 max-w-5xl mx-auto space-y-8">
      <header className="border-b border-ink-line pb-6 space-y-1">
        <span className="nn-caps">night ninjas - club</span>
        <h1 className="font-display tracking-wide-display text-5xl uppercase">
          Club Share
        </h1>
        <div className="font-mono text-bone-dim text-sm max-w-2xl">
          Publish your training schedule directly to the Night Ninjas club site.
          Configure your identity, password protection, and GitHub connection.
        </div>
      </header>

      <ClubPage
        athleteId={athleteId}
        passwordIsSet={passwordHash !== null}
        gitHubPatIsSet={gitHubPat !== null}
        initialParkrunId={parkrunId}
        initialWindow={windowDefault}
        termsAcceptedAt={termsAcceptedAt}
        lastGeneratedAt={lastGeneratedAt}
      />
    </div>
  );
}
