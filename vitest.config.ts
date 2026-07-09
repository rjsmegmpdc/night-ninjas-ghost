import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  css: {
    postcss: { plugins: [] },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: [],
    environment: 'node',
    environmentMatchGlobs: [['**/*.test.tsx', 'jsdom']],
    env: { TZ: 'Pacific/Auckland' },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/**/*.test.*', 'src/main.tsx'],
    },
  },
});
