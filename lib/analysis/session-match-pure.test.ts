import { describe, it, expect } from 'vitest';
import {
  analyzeWeekMatching,
  plannedKind,
  activityKind,
  type PlannedSlot,
  type ActivityLite,
} from './session-match-pure';

describe('plannedKind / activityKind', () => {
  it('maps planned session types to kinds', () => {
    expect(plannedKind('tempo')).toBe('run');
    expect(plannedKind('cross')).toBe('cross');
    expect(plannedKind('strength')).toBe('strength');
    expect(plannedKind('rest')).toBeNull();
  });
  it('maps activity types to kinds, ignoring walks/yoga', () => {
    expect(activityKind('Run')).toBe('run');
    expect(activityKind('Ride')).toBe('cross');
    expect(activityKind('WeightTraining')).toBe('strength');
    expect(activityKind('Walk')).toBeNull();
    expect(activityKind('Yoga')).toBeNull();
  });
});

describe('analyzeWeekMatching', () => {
  const week = (...types: (SessionTypeArg)[]): PlannedSlot[] =>
    types.map((t, dow) => ({ dow, type: t })) as PlannedSlot[];

  it('claims same-day same-kind with no shift and no extra', () => {
    const planned: PlannedSlot[] = [{ dow: 1, type: 'tempo' }];
    const acts: ActivityLite[] = [{ dow: 1, type: 'Run' }];
    const r = analyzeWeekMatching(planned, acts);
    expect(r.shifted).toEqual([]);
    expect(r.extras).toEqual([]);
  });

  it('detects a session shifted by one day', () => {
    const planned: PlannedSlot[] = [{ dow: 1, type: 'tempo' }]; // Tue
    const acts: ActivityLite[] = [{ dow: 2, type: 'Run' }]; // Wed
    const r = analyzeWeekMatching(planned, acts);
    expect(r.shifted).toEqual([{ plannedDow: 1, plannedType: 'tempo', doneDow: 2 }]);
    expect(r.extras).toEqual([]);
  });

  it('flags an unmatched activity as an extra', () => {
    const planned: PlannedSlot[] = [{ dow: 0, type: 'rest' }];
    const acts: ActivityLite[] = [{ dow: 5, type: 'Run' }];
    const r = analyzeWeekMatching(planned, acts);
    expect(r.extras).toEqual([{ dow: 5, kind: 'run' }]);
    expect(r.shifted).toEqual([]);
  });

  it('does not flag walks/yoga as extras', () => {
    const r = analyzeWeekMatching([{ dow: 0, type: 'rest' }], [{ dow: 3, type: 'Walk' }, { dow: 4, type: 'Yoga' }]);
    expect(r.extras).toEqual([]);
  });

  it('prefers same-day over adjacent (two runs, one slot)', () => {
    const planned: PlannedSlot[] = [{ dow: 2, type: 'easy' }];
    const acts: ActivityLite[] = [{ dow: 2, type: 'Run' }, { dow: 3, type: 'Run' }];
    const r = analyzeWeekMatching(planned, acts);
    // same-day run claims the slot; the dow-3 run is an extra (no slot adjacent unclaimed)
    expect(r.shifted).toEqual([]);
    expect(r.extras).toEqual([{ dow: 3, kind: 'run' }]);
  });

  it('matches kind strictly (a ride does not satisfy a run slot)', () => {
    const planned: PlannedSlot[] = [{ dow: 1, type: 'tempo' }];
    const acts: ActivityLite[] = [{ dow: 1, type: 'Ride' }];
    const r = analyzeWeekMatching(planned, acts);
    expect(r.shifted).toEqual([]);
    expect(r.extras).toEqual([{ dow: 1, kind: 'cross' }]);
  });

  it('handles a clean Tue/Thu swap as two shifted sessions', () => {
    // planned tempo Tue(1) + easy Thu(3); done Wed(2) + Fri(4) -> both shifted by 1
    const planned: PlannedSlot[] = [{ dow: 1, type: 'tempo' }, { dow: 3, type: 'easy' }];
    const acts: ActivityLite[] = [{ dow: 2, type: 'Run' }, { dow: 4, type: 'Run' }];
    const r = analyzeWeekMatching(planned, acts);
    expect(r.shifted).toHaveLength(2);
    expect(r.extras).toEqual([]);
  });
});

// local alias so the helper above reads cleanly
type SessionTypeArg = PlannedSlot['type'];
