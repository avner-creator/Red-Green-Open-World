/**
 * QA r7 m10: secret paths for 8-year-olds: a wider rest stone every 6 stones, a miss past one puts
 * the hero back on it, path coyote time, slightly larger stones.
 */
import { describe, expect, it } from 'vitest';
import { CHECKPOINT, PathProgress, STONE, checkPath, checkpointIndices, edgeGap, withCheckpoints } from '../../src/activities/secrets/pathLogic';
import { PLAYER } from '../../src/config';
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

describe('spiral paths (QA8 m4)', () => {
  it('a miss that lands on a lower stone below the rest stone boings back onto the rest stone', () => {
    const st = withCheckpoints(line(20));
    const p = new PathProgress(st);
    for (let i = 0; i <= 14; i++) p.update(dt, i, feetOn(st[i]));
    expect(p.checkpoint).toBe(12);
    // The miss from 14 lands on stone 5 of the turn below: back to rest stone 12.
    expect(p.update(dt, -1, { x: st[13].x, y: st[13].y, z: 0 })).toBe(-1);
    expect(p.update(dt, 5, feetOn(st[5]))).toBe(12);
    expect(p.lastOn).toBe(12);
    // Landing on a lower stone still at or above the rest stone keeps that stone (no boing).
    for (let i = 12; i <= 15; i++) p.update(dt, i, feetOn(st[i]));
    expect(p.update(dt, 13, feetOn(st[13]))).toBe(-1);
    // Walking back down from the rest stone itself is a way off: no boing.
    p.update(dt, 12, feetOn(st[12]));
    expect(p.update(dt, 11, feetOn(st[11]))).toBe(-1);
    expect(p.update(dt, 7, feetOn(st[7]))).toBe(-1);
  });

  it('a patient hopper who misses once in every section (landing a turn lower) still finishes every real path', () => {
    const t = buildTerrain();
    for (const r of buildRoutes((x, z) => sampleHeight(t, x, z))) {
      const p = new PathProgress(r.stones);
      const missed = new Set<number>();
      let at = 0;
      let jumps = 0;
      p.update(dt, 0, feetOn(r.stones[0]));
      while (at < r.stones.length - 1 && jumps < 120) {
        jumps++;
        // Two hops past each rest stone (and near the top) the hopper misses once and lands on
        // the turn below (8 stones lower): that used to undo the rest stone (QA8 m4).
        const key = p.checkpoint;
        if (p.checkpoint >= 0 && at === p.checkpoint + 2 && !missed.has(key)) {
          missed.add(key);
          const low = Math.max(0, at - 8);
          const back = p.update(dt, low, feetOn(r.stones[low]));
          at = back >= 0 ? back : low;
        } else {
          at++;
          p.update(dt, at, feetOn(r.stones[at]));
        }
      }
      expect(at, r.id + ' reached in ' + jumps + ' jumps').toBe(r.stones.length - 1);
      expect(missed.size, r.id).toBeGreaterThanOrEqual(2);
      // Each miss costs only the hop that missed and the two hops back up from the rest stone.
      expect(jumps, r.id).toBeLessThanOrEqual(r.stones.length - 1 + 3 * missed.size);
    }
  });

  it('the hardest hop on every path is makeable with a plain walking jump', () => {
    const t = buildTerrain();
    const g = PLAYER.gravity;
    const v = PLAYER.jumpSpeed;
    for (const r of buildRoutes((x, z) => sampleHeight(t, x, z))) {
      let worst = Infinity;
      let worstAt = -1;
      for (let i = 0; i + 1 < r.stones.length; i++) {
        const a = r.stones[i];
        const b = r.stones[i + 1];
        const rise = b.y - a.y;
        // Air time until the feet come back down to the next stone's top (a little landing margin).
        const disc = v * v - 2 * g * (rise + 0.1);
        expect(disc, `${r.id} hop ${i}: rise ${rise.toFixed(2)} m`).toBeGreaterThan(0);
        const tAir = (v + Math.sqrt(disc)) / g;
        // Take off from the stone's edge (coyote time covers a late press), land 0.3 m inside.
        const need = edgeGap(a, b) + 0.3;
        const reach = PLAYER.walkSpeed * tAir;
        const spare = reach - need;
        if (spare < worst) {
          worst = spare;
          worstAt = i;
        }
      }
      expect(worst, `${r.id}: hardest hop ${worstAt}`).toBeGreaterThan(1);
    }
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
