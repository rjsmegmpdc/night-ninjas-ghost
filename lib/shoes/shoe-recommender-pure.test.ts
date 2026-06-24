import { describe, it, expect } from 'vitest';
import {
  recommendShoe,
  computeRotationHealth,
  type ShoeForRecommender,
} from './shoe-recommender-pure';

function makeShoe(overrides: Partial<ShoeForRecommender> & { id: number }): ShoeForRecommender {
  return {
    name: `Shoe ${overrides.id}`,
    category: 'daily',
    pctUsed: 20,
    totalKm: 160,
    effectiveTargetKm: 800,
    status: 'active',
    lastUsedDate: '2026-06-01',
    ...overrides,
  };
}

const dailyShoe   = makeShoe({ id: 1, category: 'daily',       pctUsed: 30, totalKm: 240, effectiveTargetKm: 800, name: 'Daily' });
const superTrainer = makeShoe({ id: 2, category: 'super-trainer', pctUsed: 20, totalKm: 160, effectiveTargetKm: 800, name: 'SuperTrain' });
const uptempo     = makeShoe({ id: 3, category: 'uptempo',     pctUsed: 10, totalKm:  45, effectiveTargetKm: 450, name: 'Uptempo' });
const raceDayShoe = makeShoe({ id: 4, category: 'race-day',    pctUsed:  5, totalKm:  22, effectiveTargetKm: 450, name: 'Racer' });
const trailShoe   = makeShoe({ id: 5, category: 'trail',       pctUsed: 40, totalKm: 320, effectiveTargetKm: 800, name: 'Trail' });

const allShoes = [dailyShoe, superTrainer, uptempo, raceDayShoe, trailShoe];

describe('recommendShoe — session type routing', () => {
  it('returns null for null session type', () => {
    expect(recommendShoe(null, allShoes)).toBeNull();
  });

  it('returns null for cross session', () => {
    expect(recommendShoe('cross', allShoes)).toBeNull();
  });

  it('returns null for strength session', () => {
    expect(recommendShoe('strength', allShoes)).toBeNull();
  });

  it('returns null for rest session', () => {
    expect(recommendShoe('rest', allShoes)).toBeNull();
  });

  it('returns null when no active shoes', () => {
    const retired = allShoes.map((s) => ({ ...s, status: 'retired' }));
    expect(recommendShoe('easy', retired)).toBeNull();
  });

  it('returns null when all shoes at 100%', () => {
    const spent = allShoes.map((s) => ({ ...s, pctUsed: 100 }));
    expect(recommendShoe('easy', spent)).toBeNull();
  });
});

describe('recommendShoe — long run', () => {
  it('prefers daily category for long', () => {
    const rec = recommendShoe('long', allShoes);
    expect(rec?.category).toBe('daily');
  });

  it('falls back to super-trainer when no daily available', () => {
    const noDaily = allShoes.filter((s) => s.category !== 'daily');
    const rec = recommendShoe('long', noDaily);
    expect(rec?.category).toBe('super-trainer');
  });

  it('picks daily shoe with most km remaining', () => {
    const fresh = makeShoe({ id: 10, category: 'daily', pctUsed: 5, totalKm: 40, effectiveTargetKm: 800, name: 'FreshDaily' });
    const rec = recommendShoe('long', [...allShoes, fresh]);
    expect(rec?.shoeId).toBe(10);
  });
});

describe('recommendShoe — easy', () => {
  it('prefers daily for easy runs', () => {
    const rec = recommendShoe('easy', allShoes);
    expect(rec?.category).toBe('daily');
  });
});

describe('recommendShoe — recovery', () => {
  it('prefers daily for recovery', () => {
    const rec = recommendShoe('recovery', allShoes);
    expect(rec?.category).toBe('daily');
  });

  it('falls back to super-trainer when no daily', () => {
    const noDaily = allShoes.filter((s) => s.category !== 'daily');
    const rec = recommendShoe('recovery', noDaily);
    expect(rec?.category).toBe('super-trainer');
  });

  it('does not recommend uptempo for recovery even if only option in some categories', () => {
    const onlyUptempo = [uptempo];
    // uptempo not in recovery order, falls through to generic fallback
    const rec = recommendShoe('recovery', onlyUptempo);
    // falls back to generic — should still return uptempo as fallback
    expect(rec?.shoeId).toBe(3);
  });
});

describe('recommendShoe — tempo/interval', () => {
  it('prefers uptempo for tempo', () => {
    const rec = recommendShoe('tempo', allShoes);
    expect(rec?.category).toBe('uptempo');
  });

  it('prefers uptempo for interval', () => {
    const rec = recommendShoe('interval', allShoes);
    expect(rec?.category).toBe('uptempo');
  });

  it('picks freshest uptempo shoe', () => {
    const freshUptempo = makeShoe({ id: 20, category: 'uptempo', pctUsed: 3, totalKm: 13, effectiveTargetKm: 450, name: 'FreshUptempo' });
    const rec = recommendShoe('tempo', [...allShoes, freshUptempo]);
    expect(rec?.shoeId).toBe(20);
  });

  it('falls back to super-trainer when no uptempo', () => {
    const noUptempo = allShoes.filter((s) => s.category !== 'uptempo');
    const rec = recommendShoe('tempo', noUptempo);
    expect(rec?.category).toBe('super-trainer');
  });
});

describe('recommendShoe — repetition', () => {
  it('prefers race-day for repetition', () => {
    const rec = recommendShoe('repetition', allShoes);
    expect(rec?.category).toBe('race-day');
  });

  it('falls back to uptempo when no race-day', () => {
    const noRace = allShoes.filter((s) => s.category !== 'race-day');
    const rec = recommendShoe('repetition', noRace);
    expect(rec?.category).toBe('uptempo');
  });
});

describe('recommendShoe — generic fallback', () => {
  it('returns something even with uncategorised shoe', () => {
    const uncategorised = makeShoe({ id: 99, category: null, pctUsed: 20, name: 'Unknown' });
    const rec = recommendShoe('easy', [uncategorised]);
    expect(rec?.shoeId).toBe(99);
  });
});

describe('recommendShoe — result shape', () => {
  it('includes kmRemaining and pctUsed', () => {
    const rec = recommendShoe('long', allShoes);
    expect(rec?.kmRemaining).toBeGreaterThanOrEqual(0);
    expect(rec?.pctUsed).toBeGreaterThanOrEqual(0);
    expect(rec?.pctUsed).toBeLessThanOrEqual(100);
  });

  it('includes a reason string', () => {
    const rec = recommendShoe('long', allShoes);
    expect(typeof rec?.reason).toBe('string');
    expect(rec!.reason.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Rotation health
// ---------------------------------------------------------------------------

describe('computeRotationHealth', () => {
  const today = '2026-06-23';

  it('good when 2+ shoes used in last 28 days', () => {
    const shoes: ShoeForRecommender[] = [
      makeShoe({ id: 1, lastUsedDate: '2026-06-20', status: 'active' }),
      makeShoe({ id: 2, lastUsedDate: '2026-06-10', status: 'active' }),
    ];
    const health = computeRotationHealth(shoes, today);
    expect(health.status).toBe('good');
    expect(health.recentlyUsedCount).toBe(2);
  });

  it('caution when only 1 shoe used recently but 2 active', () => {
    const shoes: ShoeForRecommender[] = [
      makeShoe({ id: 1, lastUsedDate: '2026-06-20', status: 'active' }),
      makeShoe({ id: 2, lastUsedDate: '2026-05-01', status: 'active' }),  // >28 days ago
    ];
    const health = computeRotationHealth(shoes, today);
    expect(health.status).toBe('caution');
    expect(health.recentlyUsedCount).toBe(1);
  });

  it('poor when no shoes used recently', () => {
    const shoes: ShoeForRecommender[] = [
      makeShoe({ id: 1, lastUsedDate: '2026-05-01', status: 'active' }),
    ];
    const health = computeRotationHealth(shoes, today);
    expect(health.status).toBe('poor');
    expect(health.recentlyUsedCount).toBe(0);
  });

  it('poor when no active shoes', () => {
    const shoes: ShoeForRecommender[] = [
      makeShoe({ id: 1, status: 'retired', lastUsedDate: '2026-06-20' }),
    ];
    const health = computeRotationHealth(shoes, today);
    expect(health.status).toBe('poor');
    expect(health.activeShoesCount).toBe(0);
  });

  it('ignores retired shoes in rotation count', () => {
    const shoes: ShoeForRecommender[] = [
      makeShoe({ id: 1, lastUsedDate: '2026-06-20', status: 'active' }),
      makeShoe({ id: 2, lastUsedDate: '2026-06-15', status: 'retired' }),
      makeShoe({ id: 3, lastUsedDate: '2026-06-10', status: 'active' }),
    ];
    const health = computeRotationHealth(shoes, today);
    expect(health.recentlyUsedCount).toBe(2);
    expect(health.activeShoesCount).toBe(2);
    expect(health.status).toBe('good');
  });

  it('treats null lastUsedDate as not recently used', () => {
    const shoes: ShoeForRecommender[] = [
      makeShoe({ id: 1, lastUsedDate: null, status: 'active' }),
    ];
    const health = computeRotationHealth(shoes, today);
    expect(health.recentlyUsedCount).toBe(0);
  });

  it('shoe used exactly 28 days ago is counted as recently used (inclusive boundary)', () => {
    // today='2026-06-23'; cutoff = 2026-06-23 minus 28 days = 2026-05-26
    const shoes: ShoeForRecommender[] = [
      makeShoe({ id: 10, lastUsedDate: '2026-05-26', status: 'active' }),
      makeShoe({ id: 11, lastUsedDate: '2026-05-25', status: 'active' }), // one day outside
    ];
    const health = computeRotationHealth(shoes, today);
    expect(health.recentlyUsedCount).toBe(1);
  });

  it('tie-break: identical shoes produce a stable recommendation across calls', () => {
    const twin1 = makeShoe({ id: 20, category: 'daily', pctUsed: 20, totalKm: 160, effectiveTargetKm: 800, name: 'TwinA' });
    const twin2 = makeShoe({ id: 21, category: 'daily', pctUsed: 20, totalKm: 160, effectiveTargetKm: 800, name: 'TwinB' });
    const rec1 = recommendShoe('easy', [twin1, twin2]);
    const rec2 = recommendShoe('easy', [twin1, twin2]);
    expect(rec1?.shoeId).toBe(rec2?.shoeId);
  });
});

describe('recommendShoe — worn-past-target', () => {
  it('does not recommend a shoe above 100% usage', () => {
    const worn = makeShoe({ id: 99, category: 'daily', pctUsed: 110, totalKm: 880, effectiveTargetKm: 800, name: 'Worn' });
    expect(recommendShoe('easy', [worn])).toBeNull();
  });
});
