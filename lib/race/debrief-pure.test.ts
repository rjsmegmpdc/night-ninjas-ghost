import { describe, it, expect } from 'vitest';
import { parseHmsToSeconds } from './debrief-pure';

describe('parseHmsToSeconds', () => {
  it('parses H:MM:SS', () => {
    expect(parseHmsToSeconds('2:58:30')).toBe(2 * 3600 + 58 * 60 + 30);
  });
  it('parses MM:SS', () => {
    expect(parseHmsToSeconds('42:10')).toBe(42 * 60 + 10);
  });
  it('rejects out-of-range minutes/seconds', () => {
    expect(parseHmsToSeconds('1:75:00')).toBeNull();
    expect(parseHmsToSeconds('40:90')).toBeNull();
  });
  it('rejects non-numeric, empty, or wrong-arity input', () => {
    expect(parseHmsToSeconds('abc')).toBeNull();
    expect(parseHmsToSeconds('')).toBeNull();
    expect(parseHmsToSeconds('1:2:3:4')).toBeNull();
    expect(parseHmsToSeconds('2::30')).toBeNull();
  });

  it('parses ultra finish time with hours > 9', () => {
    expect(parseHmsToSeconds('10:30:00')).toBe(10 * 3600 + 30 * 60);
  });

  it('parses H:MM:SS with a leading-zero hour', () => {
    expect(parseHmsToSeconds('02:58:30')).toBe(2 * 3600 + 58 * 60 + 30);
  });

  it('parses MM:SS with leading-zero minutes', () => {
    expect(parseHmsToSeconds('05:30')).toBe(5 * 60 + 30);
  });

  it('parses 0:00:00 as zero seconds', () => {
    expect(parseHmsToSeconds('0:00:00')).toBe(0);
  });
});
