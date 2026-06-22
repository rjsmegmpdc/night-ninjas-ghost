/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 and keytar are native modules — must be externalised so
  // Next.js doesn't try to bundle them client-side or in edge runtimes.
  serverExternalPackages: ['better-sqlite3', 'keytar', 'garmin-connect'],

  // No telemetry, ever — local-first means local-first.
  // Disable Next's telemetry by setting NEXT_TELEMETRY_DISABLED=1 in .env

  experimental: {
    // App Router is stable in 15, no flags needed here yet
  },
};

export default nextConfig;
