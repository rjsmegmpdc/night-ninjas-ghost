import { getBundleVersion, formatBundleVersion } from '@/lib/bundle-version';

/**
 * Bundle version chip — small dim text rendered bottom-left of the
 * viewport, present on every page in the (app) and setup route groups.
 *
 * Purpose: at a glance, you can tell which bundle is running. If the UI
 * doesn't match expectations, the version chip identifies whether the
 * disk has the right code without needing to inspect files.
 *
 * Position: fixed bottom-left, doesn't move with scroll. Mono font,
 * bone-mute colour, ~10px size — small enough to ignore when reading
 * primary content.
 *
 * Format: "v0.1.0 - 2026-05-03 14:39Z - a3f2b91"
 *   - app version from package.json (informational)
 *   - bundle build timestamp UTC
 *   - first 7 chars of bundle content hash
 *
 * Click behaviour: none. Static text. (We can add a modal if it ever
 * earns its keep — currently it's pure identification.)
 */
export function BundleVersionChip({ appVersion }: { appVersion?: string }) {
  const version = getBundleVersion();
  const display = formatBundleVersion(version);
  const versionPrefix = appVersion ? `v${appVersion} - ` : '';

  return (
    <div
      className="fixed bottom-2 left-3 z-50 pointer-events-none select-none"
      aria-hidden="true"
    >
      <span className="font-mono text-[9px] leading-none text-bone-mute/60 tabular-nums tracking-wide">
        {versionPrefix}
        {display}
      </span>
    </div>
  );
}
