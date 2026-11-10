import { describe, expect, it } from 'vitest';
import { GemField } from '../../src/activities/gemLogic';
import { popScale } from '../../src/activities/gems';

const v = (x: number, y: number, z: number) => ({ x, y, z });
const opts = { pickupRadius: 1.6, nearRadius: 12, nearInterval: 1.5 };

describe('GemField respawn', () => {
  const spots = [v(0, 1, 0), v(10, 1, 0)];
  const ropts = { ...opts, respawnSeconds: 45 };

  it('brings a collected gem back after the delay, and count keeps rising', () => {
    const f = new GemField(spots, ropts);
    f.collect(v(0, 1, 0), v(0, 1, 0));
    expect(f.tickRespawn(44)).toEqual([]);
    expect(f.collected[0]).toBe(true);
    expect(f.tickRespawn(1.5)).toEqual([0]);
    expect(f.collected[0]).toBe(false);
    f.collect(v(0, 1, 0), v(0, 1, 0));
    expect(f.count).toBe(2);
    expect(f.total).toBe(2);
  });

  it('only counts down collected gems and does not respawn twice', () => {
    const f = new GemField(spots, ropts);
    expect(f.tickRespawn(100)).toEqual([]);
    f.collect(v(10, 1, 0), v(10, 1, 0));
    expect(f.tickRespawn(50)).toEqual([1]);
    expect(f.tickRespawn(50)).toEqual([]);
  });

  it('respawnAll and reset bring everything back', () => {
    const f = new GemField(spots, ropts);
    f.collect(v(-5, 1, 0), v(15, 1, 0));
    expect(f.respawnAll()).toEqual([0, 1]);
    expect(f.collected.every((c) => !c)).toBe(true);
    f.collect(v(-5, 1, 0), v(15, 1, 0));
    f.reset();
    expect(f.respawnIn.every((t) => t === 0)).toBe(true);
  });

  it('without respawnSeconds a gem stays collected', () => {
    const f = new GemField(spots, opts);
    f.collect(v(0, 1, 0), v(0, 1, 0));
    expect(f.tickRespawn(1000)).toEqual([]);
  });

  it('uses a per-spot pickup radius (mega gems are bigger)', () => {
    const f = new GemField(spots, { ...opts, radiusOf: (i) => (i === 1 ? 3 : 1) });
    expect(f.collect(v(2, 1, 0), v(2, 1, 0))).toEqual([]);
    expect(f.collect(v(12.5, 1, 0), v(12.5, 1, 0))).toEqual([1]);
  });
});

describe('popScale', () => {
  it('goes from 0 to 1 with a small overshoot and stays at 1', () => {
    expect(popScale(0)).toBe(0);
    expect(popScale(1)).toBe(1);
    expect(popScale(5)).toBe(1);
    const mid = Array.from({ length: 19 }, (_, i) => popScale((i + 1) / 20));
    expect(Math.max(...mid)).toBeGreaterThan(1);
    expect(Math.max(...mid)).toBeLessThan(1.3);
  });
});
