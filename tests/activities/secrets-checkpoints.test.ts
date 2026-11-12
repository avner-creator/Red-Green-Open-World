/**
 * QA r7 m10: secret paths for 8-year-olds: a wider rest stone every 6 stones, a miss past one puts
 * the hero back on it, path coyote time, slightly larger stones.
 */
import { describe, expect, it } from 'vitest';
import { CHECKPOINT, PathProgress, STONE, checkPath, checkpointIndices, withCheckpoints } from '../../src/activities/secrets/pathLogic';
import type { Stone } from '../../src/activities/secrets/pathLogic';
import { buildRoutes } from '../../src/activities/secrets/routes';
import { buildTerrain, sampleHeight } from '../../src/world/terrain';

/** A straight climbing path of n stones, 2.3 m apart, 0.7 m up each. */
const line = (n: number): Stone[] => Array.from({ length: n }, (_, i) => ({ x: i * 2.3, y: 1 + i * 0.7, z: 0, r: STONE.radius }));
const feetOn = (s: Stone): { x: number; y: number; z: number } => ({ x: s.x, y: s.y, z: s.z });
const dt = 1 / 60;

describe('rest stones', () => {
  it('every 6th stone, never the first or the last two; wider than the others', () => {
    expect(checkpointIndices(17)).toEqual([6, 12]);
    expect(checkpointIndices(26)).toEqual([6, 12, 18]);
    expect(checkpointIndices(8)).toEqual([]);
    const st = withCheckpoints(line(20));
    expect(st[6].r).toBe(CHECKPOINT.radius);
    expect(st[5].r).toBe(STONE.radius);
    expect(STONE.radius).toBeGreaterThan(0.8);
    expect(checkPath(st).ok).toBe(true);
  });

  it('every real path has a rest stone at most 6 stones from any stone past the first', () => {
    const t = buildTerrain();
    for (const r of buildRoutes((x, z) => sampleHeight(t, x, z))) {
      const cps = checkpointIndices(r.stones.length);
      expect(cps.length, r.id).toBeGreaterThanOrEqual(2);
      for (const i of cps) expect(r.stones[i].r, `${r.id} ${i}`).toBe(CHECKPOINT.radius);
      expect(checkPath(r.stones).ok, r.id).toBe(true);
    }
  });
});

describe('a miss goes back to the last rest stone', () => {
  it('missing a hop past rest stone 6 returns there; earlier misses do not', () => {
    const st = withCheckpoints(line(20));
    const p = new PathProgress(st);
    // Hop up stones 0..4, then fall: no rest stone reached yet → no return (the start is near).
    for (let i = 0; i <= 4; i++) expect(p.update(dt, i, feetOn(st[i]))).toBe(-1);
    expect(p.update(dt, -1, { x: st[4].x + 1, y: st[4].y - 3, z: 0 })).toBe(-1);
    // Up to stone 8 (past rest stone 6), then a miss.
    for (let i = 0; i <= 8; i++) p.update(dt, i, feetOn(st[i]));
    expect(p.checkpoint).toBe(6);
    expect(p.update(dt, -1, { x: st[8].x + 1, y: st[8].y - 1, z: 0 })).toBe(-1); // still in the air, a normal drop
    expect(p.update(dt, -1, { x: st[8].x + 1, y: st[8].y - CHECKPOINT.fallBelow - 0.1, z: 0 })).toBe(6);
    // Only once per miss.
    expect(p.update(dt, -1, { x: st[8].x + 1, y: st[8].y - 5, z: 0 })).toBe(-1);
  });

  it('jumping off the rest stone itself is a way off (no trap); so is R or a ride far away', () => {
    const st = withCheckpoints(line(20));
    const p = new PathProgress(st);
    for (let i = 0; i <= 6; i++) p.update(dt, i, feetOn(st[i]));
    expect(p.update(dt, -1, { x: st[6].x, y: st[6].y - 4, z: 2 })).toBe(-1);
    for (let i = 6; i <= 9; i++) p.update(dt, i, feetOn(st[i]));
    // R: the hero is suddenly far away and low.
    expect(p.update(dt, -1, { x: 200, y: -10, z: 0 })).toBe(-1);
    // Reaching the pedestal (leave) and dropping off it: no return.
    p.update(dt, 9, feetOn(st[9]));
    p.leave();
    expect(p.update(dt, -1, { x: st[9].x, y: st[9].y - 5, z: 0 })).toBe(-1);
  });

  it('a new session forgets the rest stones', () => {
    const st = withCheckpoints(line(20));
    const p = new PathProgress(st);
    for (let i = 0; i <= 13; i++) p.update(dt, i, feetOn(st[i]));
    expect(p.checkpoint).toBe(12);
    p.reset();
    expect(p.checkpoint).toBe(-1);
  });
});

describe('path coyote time', () => {
  it('a Jump just after walking off an edge still jumps, once; not when already rising or too late', () => {
    const st = line(10);
    const p = new PathProgress(st);
    p.update(dt, 3, feetOn(st[3]));
    p.update(0.15, -1, { x: st[3].x + 1, y: st[3].y - 0.1, z: 0 });
    expect(p.coyote(-1)).toBe(true);
    expect(p.coyote(-1)).toBe(false);
    p.update(dt, 4, feetOn(st[4]));
    p.update(0.1, -1, feetOn(st[4]));
    expect(p.coyote(7.8)).toBe(false); // a real jump is already going up
    p.update(dt, 4, feetOn(st[4]));
    p.update(CHECKPOINT.coyote + 0.05, -1, { x: st[4].x + 1, y: st[4].y - 0.5, z: 0 });
    expect(p.coyote(-3)).toBe(false);
  });
});
