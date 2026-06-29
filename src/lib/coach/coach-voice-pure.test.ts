import { describe, it, expect } from 'vitest';
import { getCoachMessages, taperStartWeek } from './coach-voice-pure';

const BASE = { programWeeks: 18, dojo: 'hansons' };

describe('taperStartWeek', () => {
  it('returns programWeeks - 2 for an 18-week plan', () => {
    expect(taperStartWeek(18)).toBe(16);
  });

  it('returns programWeeks - 2 for a 12-week plan', () => {
    expect(taperStartWeek(12)).toBe(10);
  });

  it('clamps to 1 minimum', () => {
    expect(taperStartWeek(2)).toBe(1);
  });
});

describe('getCoachMessages — block-start', () => {
  it('fires on week 1', () => {
    const msgs = getCoachMessages({ ...BASE, weekNumber: 1 });
    expect(msgs.some((m) => m.trigger === 'block-start')).toBe(true);
  });

  it('fires on week 2', () => {
    const msgs = getCoachMessages({ ...BASE, weekNumber: 2 });
    expect(msgs.some((m) => m.trigger === 'block-start')).toBe(true);
  });

  it('does not fire on week 3', () => {
    const msgs = getCoachMessages({ ...BASE, weekNumber: 3 });
    expect(msgs.some((m) => m.trigger === 'block-start')).toBe(false);
  });
});

describe('getCoachMessages — quiet zone', () => {
  it('returns no messages in the early quiet zone (week 4)', () => {
    const msgs = getCoachMessages({ ...BASE, weekNumber: 4 });
    expect(msgs).toHaveLength(0);
  });

  it('returns no messages in the quiet zone (week 6)', () => {
    const msgs = getCoachMessages({ ...BASE, weekNumber: 6 });
    expect(msgs).toHaveLength(0);
  });
});

describe('getCoachMessages — mid-block', () => {
  it('fires during weeks 7–10 of an 18-week plan', () => {
    for (const w of [7, 8, 9, 10]) {
      const msgs = getCoachMessages({ ...BASE, weekNumber: w });
      expect(msgs.some((m) => m.trigger === 'mid-block')).toBe(true);
    }
  });

  it('does not fire outside the mid-block window', () => {
    for (const w of [3, 6, 12, 14]) {
      const msgs = getCoachMessages({ ...BASE, weekNumber: w });
      expect(msgs.some((m) => m.trigger === 'mid-block')).toBe(false);
    }
  });
});

describe('getCoachMessages — taper-start', () => {
  it('fires exactly on taper entry week (16 for 18-week plan)', () => {
    const msgs = getCoachMessages({ ...BASE, weekNumber: 16 });
    expect(msgs.some((m) => m.trigger === 'taper-start')).toBe(true);
  });

  it('does not fire before taper entry', () => {
    const msgs = getCoachMessages({ ...BASE, weekNumber: 15 });
    expect(msgs.some((m) => m.trigger === 'taper-start')).toBe(false);
  });

  it('does not fire after taper entry (fires only once)', () => {
    const msgs = getCoachMessages({ ...BASE, weekNumber: 17 });
    expect(msgs.some((m) => m.trigger === 'taper-start')).toBe(false);
  });
});

describe('getCoachMessages — block-end', () => {
  it('fires in the final 2 weeks', () => {
    for (const w of [17, 18]) {
      const msgs = getCoachMessages({ ...BASE, weekNumber: w });
      expect(msgs.some((m) => m.trigger === 'block-end')).toBe(true);
    }
  });

  it('does not fire before the final 2 weeks', () => {
    const msgs = getCoachMessages({ ...BASE, weekNumber: 15 });
    expect(msgs.some((m) => m.trigger === 'block-end')).toBe(false);
  });
});

describe('getCoachMessages — no duplicate triggers', () => {
  it('never emits duplicate triggers for any week of an 18-week block', () => {
    for (let w = 1; w <= 18; w++) {
      const msgs = getCoachMessages({ ...BASE, weekNumber: w });
      const triggers = msgs.map((m) => m.trigger);
      expect(new Set(triggers).size).toBe(triggers.length);
    }
  });
});

describe('getCoachMessages — message content', () => {
  it('includes the week number in every message body', () => {
    const weeksToCheck = [1, 8, 16, 18];
    for (const w of weeksToCheck) {
      const msgs = getCoachMessages({ ...BASE, weekNumber: w });
      for (const m of msgs) {
        expect(m.body).toContain(String(w));
      }
    }
  });

  it('returns messages with non-empty headline and body', () => {
    for (let w = 1; w <= 18; w++) {
      const msgs = getCoachMessages({ ...BASE, weekNumber: w });
      for (const m of msgs) {
        expect(m.headline.length).toBeGreaterThan(0);
        expect(m.body.length).toBeGreaterThan(0);
      }
    }
  });
});
