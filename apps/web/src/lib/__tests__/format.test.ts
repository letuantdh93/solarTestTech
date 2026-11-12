import { describe, it, expect } from 'vitest';
import { fmtClock, parseDecimal, fmtPct } from '../format';

describe('format helpers', () => {
  it('parses Vietnamese decimals', () => {
    expect(parseDecimal('53,5')).toBe(53.5);
    expect(parseDecimal(' 1079.3 ')).toBe(1079.3);
    expect(parseDecimal('-0,27')).toBe(-0.27);
    expect(parseDecimal('abc')).toBeNull();
    expect(parseDecimal('')).toBeNull();
  });
  it('formats countdown clock', () => {
    expect(fmtClock(75)).toBe('01:15');
    expect(fmtClock(3725)).toBe('1:02:05');
    expect(fmtClock(-5)).toBe('00:00');
  });
  it('formats percentages with Vietnamese decimal comma', () => {
    expect(fmtPct(73.333)).toBe('73,3%');
  });
});
