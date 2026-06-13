import type { Metadata } from 'next';
import Script from 'next/script';
import { Bebas_Neue, IBM_Plex_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { ThemeProvider, NO_FLASH_SCRIPT } from '@/components/theme/theme-provider';
import { BundleVersionChip } from '@/components/brand/bundle-version-chip';
import packageJson from '../package.json';

const bebas = Bebas_Neue({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-bebas',
  display: 'swap',
});

const plex = IBM_Plex_Sans({
  weight: ['400', '500', '600'],
  subsets: ['latin'],
  variable: '--font-plex',
  display: 'swap',
});

const jetbrains = JetBrains_Mono({
  weight: ['400', '500'],
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Night Ninjas — Shadow Tracker',
  description:
    'Local-first running training analysis. Quiet, disciplined work in the dark.',
  // No icons / Open Graph / etc — this app never goes online.
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${bebas.variable} ${plex.variable} ${jetbrains.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* No-flash theme script — runs synchronously before hydration to
            set the data-theme attribute from localStorage. Prevents the
            dark→light flash that happens if we waited for React.

            Uses next/script with strategy="beforeInteractive" because
            Next 16 / React 19 no longer accepts bare <script> tags
            inside the React render tree (they're silently dropped
            client-side). beforeInteractive injects synchronously into
            the document <head> during HTML streaming. */}
        <Script
          id="no-flash-theme"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }}
        />
      </head>
      <body className="bg-ink text-bone min-h-screen">
        <ThemeProvider>{children}</ThemeProvider>
        <BundleVersionChip appVersion={packageJson.version} />
      </body>
    </html>
  );
}
