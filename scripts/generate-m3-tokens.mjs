/**
 * Generates Material 3 color tokens for GHOST's six themes using Google's
 * official material-color-utilities (the Material You algorithms).
 *
 * Run:  npm run tokens
 * (npx vite-node --options.deps.inline="@material/material-color-utilities"
 *  scripts/generate-m3-tokens.mjs — writes src/m3-tokens.css directly)
 *
 * Dev-time only: the generated hex values are committed; the runtime bundle
 * never includes this dependency.
 */

import {
  argbFromHex,
  hexFromArgb,
  Hct,
  SchemeTonalSpot,
  SchemeVibrant,
  SchemeContent,
  MaterialDynamicColors,
} from '@material/material-color-utilities';

const GHOST_ORANGE = '#FF5F00';

// theme name → { scheme class, seed, dark, contrast, overrides }
const THEMES = [
  { name: 'ink',           Scheme: SchemeVibrant,   seed: GHOST_ORANGE, dark: true,  contrast: 0.0 },
  { name: 'dusk',          Scheme: SchemeContent,   seed: '#C46A33',    dark: true,  contrast: 0.0 },
  { name: 'oled',          Scheme: SchemeVibrant,   seed: GHOST_ORANGE, dark: true,  contrast: 0.3, oledSurfaces: true },
  { name: 'storm',         Scheme: SchemeTonalSpot, seed: '#5B7C99',    dark: true,  contrast: 0.0 },
  { name: 'dawn',          Scheme: SchemeVibrant,   seed: GHOST_ORANGE, dark: false, contrast: 0.0 },
  { name: 'high-contrast', Scheme: SchemeVibrant,   seed: GHOST_ORANGE, dark: true,  contrast: 1.0 },
];

// M3 color roles we emit (name → MaterialDynamicColors getter)
const ROLES = {
  'primary':                  MaterialDynamicColors.primary,
  'on-primary':               MaterialDynamicColors.onPrimary,
  'primary-container':        MaterialDynamicColors.primaryContainer,
  'on-primary-container':     MaterialDynamicColors.onPrimaryContainer,
  'secondary':                MaterialDynamicColors.secondary,
  'on-secondary':             MaterialDynamicColors.onSecondary,
  'secondary-container':      MaterialDynamicColors.secondaryContainer,
  'on-secondary-container':   MaterialDynamicColors.onSecondaryContainer,
  'tertiary':                 MaterialDynamicColors.tertiary,
  'tertiary-container':       MaterialDynamicColors.tertiaryContainer,
  'on-tertiary-container':    MaterialDynamicColors.onTertiaryContainer,
  'error':                    MaterialDynamicColors.error,
  'on-error':                 MaterialDynamicColors.onError,
  'error-container':          MaterialDynamicColors.errorContainer,
  'surface':                  MaterialDynamicColors.surface,
  'surface-dim':              MaterialDynamicColors.surfaceDim,
  'surface-bright':           MaterialDynamicColors.surfaceBright,
  'surface-container-lowest': MaterialDynamicColors.surfaceContainerLowest,
  'surface-container-low':    MaterialDynamicColors.surfaceContainerLow,
  'surface-container':        MaterialDynamicColors.surfaceContainer,
  'surface-container-high':   MaterialDynamicColors.surfaceContainerHigh,
  'surface-container-highest':MaterialDynamicColors.surfaceContainerHighest,
  'on-surface':               MaterialDynamicColors.onSurface,
  'on-surface-variant':       MaterialDynamicColors.onSurfaceVariant,
  'outline':                  MaterialDynamicColors.outline,
  'outline-variant':          MaterialDynamicColors.outlineVariant,
  'inverse-surface':          MaterialDynamicColors.inverseSurface,
  'inverse-on-surface':       MaterialDynamicColors.inverseOnSurface,
  'inverse-primary':          MaterialDynamicColors.inversePrimary,
  'scrim':                    MaterialDynamicColors.scrim,
};

function schemeCss(theme) {
  const hct = Hct.fromInt(argbFromHex(theme.seed));
  const scheme = new theme.Scheme(hct, theme.dark, theme.contrast);
  const lines = [];
  for (const [name, role] of Object.entries(ROLES)) {
    let hex = hexFromArgb(role.getArgb(scheme));
    lines.push(`  --m3-${name}: ${hex};`);
  }
  // GHOST brand orange — logotype + display numbers only. Darkened on light
  // surfaces to hold contrast.
  lines.push(`  --m3-brand: ${theme.dark ? GHOST_ORANGE : '#CC4400'};`);
  if (theme.oledSurfaces) {
    // Pure-black AMOLED: crush the low surfaces to true black
    const overrides = {
      'surface': '#000000',
      'surface-dim': '#000000',
      'surface-container-lowest': '#000000',
      'surface-container-low': '#0a0a0a',
      'surface-container': '#121212',
      'surface-container-high': '#1c1c1c',
      'surface-container-highest': '#262626',
    };
    for (let i = 0; i < lines.length; i++) {
      for (const [k, v] of Object.entries(overrides)) {
        if (lines[i].startsWith(`  --m3-${k}:`)) lines[i] = `  --m3-${k}: ${v};`;
      }
    }
  }
  return lines.join('\n');
}

let out = '';
for (const theme of THEMES) {
  const selector = theme.name === 'ink' ? ':root' : `[data-theme="${theme.name}"]`;
  out += `${selector} {\n${schemeCss(theme)}\n}\n\n`;
}

// Write directly as UTF-8 — PowerShell's `>` redirection produces UTF-16,
// which the CSS parser rejects.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const outPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'm3-tokens.css');
writeFileSync(outPath, out, 'utf8');
console.log(`Wrote ${outPath}`);
