import { describe, expect, it } from 'vitest';
import {
  SILLY,
  airTime,
  arcLaunch,
  bumperImpulse,
  bumperTopBounce,
  createTube,
  onBumperTop,
  stepTube,
  touchesBumper,
  whackTube,
} from '../../src/activities/silly/logic';

describe('bumper mushrooms', () => {
  it('always push away from the cap, sideways with the spin, and up', () => {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const rx = Math.cos(a) * 1.4;
      const rz = Math.sin(a) * 1.4;
      for (const spin of [1, -1]) {
        // Even when running straight into it.
        const v = bumperImpulse(rx, rz, spin, { x: -rx * 6, z: -rz * 6 });
        const out = (v.x * rx + v.z * rz) / 1.4;
        expect(out).toBeGreaterThan(5);
        expect(v.y).toBeGreaterThan(4);
        // Bounded: a soft boing, not a cannon.
        expect(Math.hypot(v.x, v.z)).toBeLessThan(12);
        // Tangential part follows the spin direction (CCW from above for +1: ω × r).
        const tx = rz / 1.4;
        const tz = -rx / 1.4;
        const side = v.x * tx + v.z * tz;
        expect(Math.sign(side)).toBe(spin);
        expect(Math.abs(side)).toBeGreaterThan(3);
      }
    }
  });

  it('opposite spins sweep the player opposite ways', () => {
    const a = bumperImpulse(1.5, 0, 1);
    const b = bumperImpulse(1.5, 0, -1);
    expect(a.x).toBeCloseTo(b.x);
    expect(a.z).toBeCloseTo(-b.z);
  });

  it('handles a dead-centre hit', () => {
    const v = bumperImpulse(0, 0, 1, { x: 3, z: 0 });
    expect(v.x).toBeLessThan(0);
    expect(Number.isFinite(v.z)).toBe(true);
  });

  it('bounces straight-ish up off the top', () => {
    const v = bumperTopBounce(0.3, 0.2, 1);
    expect(v.y).toBe(SILLY.bumper.topBounce);
    expect(Math.hypot(v.x, v.z)).toBeLessThan(4);
    expect(onBumperTop(0.4, SILLY.bumper.top, -3)).toBe(true);
    expect(onBumperTop(0.4, SILLY.bumper.top, 4)).toBe(false);
    expect(touchesBumper(1.5, 0, 0.35)).toBe(true);
    expect(touchesBumper(2.5, 0, 0.35)).toBe(false);
    expect(touchesBumper(1.5, SILLY.bumper.top, 0.35)).toBe(false);
  });
});

describe('see-saw launch', () => {
  it('flies the asked distance with the asked apex', () => {
    const g = 22;
    const v = arcLaunch(-1, 0, 7, 4.2, g);
    expect((v.y * v.y) / (2 * g)).toBeCloseTo(4.2);
    expect(-v.x * airTime(v.y, g)).toBeCloseTo(7);
    expect(v.z).toBeCloseTo(0);
  });
});

describe('wobbly tube characters', () => {
  it('flail but stay bounded and never fold over', () => {
    const s = createTube(0.3);
    let maxTip = 0;
    for (let t = 0; t < 30; t += 1 / 60) {
      const tip = stepTube(s, t, 1 / 60);
      maxTip = Math.max(maxTip, Math.hypot(tip.ax, tip.az));
      for (const a of [...s.ax, ...s.az]) expect(Math.abs(a)).toBeLessThanOrEqual(0.6);
    }
    expect(maxTip).toBeGreaterThan(0.1);
    expect(maxTip).toBeLessThan(2);
  });

  it('bend away from the player (push and whack)', () => {
    // Player pushes from −Z towards +Z: px = 0, pz = 1 → tube should lean towards +Z (ax > 0).
    const s = createTube(0);
    let sum = 0;
    for (let t = 0; t < 2; t += 1 / 60) {
      const tip = stepTube(s, t, 1 / 60, 1, 0, 1);
      if (t > 1) sum += tip.ax;
    }
    const still = createTube(0);
    let base = 0;
    for (let t = 0; t < 2; t += 1 / 60) {
      const tip = stepTube(still, t, 1 / 60);
      if (t > 1) base += tip.ax;
    }
    expect(sum).toBeGreaterThan(base + 10);
    // Pushing towards +X bends the top towards +X: az < 0 (positive az tilts towards −X).
    const x = createTube(0);
    whackTube(x, 1, 0, 3);
    stepTube(x, 0, 1 / 30, 1, 1, 0);
    expect(x.az.reduce((p, c) => p + c, 0)).toBeLessThan(0);
  });
});
