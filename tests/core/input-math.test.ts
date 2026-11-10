import { describe, expect, it } from 'vitest';
import { keyboardMove, lookCurve, mergeMove, radialDeadZone, sanitizeMouseDelta } from '../../src/core/input-math';

describe('radialDeadZone', () => {
  it('zeroes small stick noise', () => {
    expect(radialDeadZone(0.1, 0.1, 0.18)).toEqual({ x: 0, y: 0 });
  });
  it('rescales so just past the dead zone is near zero and full is 1', () => {
    const just = radialDeadZone(0.2, 0, 0.18);
    expect(just.x).toBeGreaterThan(0);
    expect(just.x).toBeLessThan(0.05);
    const full = radialDeadZone(1, 0, 0.18);
    expect(full.x).toBeCloseTo(1);
  });
  it('keeps direction and clamps corners to length 1', () => {
    const v = radialDeadZone(1, 1, 0.18);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1);
    expect(v.x).toBeCloseTo(v.y);
  });
});

describe('lookCurve', () => {
  it('is gentler than linear near the centre but reaches 1', () => {
    const lin = radialDeadZone(0.5, 0, 0.15).x;
    expect(lookCurve(0.5, 0, 0.15).x).toBeLessThan(lin);
    expect(lookCurve(1, 0, 0.15).x).toBeCloseTo(1);
  });
});

describe('keyboard + merge', () => {
  it('normalises diagonals', () => {
    const v = keyboardMove(false, true, false, true);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1);
  });
  it('opposite keys cancel', () => {
    expect(keyboardMove(true, true, false, false)).toEqual({ x: 0, y: 0 });
  });
  it('merging keyboard and stick never exceeds 1', () => {
    const m = mergeMove({ x: 0, y: 1 }, { x: 0.8, y: 0.6 });
    expect(Math.hypot(m.x, m.y)).toBeLessThanOrEqual(1 + 1e-9);
  });
  it('rejects absurd mouse jumps', () => {
    expect(sanitizeMouseDelta(1200)).toBe(0);
    expect(sanitizeMouseDelta(-12)).toBe(-12);
  });
});
