import { describe, expect, it } from 'vitest';
import { PLAYER } from '../../src/config';
import { FLIES } from '../../src/activities/glasses/glowflies/constants';
import { flyLocal, makePath, pathExtent, segmentPointDistance, Swarm, tierMix } from '../../src/activities/glasses/glowflies/logic';
import type { PatchShape } from '../../src/activities/glasses/glowflies/logic';
import { seededRng } from '../../src/activities/glasses/idle';

const patch: PatchShape = {
  radius: FLIES.patchRadius,
  avoid: [
    { x: -3, z: 4.5, r: FLIES.boardClear },
    { x: 2.7, z: 2.9, r: FLIES.jarClear },
  ],
};
// A bumpy fake ground, site frame = world frame shifted.
const ground = (x: number, z: number): number => 10 + Math.sin(x * 0.4) * 0.6 + Math.cos(z * 0.3) * 0.5;
const toWorld = (x: number, z: number): { x: number; z: number } => ({ x: x + 100, z: z - 50 });

function swarm(seed: number, count?: number): Swarm {
  return new Swarm({ rng: seededRng(seed), patch, toWorld, groundAt: ground, count });
}

describe('glow-fly paths', () => {
  it('stay inside the patch, clear of the board and jar, 0.8–2.2 m above the ground', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rng = seededRng(seed);
      for (const tier of [1, 2, 3] as const) {
        const p = makePath(rng, tier, patch);
        for (let t = 0; t < 120; t += 0.25) {
          const l = flyLocal(p, t);
          expect(Math.hypot(l.x, l.z)).toBeLessThanOrEqual(patch.radius + 1e-6);
          for (const o of patch.avoid) expect(Math.hypot(l.x - o.x, l.z - o.z)).toBeGreaterThanOrEqual(o.r - 1e-6);
          expect(l.h).toBeGreaterThanOrEqual(FLIES.minHeight);
          expect(l.h).toBeLessThanOrEqual(FLIES.maxHeight);
        }
      }
    }
  });

  it('are smooth (no jumps between frames) and faster for higher tiers', () => {
    const speeds = { 1: 0, 2: 0, 3: 0 };
    for (let seed = 1; seed <= 30; seed++) {
      for (const tier of [1, 2, 3] as const) {
        const p = makePath(seededRng(seed * 7 + tier), tier, patch);
        let prev = flyLocal(p, 0);
        let dist = 0;
        for (let t = 1 / 60; t < 20; t += 1 / 60) {
          const l = flyLocal(p, t);
          const step = Math.hypot(l.x - prev.x, l.z - prev.z, l.h - prev.h);
          expect(step).toBeLessThan(0.1);
          dist += step;
          prev = l;
        }
        speeds[tier] += dist / pathExtent(p);
      }
    }
    expect(speeds[2]).toBeGreaterThan(speeds[1]);
    expect(speeds[3]).toBeGreaterThan(speeds[2]);
  });

  it('a crowded patch still gets a path inside it', () => {
    const tight: PatchShape = { radius: 2, avoid: [{ x: 0, z: 0, r: 1.2 }] };
    const p = makePath(seededRng(3), 1, tight);
    for (let t = 0; t < 60; t += 0.5) expect(Math.hypot(flyLocal(p, t).x, flyLocal(p, t).z)).toBeLessThanOrEqual(2 + 1e-6);
  });
});

describe('catch test', () => {
  it('segment distance', () => {
    expect(segmentPointDistance({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 5, y: 1, z: 0 })).toBeCloseTo(1);
    expect(segmentPointDistance({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: -3, y: 0, z: 4 })).toBeCloseTo(5);
    expect(segmentPointDistance({ x: 1, y: 1, z: 1 }, { x: 1, y: 1, z: 1 }, { x: 1, y: 2, z: 1 })).toBeCloseTo(1);
  });

  it('a fast run straight through a fly catches it (swept), passing by does not', () => {
    const s = swarm(5);
    const f = s.flies[0];
    s.flies.forEach((o, i) => i !== 0 && (o.state = 'gone'));
    const p = s.position(f);
    // 30 m/s for one 1/60 s frame would skip a point test; the swept test catches it.
    expect(s.catchAlong({ x: p.x - 3, y: p.y, z: p.z }, { x: p.x - 2.5, y: p.y, z: p.z }).length).toBe(0);
    const caught = s.catchAlong({ x: p.x - 0.4, y: p.y + 0.3, z: p.z }, { x: p.x + 0.4, y: p.y + 0.3, z: p.z });
    expect(caught.map((c) => c.fly.slot)).toContain(0);
    expect(f.state).toBe('gone');
    // Gone flies cannot be caught twice.
    expect(s.catchAlong(p, p).map((c) => c.fly.slot)).not.toContain(0);
  });

  it('respects the catch radius', () => {
    const s = swarm(9);
    const p = s.position(s.flies[1]);
    const r = FLIES.catchRadius;
    s.flies.forEach((f, i) => i !== 1 && (f.state = 'gone'));
    expect(s.catchAlong({ x: p.x + r + 0.1, y: p.y, z: p.z }, { x: p.x + r + 0.1, y: p.y, z: p.z })).toEqual([]);
    expect(s.catchAlong({ x: p.x + r - 0.1, y: p.y, z: p.z }, { x: p.x + r - 0.1, y: p.y, z: p.z }).length).toBe(1);
  });

  it('every fly is above reach from the ground: catching one takes a jump', () => {
    expect(FLIES.minHeight).toBeGreaterThan(PLAYER.height / 2 + FLIES.catchRadius);
    const apex = (PLAYER.jumpSpeed * PLAYER.jumpSpeed) / (2 * PLAYER.gravity);
    expect(FLIES.maxHeight).toBeLessThan(PLAYER.height / 2 + apex + FLIES.catchRadius - 0.1);
  });
});

describe('tier mix and rewards', () => {
  it("a booth round: every fly has the round's tier, also after a respawn", () => {
    for (const tier of [1, 2, 3] as const) {
      const s = new Swarm({ rng: seededRng(5), patch, toWorld, groundAt: ground, tier });
      expect(s.flies.length).toBe(FLIES.minCount);
      expect(s.flies.every((f) => f.tier === tier)).toBe(true);
      expect(s.nextTier()).toBe(tier);
    }
  });

  it('a few flies, every tier in the air without a round tier, deterministic per seed', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const s = swarm(seed);
      expect(s.flies.length).toBeGreaterThanOrEqual(FLIES.minCount);
      expect(s.flies.length).toBeLessThanOrEqual(FLIES.maxCount);
      expect(new Set(s.flies.map((f) => f.tier)).size).toBe(3);
      expect(swarm(seed).flies.map((f) => f.path)).toEqual(s.flies.map((f) => f.path));
    }
    expect(swarm(1).flies.map((f) => f.path.cx)).not.toEqual(swarm(2).flies.map((f) => f.path.cx));
    expect(tierMix(seededRng(4), 3).sort()).toEqual([1, 2, 3]);
  });

  it('fainter, faster flies are worth more and live shorter', () => {
    expect([FLIES.gems[1], FLIES.gems[2], FLIES.gems[3]]).toEqual([1, 2, 3]);
    expect(FLIES.life[1]).toBeGreaterThan(FLIES.life[2]);
    expect(FLIES.life[2]).toBeGreaterThan(FLIES.life[3]);
  });

  it('a respawned fly keeps the mix (the shortest tier comes back)', () => {
    const s = swarm(12, 6);
    s.flies.forEach((f, i) => (f.tier = i < 4 ? 1 : 2));
    const t3 = s.flies[5];
    s.catchAlong(s.position(t3), s.position(t3), 0.01);
    expect(t3.state).toBe('gone');
    expect(s.nextTier()).toBe(3);
  });
});

describe('life, fly-off and respawn', () => {
  it('a timed-out fly flies off as a miss only while the player is inside and came near it', () => {
    const s = swarm(21, 5);
    for (const f of s.flies) f.age = f.life - 0.01;
    const outside = s.update(0.05, false);
    expect(outside).toEqual([]);
    expect(s.flies.every((f) => f.state === 'alive' && f.age < 1)).toBe(true);

    // Inside the patch but never near: they fly off quietly (no miss).
    for (const f of s.flies) f.age = f.life - 0.01;
    expect(s.update(0.05, true, { x: 1e4, y: 0, z: 1e4 })).toEqual([]);
    expect(s.flies.every((f) => f.state === 'leaving')).toBe(true);
    s.reset();
    while (s.flies.length !== 5) s.reset();
    // The hero came near each one: when they fly off, each is a miss ("it got away").
    for (const f of s.flies) {
      const p = s.position(f);
      s.update(0, true, p);
      expect(f.near).toBe(true);
      f.age = f.life - 0.01;
    }
    const inside = s.update(0.05, true);
    expect(inside.filter((e) => e.type === 'miss').map((e) => e.tier)).toEqual(s.flies.map((f) => f.tier));
    expect(s.flies.every((f) => f.state === 'leaving')).toBe(true);
    // Leaving flies rise, then are gone; no second miss.
    const y0 = s.position(s.flies[0]).y;
    expect(s.update(FLIES.leaveSeconds / 2, true)).toEqual([]);
    expect(s.position(s.flies[0]).y).toBeGreaterThan(y0);
    s.update(FLIES.leaveSeconds, true);
    expect(s.flies.every((f) => f.state === 'gone')).toBe(true);
  });

  it('a caught fly respawns somewhere else after 15–20 s', () => {
    const s = swarm(33, 5);
    const f = s.flies[2];
    const before = { ...f.path };
    s.catchAlong(s.position(f), s.position(f), 0.01);
    expect(f.timer).toBeGreaterThanOrEqual(FLIES.respawnMin);
    expect(f.timer).toBeLessThanOrEqual(FLIES.respawnMax);
    let t = 0;
    let ev: ReturnType<Swarm['update']> = [];
    while (f.state === 'gone' && t < 30) {
      ev = s.update(0.5, true);
      t += 0.5;
    }
    expect(t).toBeGreaterThanOrEqual(FLIES.respawnMin);
    expect(t).toBeLessThanOrEqual(FLIES.respawnMax + 0.5);
    expect(ev).toContainEqual({ type: 'respawn', slot: 2, tier: f.tier });
    expect(f.state).toBe('alive');
    expect(f.path).not.toEqual(before);
  });
});
