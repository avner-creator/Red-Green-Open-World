import { describe, expect, it } from 'vitest';
import { horseZones, keepOut, zoneEdge } from '../../src/core/vehicles/keepout';
import { slideSteer, slideToward } from '../../src/core/slide-around';

describe('horse keep-out zones (QA8 m11)', () => {
  const zone = { x: 0, z: 0, hx: 5, hz: 10 };

  it('the Foam Lava course pad is a zone', () => {
    const z = horseZones();
    expect(z.length).toBe(1);
    expect(z[0].hx).toBeGreaterThan(7);
  });

  it('edge distance and outward normal', () => {
    expect(zoneEdge(zone, 8, 0)).toEqual({ d: 3, nx: 1, nz: 0 });
    const inside = zoneEdge(zone, 0, 9);
    expect(inside.d).toBeCloseTo(-1);
    expect(inside.nz).toBe(1);
  });

  it('a horse heading straight in is turned along the edge and its inward move dropped', () => {
    // At x = 6 heading west (yaw −π/2), moving 0.2 m west.
    const r = keepOut([zone], 6, 0, -Math.PI / 2, -0.2, 0, 1.8);
    expect(r.yaw).not.toBeNull();
    expect(r.mx).toBeCloseTo(0);
    // The new heading runs along the edge (mostly ±z) and leans outward (+x).
    expect(Math.abs(Math.cos(r.yaw!))).toBeGreaterThan(0.9);
    expect(Math.sin(r.yaw!)).toBeGreaterThan(0);
    // Forced the other way round.
    const flip = keepOut([zone], 6, 0, -Math.PI / 2, -0.2, 0, 1.8, -r.side);
    expect(Math.sign(Math.cos(flip.yaw!))).toBe(-Math.sign(Math.cos(r.yaw!)));
  });

  it('heading away, far away or deep inside: no say', () => {
    expect(keepOut([zone], 6, 0, Math.PI / 2, 0.2, 0, 1.8).yaw).toBeNull();
    expect(keepOut([zone], 12, 0, -Math.PI / 2, -0.2, 0, 1.8).yaw).toBeNull();
    expect(keepOut([zone], 0, 0, -Math.PI / 2, -0.2, 0, 1.8).yaw).toBeNull();
  });
});

describe('slide-around walls (QA8 m1)', () => {
  // A wall facing +x (outward normal +x), sliding toward +z (the front).
  const e = { nx: 1, nz: 0, ...slideToward(0, -1, 0, 1) };

  it('picks the sense toward the front', () => {
    expect(e.tz).toBe(1);
  });

  it('turns a head-on push along the wall, keeping its strength', () => {
    const s = slideSteer({ x: -0.8, z: 0 }, e)!;
    expect(s).not.toBeNull();
    expect(Math.hypot(s.x, s.z)).toBeCloseTo(0.8);
    expect(s.z).toBeGreaterThan(0.7);
    expect(s.x).toBeLessThan(0); // still leaning into the wall a little
  });

  it('leaves a push away from or along the wall alone', () => {
    expect(slideSteer({ x: 1, z: 0 }, e)).toBeNull();
    expect(slideSteer({ x: -0.1, z: 1 }, e)).toBeNull();
    expect(slideSteer({ x: 0, z: 0 }, e)).toBeNull();
  });
});
