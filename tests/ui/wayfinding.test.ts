import { describe, expect, it } from 'vitest';
import { distanceDots, pickHighlight, relativeBearing, stripPosition, STRIP_EDGE, wrapAngle } from '../../src/ui/compassMath';
import { hintKind } from '../../src/ui/modeHints';

describe('compass maths', () => {
  const o = { x: 0, z: 0 };
  it('wraps angles', () => {
    expect(Math.abs(wrapAngle(3 * Math.PI))).toBeCloseTo(Math.PI, 6);
    expect(wrapAngle(0.5)).toBeCloseTo(0.5, 6);
  });
  it('bearing is 0 ahead, + to the right', () => {
    expect(relativeBearing(0, o, { x: 0, z: 10 })).toBeCloseTo(0, 6);
    // yaw 0 looks down +z; the right hand side is -x
    expect(relativeBearing(0, o, { x: -10, z: 0 })).toBeCloseTo(Math.PI / 2, 6);
    expect(relativeBearing(0, o, { x: 10, z: 0 })).toBeCloseTo(-Math.PI / 2, 6);
    // turn to face +x: it is ahead
    expect(relativeBearing(Math.PI / 2, o, { x: 10, z: 0 })).toBeCloseTo(0, 6);
    expect(Math.abs(relativeBearing(0, o, { x: 0, z: -10 }))).toBeCloseTo(Math.PI, 6);
  });
  it('maps to the strip and clamps at the ends', () => {
    expect(stripPosition(0)).toEqual({ x: 0, clamped: false, side: 0 });
    const half = stripPosition(0.5);
    expect(half.x).toBeGreaterThan(0);
    expect(half.clamped).toBe(false);
    expect(stripPosition(2.5)).toEqual({ x: STRIP_EDGE, clamped: true, side: 1 });
    expect(stripPosition(-2.5).x).toBe(-STRIP_EDGE);
  });
  it('distance to 1..5 dots, closer is more', () => {
    expect(distanceDots(5)).toBe(5);
    expect(distanceDots(30)).toBe(4);
    expect(distanceDots(60)).toBe(3);
    expect(distanceDots(120)).toBe(2);
    expect(distanceDots(400)).toBe(1);
  });
  it('highlights the faced marker, else the nearest', () => {
    expect(pickHighlight([{ rel: 1, dist: 10 }, { rel: 0.1, dist: 90 }])).toBe(1);
    expect(pickHighlight([{ rel: 1, dist: 50 }, { rel: -2, dist: 10 }])).toBe(1);
    expect(pickHighlight([])).toBe(-1);
  });
  it('mode hints: driving and external only', () => {
    expect(hintKind('driving')).toBe('driving');
    expect(hintKind('external')).toBe('skydive');
    expect(hintKind('walk')).toBeNull();
  });
});
