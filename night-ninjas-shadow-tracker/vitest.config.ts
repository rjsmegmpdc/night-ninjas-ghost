import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Vitest config — minimal, scoped to pure-function tests.
 *
 * No DOM environment (we're not testing components).
 * Path alias `@/` mirrors the Next.js `tsconfig.json` setup so
 * imports like `import { x } from '@/lib/analysis/load'` resolve
 * the same in tests as in production.
 *
 * Tests live next to source as `*.test.ts` files in `lib/analysis/`.
 * No test runner spread across the rest of the codebase yet — analytical
 * code is the right place to start because the math is testable. UI
 * tests come later if/when they become useful.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  css: {
    // Tests don't import CSS; explicitly disabling postcss prevents
    // the test runner from trying to load the project's tailwind config.
    postcss: { plugins: [] },
  },
  test: {
    include: ['lib/**/*.test.ts'],
    environment: 'node',
  },
});
