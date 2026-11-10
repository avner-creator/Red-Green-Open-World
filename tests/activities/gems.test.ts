import { describe, expect, it } from 'vitest';
import { GemField, segmentSphereHit } from '../../src/activities/gemLogic';

const v = (x: number, y: number, z: number) => ({ x, y, z });
const opts = { pickupRadius: 1.6, nearRadius: 12, nearInterval: 1.5 };

describe('segmentSphereHit', () => {
  it('hits when the end point is inside', () => {
    expect(segmentSphereHit(v(10, 0, 0), v(1, 0, 0), v(0, 0, 0), 1.6)).toBe(true);
  });
  it('catches a fast pass straight through the sphere (no tunnelling)', () => {
    expect(segmentSphereHit(v(-50, 0.5, 0), v(50, 0.5, 0), v(0, 0, 0), 1.6)).toBe(true);
  });
  it('misses a segment that passes outside the radius', () => {
    expect(segmentSphereHit(v(-50, 5, 0), v(50, 5, 0), v(0, 0, 0), 1.6)).toBe(false);
  });
  it('does not extend beyond the segment ends', () => {
    expect(segmentSphereHit(v(-50, 0, 0), v(-10, 0, 0), v(0, 0, 0), 1.6)).toBe(false);
  });
  it('handles a zero-length segment as a point', () => {
    expect(segmentSphereHit(v(1, 0, 0), v(1, 0, 0), v(0, 0, 0), 1.6)).toBe(true);
    expect(segmentSphereHit(v(3, 0, 0), v(3, 0, 0), v(0, 0, 0), 1.6)).toBe(false);
  });
});

describe('GemField', () => {
  const spots = [v(0, 1, 0), v(10, 1, 0), v(100, 1, 0)];

  it('collects each gem once', () => {
    const f = new GemField(spots, opts);
    expect(f.collect(v(0, 1, 0), v(0, 1, 0))).toEqual([0]);
    expect(f.collect(v(0, 1, 0), v(0, 1, 0))).toEqual([]);
    expect(f.count).toBe(1);
  });

  it('collects several gems along one segment', () => {
    const f = new GemField(spots, opts);
    expect(f.collect(v(-5, 1, 0), v(15, 1, 0))).toEqual([0, 1]);
    expect(f.count).toBe(2);
  });

  it('reset brings every gem back', () => {
    const f = new GemField(spots, opts);
    f.collect(v(-5, 1, 0), v(110, 1, 0));
    expect(f.count).toBe(3);
    f.reset();
    expect(f.count).toBe(0);
    expect(f.collected.every((c) => !c)).toBe(true);
    expect(f.collect(v(0, 1, 0), v(0, 1, 0))).toEqual([0]);
  });

  it('nearest ignores collected and far gems', () => {
    const f = new GemField(spots, opts);
    expect(f.nearest(v(9, 1, 0))?.index).toBe(1);
    f.collect(v(10, 1, 0), v(10, 1, 0));
    expect(f.nearest(v(9, 1, 0))?.index).toBe(0);
    expect(f.nearest(v(500, 1, 0))).toBeNull();
  });

  it('near hint is throttled to once per interval', () => {
    const f = new GemField(spots, opts);
    const p = v(5, 1, 0);
    expect(f.tickNear(0.016, p)).not.toBeNull();
    let hints = 0;
    for (let i = 0; i < 100; i++) if (f.tickNear(1 / 60, p)) hints++; // ~1.67 s
    expect(hints).toBe(1);
  });

  it('no near hint (and no throttle) when nothing is near', () => {
    const f = new GemField(spots, opts);
    expect(f.tickNear(0.1, v(500, 1, 0))).toBeNull();
    expect(f.tickNear(0.1, v(5, 1, 0))).not.toBeNull();
  });
});
