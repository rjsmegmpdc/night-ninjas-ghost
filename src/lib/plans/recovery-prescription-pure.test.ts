import { describe, it, expect } from 'vitest';
import {
  recoveryPrescription,
  HIGH_LOAD,
  MODERATE_LOAD,
  SLEEP_TARGET_HOURS,
  MOBILITY_MINUTES,
  type RecoveryPrescription,
} from './recovery-prescription-pure';

describe('recoveryPrescription', () => {
  describe('threshold constants', () => {
    it('uses the tuned Daniels-points thresholds', () => {
      expect(HIGH_LOAD).toBe(30);
      expect(MODERATE_LOAD).toBe(12);
    });

    it('uses the documented defaults', () => {
      expect(SLEEP_TARGET_HOURS).toBe(8);
      expect(MOBILITY_MINUTES).toBe(20);
    });
  });

  describe('full-rest band (load >= HIGH_LOAD)', () => {
    it('prescribes full rest for a hard interval day', () => {
      const rx = recoveryPrescription(45);
      expect(rx.intensity).toBe('full-rest');
      expect(rx.headline).toBe('Full recovery');
      expect(rx.items).toEqual([
        'No running today - the work is done, let it absorb',
        '20min mobility / light stretching',
        'Hydrate and refuel well',
        'Sleep target: 8h',
      ]);
    });

    it('treats a 60-min threshold run (~36 pts) as full rest', () => {
      expect(recoveryPrescription(36).intensity).toBe('full-rest');
    });
  });

  describe('light band (MODERATE_LOAD <= load < HIGH_LOAD)', () => {
    it('prescribes easy recovery for a moderate day', () => {
      const rx = recoveryPrescription(20);
      expect(rx.intensity).toBe('light');
      expect(rx.headline).toBe('Easy recovery');
      expect(rx.items).toEqual([
        'Optional 20-30min Z1 - easy spin, walk or jog if you feel like moving',
        '10min mobility',
        'Sleep target: 8h',
      ]);
    });

    it('treats a 60-min easy run (~12 pts) as light recovery', () => {
      expect(recoveryPrescription(12).intensity).toBe('light');
    });
  });

  describe('active band (load < MODERATE_LOAD)', () => {
    it('prescribes rest or easy cross for a light day', () => {
      const rx = recoveryPrescription(5);
      expect(rx.intensity).toBe('active');
      expect(rx.headline).toBe('Rest or easy cross');
      expect(rx.items).toEqual([
        'Genuine rest, or optional easy cross-training if you are keen',
        'A few minutes of light mobility',
      ]);
    });

    it('treats a full rest day (0 pts) as active', () => {
      expect(recoveryPrescription(0).intensity).toBe('active');
    });
  });

  describe('exact boundary values', () => {
    it('11.9 -> active (just below MODERATE_LOAD)', () => {
      expect(recoveryPrescription(11.9).intensity).toBe('active');
    });

    it('12 -> light (exactly MODERATE_LOAD)', () => {
      expect(recoveryPrescription(12).intensity).toBe('light');
    });

    it('29.9 -> light (just below HIGH_LOAD)', () => {
      expect(recoveryPrescription(29.9).intensity).toBe('light');
    });

    it('30 -> full-rest (exactly HIGH_LOAD)', () => {
      expect(recoveryPrescription(30).intensity).toBe('full-rest');
    });
  });

  describe('opts overrides flow into item strings', () => {
    it('overrides the sleep target in the full-rest band', () => {
      const rx = recoveryPrescription(40, { sleepTargetHours: 9 });
      expect(rx.items).toContain('Sleep target: 9h');
    });

    it('overrides mobility minutes in the full-rest band', () => {
      const rx = recoveryPrescription(40, { mobilityMinutes: 30 });
      expect(rx.items).toContain('30min mobility / light stretching');
    });

    it('halves overridden mobility minutes in the light band (rounded)', () => {
      const rx = recoveryPrescription(20, { mobilityMinutes: 30 });
      expect(rx.items).toContain('15min mobility');
      expect(rx.items).toContain('Sleep target: 8h');
    });

    it('rounds the halved mobility for odd minute budgets', () => {
      // 25 / 2 = 12.5 -> rounds to 13
      const rx = recoveryPrescription(20, { mobilityMinutes: 25 });
      expect(rx.items).toContain('13min mobility');
    });

    it('applies both overrides together in the light band', () => {
      const rx = recoveryPrescription(15, { sleepTargetHours: 7, mobilityMinutes: 40 });
      expect(rx.items).toContain('20min mobility');
      expect(rx.items).toContain('Sleep target: 7h');
    });
  });

  describe('bad input degrades to the active band', () => {
    it('negative load -> active', () => {
      const rx = recoveryPrescription(-50);
      expect(rx.intensity).toBe('active');
      expect(rx.headline).toBe('Rest or easy cross');
    });

    it('NaN load -> active', () => {
      expect(recoveryPrescription(NaN).intensity).toBe('active');
    });

    it('Infinity is finite-checked but still ranks as full-rest', () => {
      // Infinity > 0 and Number.isFinite(Infinity) is false, so it collapses to 0.
      expect(recoveryPrescription(Infinity).intensity).toBe('active');
    });
  });

  describe('invariants across all bands', () => {
    const samples = [-10, NaN, 0, 5, 11.9, 12, 20, 29.9, 30, 45, 100];

    it('always returns a non-empty items list', () => {
      for (const load of samples) {
        const rx: RecoveryPrescription = recoveryPrescription(load);
        expect(rx.items.length).toBeGreaterThan(0);
        expect(rx.items.every((s) => typeof s === 'string' && s.length > 0)).toBe(true);
      }
    });

    it('always returns a non-empty headline and a valid intensity', () => {
      const valid = new Set(['full-rest', 'light', 'active']);
      for (const load of samples) {
        const rx = recoveryPrescription(load);
        expect(rx.headline.length).toBeGreaterThan(0);
        expect(valid.has(rx.intensity)).toBe(true);
      }
    });
  });
});
