import reactHooks from 'eslint-plugin-react-hooks';
import tsParser from '@typescript-eslint/parser';

/**
 * Deliberately narrow lint gate: React rules-of-hooks only.
 *
 * Added after the /setup blank-page incident (React #310 — a useEffect
 * mounted below an early return in TrainingWizard, shipped 2026-07-12,
 * crashed every connected user). That bug class is 100% machine-catchable;
 * this config exists to block it in CI (deploy.yml runs `npm run lint`
 * before tests).
 *
 * Scope is intentionally minimal so the gate is green on the existing
 * codebase and stays cheap. Widen rule coverage deliberately, not by
 * default — every rule added here becomes a deploy blocker.
 */
export default [
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true }, sourceType: 'module' },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];
