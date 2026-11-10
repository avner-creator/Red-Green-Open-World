import { describe, expect, it } from 'vitest';
import { sniffHeading, sniffSpot } from '../../src/buddy/sniff';
import { FOLLOW, arrive, catchUpSpeed, followSlot, forward, generalWay, keepClear, right, shouldTeleport, turnTowards } from '../../src/buddy/steer';
import type { V2 } from '../../src/buddy/steer';
import { placeBubble } from '../../src/ui/buddy/place';

describe('follow steering', () => {
  it('forward/right match three.js yaw (0 faces +Z, right is -X)', () => {
    expect(forward(0).z).toBeCloseTo(1);
    expect(right(0).x).toBeCloseTo(-1);
    expect(forward(Math.PI / 2).x).toBeCloseTo(1);
  });

  it('the slot is beside the hero, ahead while walking, level when stopped', () => {
    const hero = { x: 0, z: 0 };
    const still = followSlot(hero, 0, 0, 1);
    const walk = followSlot(hero, 0, 6, 1);
    expect(still.x).toBeLessThan(-0.8); // right side of a +Z-facing hero
    expect(Math.abs(still.z)).toBeLessThan(0.5);
    expect(walk.z).toBeGreaterThan(1); // runs ahead a little
    expect(followSlot(hero, 0, 0, -1).x).toBeGreaterThan(0.8);
  });

  it('arrive accelerates within limits, slows near the target and stops', () => {
    let pos: V2 = { x: 0, z: 0 };
    let vel: V2 = { x: 0, z: 0 };
    const target = { x: 10, z: 0 };
    const dt = 1 / 60;
    vel = arrive(pos, vel, target, dt, 6);
    expect(Math.hypot(vel.x, vel.z)).toBeLessThanOrEqual(FOLLOW.accel * dt + 1e-9);
    for (let i = 0; i < 600; i++) {
      vel = arrive(pos, vel, target, dt, 6);
      pos = { x: pos.x + vel.x * dt, z: pos.z + vel.z * dt };
    }
    expect(Math.hypot(pos.x - 10, pos.z)).toBeLessThan(0.35);
    expect(Math.hypot(vel.x, vel.z)).toBeLessThan(0.5);
  });

  it('keeps up with a sprinting hero: a 30 m walk ends within 6 m', () => {
    let pip: V2 = { x: 1, z: 0 };
    let vel: V2 = { x: 0, z: 0 };
    const dt = 1 / 60;
    let maxGap = 0;
    for (let i = 0; i < 300; i++) {
      const hero = { x: 0, z: Math.min(30, i * dt * 11) };
      const hs = hero.z < 30 ? 11 : 0;
      const slot = followSlot(hero, 0, hs, 1);
      vel = arrive(pip, vel, slot, dt, catchUpSpeed(Math.hypot(slot.x - pip.x, slot.z - pip.z), hs));
      pip = keepClear({ x: pip.x + vel.x * dt, z: pip.z + vel.z * dt }, hero, FOLLOW.personal);
      maxGap = Math.max(maxGap, Math.hypot(pip.x - hero.x, pip.z - hero.z));
    }
    expect(maxGap).toBeLessThan(6);
  });

  it('keepClear pushes out of the hero circle; teleport past 25 m', () => {
    const p = keepClear({ x: 0.1, z: 0 }, { x: 0, z: 0 }, 0.75);
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(0.75);
    expect(shouldTeleport({ x: 26, z: 0 }, { x: 0, z: 0 })).toBe(true);
    expect(shouldTeleport({ x: 20, z: 0 }, { x: 0, z: 0 })).toBe(false);
  });

  it('turnTowards takes the short way and is rate limited', () => {
    const y = turnTowards(3, -3, 1, 0.1);
    expect(y).toBeGreaterThan(3); // wraps through PI
    expect(y - 3).toBeCloseTo(0.1);
  });

  it('the intro "general way" is snapped to 8 sectors and stops short of the spot', () => {
    const hero = { x: 0, z: 0 };
    const spot = { x: 3, z: 10 };
    const w = generalWay(hero, spot, 6);
    expect(Math.hypot(w.x, w.z)).toBeCloseTo(6);
    const ang = Math.atan2(w.x, w.z) / (Math.PI / 4);
    expect(Math.abs(ang - Math.round(ang))).toBeLessThan(1e-9);
  });
});

describe('sniffing never points at a gem', () => {
  it('takes no gem data at all (by construction)', () => {
    expect(sniffHeading.length).toBe(2); // (t, seed)
    expect(sniffSpot.length).toBe(3); // (hero, t, seed)
  });

  it('heading is uncorrelated with random gem directions', () => {
    // Pseudo-random gem directions around the hero; the sniff heading over time.
    let s = 1;
    const rnd = (): number => ((s = (s * 16807) % 2147483647) / 2147483647);
    let c = 0;
    let n = 0;
    for (let i = 0; i < 4000; i++) {
      const t = i * 0.05;
      const gemAngle = rnd() * Math.PI * 2;
      const h = sniffHeading(t, 1.3);
      c += Math.cos(h - gemAngle);
      n++;
    }
    // Mean resultant of the angle difference ~ 0 (|r| would be 1 if Pip pointed at the gem).
    expect(Math.abs(c / n)).toBeLessThan(0.05);
  });

  it('stays on a loop around the hero', () => {
    for (let t = 0; t < 30; t += 0.37) {
      const p = sniffSpot({ x: 5, z: -2 }, t, 1.3);
      const d = Math.hypot(p.x - 5, p.z + 2);
      expect(d).toBeGreaterThan(1.1);
      expect(d).toBeLessThan(2.4);
    }
  });
});

describe('bubble placement', () => {
  const bounds = { x: 10, y: 50, w: 620, h: 300 };
  it('sits above the anchor, clamped into the safe area', () => {
    const p = placeBubble({ x: 320, y: 250 }, 200, 60, bounds, null, 16);
    expect(p.y + 60).toBeLessThanOrEqual(250);
    expect(p.below).toBe(false);
    const edge = placeBubble({ x: 5, y: 250 }, 200, 60, bounds, null, 16);
    expect(edge.x).toBe(10);
  });

  it('moves off the hero', () => {
    const hero = { x: 280, y: 120, w: 80, h: 200 };
    const p = placeBubble({ x: 330, y: 260 }, 200, 60, bounds, hero, 16);
    const overlap = p.x < hero.x + hero.w && p.x + 200 > hero.x && p.y < hero.y + hero.h && p.y + 60 > hero.y;
    expect(overlap).toBe(false);
  });
});
