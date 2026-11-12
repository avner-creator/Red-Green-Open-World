import { describe, expect, it } from 'vitest';
import { FREE_UNSTICK, openYaw, WedgeWatch } from '../../src/core/vehicles/unstick';

describe('free-ride unstick (QA7 M1)', () => {
  it('fires once after pushing for FREE_UNSTICK.seconds without leaving a 1.2 m circle', () => {
    const w = new WedgeWatch();
    let fired = 0;
    let t = 0;
    for (; t < FREE_UNSTICK.seconds - 0.1; t += 1 / 60) if (w.update(1 / 60, 1, Math.sin(t * 20) * 0.4, 0)) fired++;
    expect(fired).toBe(0);
    for (; t < FREE_UNSTICK.seconds + 0.2; t += 1 / 60) if (w.update(1 / 60, 1, 0.2, 0)) fired++;
    expect(fired).toBe(1);
  });

  it('never fires while the ride makes progress, or with the throttle off', () => {
    const w = new WedgeWatch();
    for (let i = 0; i < 600; i++) expect(w.update(1 / 60, 1, i * 0.01, 0)).toBe(false); // 0.6 m/s crawl
    for (let i = 0; i < 600; i++) expect(w.update(1 / 60, 0.2, 0, 0)).toBe(false);
  });

  it('counts reverse throttle as pushing too', () => {
    const w = new WedgeWatch();
    let fired = false;
    for (let i = 0; i < 200; i++) fired ||= w.update(1 / 60, -1, 0, 0);
    expect(fired).toBe(true);
  });

  it('turns toward the most open way, never back into the blocked one', () => {
    // A wall ahead (yaw 0) and to the left; open to the right (yaw -π/2) only.
    const clear = (y: number): number => (Math.abs(Math.atan2(Math.sin(y + Math.PI / 2), Math.cos(y + Math.PI / 2))) < 0.3 ? 40 : 2);
    const y = openYaw(0, 0, clear);
    expect(Math.abs(y + Math.PI / 2)).toBeLessThan(0.3);
    // Everything equally open: the smallest turn that is not within `avoid` of the blocked way.
    const y2 = openYaw(0, 0, () => 50);
    expect(Math.abs(y2)).toBeGreaterThanOrEqual(FREE_UNSTICK.avoid - 1e-6);
    expect(Math.abs(y2)).toBeLessThan(Math.PI / 2);
  });
});
