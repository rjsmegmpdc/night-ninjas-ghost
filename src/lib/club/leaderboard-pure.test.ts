import { describe, it, expect } from 'vitest';
import { buildLeaderboard, windowStartIso, type CourseResult } from './leaderboard-pure';

const TODAY = '2026-07-07';

function result(over: Partial<CourseResult>): CourseResult {
  return {
    id: 1, memberId: 1, name: 'A', sex: 'M', yob: 1985,
    date: '2026-06-01', timeS: 1800,
    ...over,
  };
}

const DEFAULT_FILTERS = {
  window: 'all-time' as const,
  sex: 'all' as const,
  ageGroup: 'all' as const,
  legend: false,
};

describe('windowStartIso', () => {
  it('computes the three windows', () => {
    expect(windowStartIso('all-time', TODAY)).toBeNull();
    expect(windowStartIso('calendar-year', TODAY)).toBe('2026-01-01');
    expect(windowStartIso('rolling-12mo', TODAY)).toBe('2025-07-07');
  });
});

describe('buildLeaderboard', () => {
  const results: CourseResult[] = [
    result({ id: 1, memberId: 1, name: 'Fast Fiona',  sex: 'F', yob: 1990, date: '2026-05-01', timeS: 1500 }),
    result({ id: 2, memberId: 1, name: 'Fast Fiona',  sex: 'F', yob: 1990, date: '2026-06-01', timeS: 1550 }),
    result({ id: 3, memberId: 2, name: 'Steady Sam',  sex: 'M', yob: 1975, date: '2026-06-15', timeS: 1600 }),
    result({ id: 4, memberId: 3, name: 'Legend Lou',  sex: 'M', yob: 1980, date: '2024-01-10', timeS: 1700 }),
    result({ id: 5, memberId: 3, name: 'Legend Lou',  sex: 'M', yob: 1980, date: '2026-03-01', timeS: 1750 }),
    result({ id: 6, memberId: 3, name: 'Legend Lou',  sex: 'M', yob: 1980, date: '2026-06-20', timeS: 1720 }),
  ];

  it('ranks by best time, one row per member', () => {
    const board = buildLeaderboard(results, DEFAULT_FILTERS, TODAY);
    expect(board.map((r) => r.name)).toEqual(['Fast Fiona', 'Steady Sam', 'Legend Lou']);
    expect(board[0].bestTimeS).toBe(1500);
    expect(board[0].efforts).toBe(2);
    expect(board[2].bestTimeS).toBe(1700); // Lou's 2024 all-time best
  });

  it('rolling window drops old efforts', () => {
    const board = buildLeaderboard(results, { ...DEFAULT_FILTERS, window: 'rolling-12mo' }, TODAY);
    const lou = board.find((r) => r.name === 'Legend Lou')!;
    expect(lou.bestTimeS).toBe(1720); // 2024 effort excluded
    expect(lou.efforts).toBe(2);
  });

  it('filters by sex', () => {
    const board = buildLeaderboard(results, { ...DEFAULT_FILTERS, sex: 'F' }, TODAY);
    expect(board).toHaveLength(1);
    expect(board[0].name).toBe('Fast Fiona');
  });

  it('filters by age group', () => {
    // Sam: yob 1975 → 51 in 2026 → 50-54
    const board = buildLeaderboard(results, { ...DEFAULT_FILTERS, ageGroup: '50-54' }, TODAY);
    expect(board).toHaveLength(1);
    expect(board[0].name).toBe('Steady Sam');
  });

  it('legend mode ranks by effort count', () => {
    const board = buildLeaderboard(results, { ...DEFAULT_FILTERS, legend: true }, TODAY);
    expect(board[0].name).toBe('Legend Lou');
    expect(board[0].efforts).toBe(3);
    expect(board[0].bestTimeS).toBeNull();
  });
});
