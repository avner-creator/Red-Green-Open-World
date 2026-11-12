import { describe, expect, it } from 'vitest';
import { bestRun, choosePark, clearRun, pointsAlong, ringPoints, type RideSpeed, type RunProbe } from '../../src/core/vehicles/parking';

/** A flat world with round posts (x, z, r) and an optional paved strip |z| < 4. */
function probe(posts: [number, number, number][], road = false): RunProbe {
  return {
    water: -10,
    height: () => 0,
    paved: road ? (_x, z) => Math.abs(z) < 4 : undefined,
    sweep(x, z, yaw, len) {
      const sx = Math.sin(yaw);
      const sz = Math.cos(yaw);
      for (let d = 0; d <= len; d += 0.25) {
        for (const [px, pz, r] of posts) if (Math.hypot(x + sx * d - px, z + sz * d - pz) < r + 1) return d;
      }
      return len;
    },
  };
}

const SP: RideSpeed = { road: 15, off: 10, launch: 20, launchTime: 2 };

describe('parking by measurement', () => {
  it('a run stops at the first post, water or cliff', () => {
    expect(clearRun(probe([[0, 30, 1]]), 0, 0, 0)).toBeCloseTo(28, 0);
    expect(clearRun(probe([]), 0, 0, 0)).toBe(130);
    const cliff: RunProbe = { ...probe([]), height: (_x, z) => (z > 40 ? 5 : 0) };
    expect(clearRun(cliff, 0, 0, 0)).toBeLessThanOrEqual(41);
    const lake: RunProbe = { ...probe([]), water: 1, height: (_x, z) => (z > 50 ? 0 : 2) };
    expect(clearRun(lake, 0, 0, 0)).toBeLessThanOrEqual(51);
  });

  it('picks the open heading, and the road among equally long ones', () => {
    // Posts all round except east (+x) and west (-x).
    const posts: [number, number, number][] = [];
    for (let a = 0; a < 360; a += 10) {
      if (Math.abs(a - 90) < 25 || Math.abs(a - 270) < 25) continue;
      const r = (a * Math.PI) / 180;
      posts.push([Math.sin(r) * 15, Math.cos(r) * 15, 1]);
    }
    const r = bestRun(probe(posts), 0, 0, SP, 0);
    expect(Math.abs(Math.sin(r.yaw))).toBeGreaterThan(0.9);
    expect(r.run).toBeGreaterThan(100);
    // With a road along x, a heading along it wins over a slanted one of equal time.
    const road = bestRun(probe([], true), 0, 0, SP, 0.6, 8, 60);
    expect(road.paved).toBeGreaterThanOrEqual(60);
  });

  it('moves the spot along the road when home has no long run', () => {
    // Home boxed in by a ring of posts; open road further east.
    const posts: [number, number, number][] = [];
    for (let a = 0; a < 360; a += 8) posts.push([Math.sin((a * Math.PI) / 180) * 10, Math.cos((a * Math.PI) / 180) * 10, 1]);
    const p = probe(posts, true);
    const cands = [{ x: 0, z: 0 }, ...pointsAlong([[[0, 0], [80, 0]]], 0, 0, 80, 5)];
    const pose = choosePark(p, cands, SP, 8, 0, () => true, 60);
    expect(Math.hypot(pose.x, pose.z)).toBeGreaterThan(10);
    expect(pose.time).toBeGreaterThanOrEqual(8);
  });

  it('candidate helpers: nearest first', () => {
    const r = ringPoints(5, 5, 6, 3);
    expect(r[0]).toEqual({ x: 5, z: 5 });
    const a = pointsAlong([[[0, 0], [20, 0]]], 20, 0, 12, 5);
    expect(a[0]).toEqual({ x: 20, z: 0 });
    expect(a.every((q) => q.x >= 8)).toBe(true);
  });
});
