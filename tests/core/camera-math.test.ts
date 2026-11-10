import { describe, expect, it } from 'vitest';
import { CAMERA_HARD_MIN, clamp, orbitOffset, resolveCameraDistance } from '../../src/core/camera-math';

describe('resolveCameraDistance', () => {
  it('uses the desired distance when nothing is hit', () => {
    expect(resolveCameraDistance(6.5, 6.5, null, 0.3, 0.9, 3, 1 / 60)).toBe(6.5);
  });
  it('pulls in instantly in front of a wall (with margin)', () => {
    expect(resolveCameraDistance(6.5, 6.5, 3, 0.3, 0.9, 3, 1 / 60)).toBeCloseTo(2.7);
  });
  it('prefers the minimum distance when the wall leaves room for it', () => {
    expect(resolveCameraDistance(6.5, 6.5, 1.1, 0.3, 0.9, 3, 1 / 60)).toBe(0.9);
  });
  it('never ends up inside a wall closer than the minimum (bounded by a hard minimum)', () => {
    expect(resolveCameraDistance(6.5, 6.5, 0.52, 0.3, 0.9, 3, 1 / 60)).toBeCloseTo(0.4);
    expect(resolveCameraDistance(6.5, 6.5, 0.05, 0.3, 0.9, 3, 1 / 60)).toBe(CAMERA_HARD_MIN);
  });
  it('eases back out smoothly when the view clears', () => {
    const d1 = resolveCameraDistance(2, 6.5, null, 0.3, 0.9, 3, 1 / 60);
    expect(d1).toBeGreaterThan(2);
    expect(d1).toBeLessThan(2.5);
    let d = 2;
    for (let i = 0; i < 600; i++) d = resolveCameraDistance(d, 6.5, null, 0.3, 0.9, 3, 1 / 60);
    expect(d).toBeCloseTo(6.5, 2);
  });
});

describe('orbitOffset', () => {
  it('puts the camera behind the look direction and above for positive pitch', () => {
    const o = orbitOffset(Math.PI, 0.3, 10); // looking −Z → camera at +Z
    expect(o.z).toBeGreaterThan(9);
    expect(o.y).toBeGreaterThan(2.9);
    expect(Math.hypot(o.x, o.y, o.z)).toBeCloseTo(10);
  });
  it('clamp', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
  });
});
