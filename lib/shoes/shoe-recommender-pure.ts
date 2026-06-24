import type { SessionType } from '@/lib/plans/types';

export type ShoeCategory = 'race-day' | 'super-trainer' | 'uptempo' | 'daily' | 'trail';

export interface ShoeForRecommender {
  id: number;
  name: string;
  category: string | null;
  pctUsed: number;      // 0–100
  totalKm: number;
  effectiveTargetKm: number;
  status: string;       // 'active' | 'retired'
  lastUsedDate: string | null;
}

export interface ShoeRecommendation {
  shoeId: number;
  shoeName: string;
  category: ShoeCategory | null;
  kmRemaining: number;
  pctUsed: number;
  reason: string;
}

export interface RotationHealth {
  activeShoesCount: number;
  recentlyUsedCount: number;  // distinct shoes used in last 28 days
  status: 'good' | 'caution' | 'poor';
  note: string;
}

// Category preferences per session type — ordered by suitability
const SESSION_CATEGORY_ORDER: Partial<Record<SessionType, ShoeCategory[]>> = {
  long:       ['daily', 'super-trainer', 'uptempo'],
  easy:       ['daily', 'super-trainer', 'uptempo'],
  recovery:   ['daily', 'super-trainer'],
  tempo:      ['uptempo', 'super-trainer', 'daily'],
  interval:   ['uptempo', 'super-trainer', 'daily'],
  repetition: ['race-day', 'uptempo', 'super-trainer'],
  // cross/strength/rest → no running shoe needed
};

const SESSION_REASON: Partial<Record<SessionType, string>> = {
  long:       'cushioned for long effort',
  easy:       'daily trainer for aerobic base',
  recovery:   'max cushion to spare the legs',
  tempo:      'responsive trainer for threshold work',
  interval:   'snappy trainer for quality session',
  repetition: 'race-ready for speed reps',
};

function isRunningSession(type: SessionType): boolean {
  return !['cross', 'strength', 'rest'].includes(type);
}

function kmRemaining(shoe: ShoeForRecommender): number {
  return Math.max(0, shoe.effectiveTargetKm - shoe.totalKm);
}

function isUsable(shoe: ShoeForRecommender): boolean {
  return shoe.status === 'active' && shoe.pctUsed < 100;
}

// Sort candidates: prefer most life remaining for endurance, freshest for speed
function sortForSession(shoes: ShoeForRecommender[], type: SessionType): ShoeForRecommender[] {
  if (type === 'repetition' || type === 'interval' || type === 'tempo') {
    // freshest first (lowest pctUsed)
    return [...shoes].sort((a, b) => a.pctUsed - b.pctUsed);
  }
  // most life remaining first
  return [...shoes].sort((a, b) => kmRemaining(b) - kmRemaining(a));
}

export function recommendShoe(
  sessionType: SessionType | null,
  shoes: ShoeForRecommender[]
): ShoeRecommendation | null {
  if (!sessionType || !isRunningSession(sessionType)) return null;

  const usable = shoes.filter(isUsable);
  if (usable.length === 0) return null;

  const categoryOrder = SESSION_CATEGORY_ORDER[sessionType];
  const reason = SESSION_REASON[sessionType] ?? 'best available';

  if (categoryOrder) {
    for (const cat of categoryOrder) {
      const inCat = usable.filter((s) => s.category === cat);
      if (inCat.length === 0) continue;
      const sorted = sortForSession(inCat, sessionType);
      const pick = sorted[0];
      return {
        shoeId: pick.id,
        shoeName: pick.name,
        category: cat,
        kmRemaining: Math.round(kmRemaining(pick)),
        pctUsed: Math.round(pick.pctUsed),
        reason,
      };
    }
  }

  // Fallback: any active shoe, most life remaining
  const fallback = sortForSession(usable, sessionType)[0];
  return {
    shoeId: fallback.id,
    shoeName: fallback.name,
    category: (fallback.category as ShoeCategory) ?? null,
    kmRemaining: Math.round(kmRemaining(fallback)),
    pctUsed: Math.round(fallback.pctUsed),
    reason,
  };
}

const RECENT_DAYS = 28;

export function computeRotationHealth(
  shoes: ShoeForRecommender[],
  today: string  // ISO YYYY-MM-DD
): RotationHealth {
  const activeShoes = shoes.filter((s) => s.status === 'active');
  const cutoff = new Date(today + 'T00:00:00Z');
  cutoff.setUTCDate(cutoff.getUTCDate() - RECENT_DAYS);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  const recentlyUsed = activeShoes.filter(
    (s) => s.lastUsedDate !== null && s.lastUsedDate >= cutoffIso
  );

  const activeShoesCount = activeShoes.length;
  const recentlyUsedCount = recentlyUsed.length;

  if (recentlyUsedCount >= 2) {
    return {
      activeShoesCount,
      recentlyUsedCount,
      status: 'good',
      note: `Rotating across ${recentlyUsedCount} shoes — reduces repetitive stress.`,
    };
  }

  if (recentlyUsedCount === 1 && activeShoesCount >= 2) {
    return {
      activeShoesCount,
      recentlyUsedCount,
      status: 'caution',
      note: `Only 1 shoe used in the last 4 weeks — rotating helps extend shoe life and reduce injury risk.`,
    };
  }

  if (recentlyUsedCount === 0 && activeShoesCount > 0) {
    return {
      activeShoesCount,
      recentlyUsedCount,
      status: 'poor',
      note: 'No recent activity recorded against any shoe.',
    };
  }

  // activeShoesCount === 0 or recentlyUsedCount === 0 with no active shoes
  return {
    activeShoesCount,
    recentlyUsedCount,
    status: 'poor',
    note: 'No active shoes in rotation.',
  };
}
