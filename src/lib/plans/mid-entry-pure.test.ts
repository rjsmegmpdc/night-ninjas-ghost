import { describe, it, expect } from 'vitest';
import { assessMidProgramEntry, type MidEntryInput } from './mid-entry-pure';

function base(overrides: Partial<MidEntryInput> = {}): MidEntryInput {
  return {
    weekNumber: 5,
    programWeeks: 20,
    chronicKm: 60,
    entryLoadKm: 45,
    weekKmTarget: 65,
    periodCreatedIso: '2026-06-25', // 3 days before today
    todayIso: '2026-06-28',
    ...overrides,
  };
}

describe('assessMidProgramEntry', () => {
  describe('isNewMidEntry detection', () => {
    it('true when weekNumber > 2 and period created ≤7 days ago', () => {
      const r = assessMidProgramEntry(base({ weekNumber: 5, periodCreatedIso: '2026-06-25', todayIso: '2026-06-28' }));
      expect(r.isNewMidEntry).toBe(true);
    });

    it('false when weekNumber ≤ 2 (still in transition)', () => {
      const r = assessMidProgramEntry(base({ weekNumber: 2, periodCreatedIso: '2026-06-25', todayIso: '2026-06-28' }));
      expect(r.isNewMidEntry).toBe(false);
    });

    it('false when period was created more than 7 days ago', () => {
      const r = assessMidProgramEntry(base({ weekNumber: 5, periodCreatedIso: '2026-06-01', todayIso: '2026-06-28' }));
      expect(r.isNewMidEntry).toBe(false);
    });

    it('true on exactly day 7 (boundary — still within window)', () => {
      const r = assessMidProgramEntry(base({ weekNumber: 3, periodCreatedIso: '2026-06-21', todayIso: '2026-06-28' }));
      expect(r.isNewMidEntry).toBe(true);
    });

    it('false on day 8 (just outside window)', () => {
      const r = assessMidProgramEntry(base({ weekNumber: 3, periodCreatedIso: '2026-06-20', todayIso: '2026-06-28' }));
      expect(r.isNewMidEntry).toBe(false);
    });

    it('weekNumber exactly 3 (first week past transition) is detected', () => {
      const r = assessMidProgramEntry(base({ weekNumber: 3 }));
      expect(r.isNewMidEntry).toBe(true);
    });
  });

  describe('verdict thresholds', () => {
    it('ok when chronicKm >= 90% of weekKmTarget', () => {
      const r = assessMidProgramEntry(base({ chronicKm: 63, weekKmTarget: 70 })); // 90% exactly
      expect(r.verdict).toBe('ok');
    });

    it('ok when chronicKm exceeds weekKmTarget', () => {
      const r = assessMidProgramEntry(base({ chronicKm: 80, weekKmTarget: 70 }));
      expect(r.verdict).toBe('ok');
    });

    it('caution when chronicKm is 70-89% of weekKmTarget', () => {
      const r = assessMidProgramEntry(base({ chronicKm: 52, weekKmTarget: 70 })); // ~74%
      expect(r.verdict).toBe('caution');
    });

    it('caution at exactly 70%', () => {
      const r = assessMidProgramEntry(base({ chronicKm: 49, weekKmTarget: 70 })); // 70%
      expect(r.verdict).toBe('caution');
    });

    it('warning when chronicKm < 70% of weekKmTarget', () => {
      const r = assessMidProgramEntry(base({ chronicKm: 40, weekKmTarget: 70 })); // ~57%
      expect(r.verdict).toBe('warning');
    });

    it('warning when chronicKm is 0 (cold start)', () => {
      const r = assessMidProgramEntry(base({ chronicKm: 0, weekKmTarget: 70 }));
      expect(r.verdict).toBe('warning');
    });
  });

  describe('weeksSkipped', () => {
    it('is weekNumber - 1', () => {
      expect(assessMidProgramEntry(base({ weekNumber: 5 })).weeksSkipped).toBe(4);
      expect(assessMidProgramEntry(base({ weekNumber: 3 })).weeksSkipped).toBe(2);
      expect(assessMidProgramEntry(base({ weekNumber: 10 })).weeksSkipped).toBe(9);
    });
  });

  describe('fitnessDelta', () => {
    it('is chronicKm - weekKmTarget (negative = under)', () => {
      const r = assessMidProgramEntry(base({ chronicKm: 55, weekKmTarget: 70 }));
      expect(r.fitnessDelta).toBeCloseTo(-15, 1);
    });

    it('is positive when chronic exceeds target', () => {
      const r = assessMidProgramEntry(base({ chronicKm: 80, weekKmTarget: 70 }));
      expect(r.fitnessDelta).toBeCloseTo(10, 1);
    });
  });

  describe('output shape', () => {
    it('ok verdict has no suggestedAction', () => {
      const r = assessMidProgramEntry(base({ chronicKm: 70, weekKmTarget: 70 }));
      expect(r.verdict).toBe('ok');
      expect(r.suggestedAction).toBeNull();
    });

    it('caution and warning verdicts provide suggestedAction', () => {
      const caution = assessMidProgramEntry(base({ chronicKm: 52, weekKmTarget: 70 }));
      expect(caution.suggestedAction).toBeTruthy();

      const warning = assessMidProgramEntry(base({ chronicKm: 40, weekKmTarget: 70 }));
      expect(warning.suggestedAction).toBeTruthy();
    });

    it('headline references the week number', () => {
      const r = assessMidProgramEntry(base({ weekNumber: 8, chronicKm: 30, weekKmTarget: 70 }));
      expect(r.headline).toContain('8');
    });

    it('body references both chronic and target km', () => {
      const r = assessMidProgramEntry(base({ chronicKm: 45, weekKmTarget: 70 }));
      expect(r.body).toContain('45');
      expect(r.body).toContain('70');
    });
  });

  describe('edge cases', () => {
    it('handles zero weekKmTarget without crashing', () => {
      const r = assessMidProgramEntry(base({ weekKmTarget: 0, chronicKm: 50 }));
      expect(r.verdict).toBe('ok'); // ratio = 1 when target = 0
    });

    it('returns correct fields even when isNewMidEntry = false', () => {
      const r = assessMidProgramEntry(base({ weekNumber: 1 }));
      expect(r.isNewMidEntry).toBe(false);
      expect(r.verdict).toBeDefined();
      expect(r.headline).toBeDefined();
    });
  });
});
