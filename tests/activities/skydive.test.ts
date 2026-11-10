import { beforeAll, describe, expect, it } from 'vitest';
import { BALLOON, GEMS, PLAYER } from '../../src/config';
import {
  SKY,
  ascentHeight,
  easeInOut,
  glideRatio,
  glideStars,
  ringStars,
  shouldOpenChute,
  stepCanopy,
  stepFreefall,
  terminalFor,
} from '../../src/activities/skydive/flight';
import type { CanopyState, V3 } from '../../src/activities/skydive/flight';
import { segmentSphereHit } from '../../src/activities/gemLogic';
import { buildTerrain, sampleHeight } from '../../src/world/terrain';
import type { TerrainData } from '../../src/world/terrain';
import { ANCHORS } from '../../src/world/layout';
import { buildGemSpots } from '../../src/world/spots';

const DT = 1 / 60;
/** Height a canopy U-turn costs, as glide metres (about one turn diameter). */
const TURN_ROOM = (2 * SKY.canopyGlide) / SKY.canopyTurn;

describe('balloon ascent', () => {
  it('eases in and out and reaches the top exactly on time', () => {
    expect(ascentHeight(0)).toBe(0);
    expect(ascentHeight(BALLOON.ascentSeconds)).toBeCloseTo(BALLOON.topHeight, 6);
    expect(ascentHeight(BALLOON.ascentSeconds * 2)).toBeCloseTo(BALLOON.topHeight, 6);
    expect(ascentHeight(BALLOON.ascentSeconds / 2)).toBeCloseTo(BALLOON.topHeight / 2, 6);
    // Gentle start and stop: the first and last 0.5 s move only a few metres.
    expect(ascentHeight(0.5)).toBeLessThan(1);
    expect(BALLOON.topHeight - ascentHeight(BALLOON.ascentSeconds - 0.5)).toBeLessThan(1);
    // Monotonic.
    let prev = -1;
    for (let t = 0; t <= 1.0001; t += 0.01) {
      const e = easeInOut(t);
      expect(e).toBeGreaterThanOrEqual(prev);
      prev = e;
    }
  });
});

describe('freefall', () => {
  it('reaches terminal speed ~38 m/s and never exceeds it', () => {
    const pos: V3 = { x: 0, y: 1000, z: 0 };
    const vel: V3 = { x: 0, y: 0, z: 0 };
    let max = 0;
    for (let i = 0; i < 60 * 12; i++) {
      stepFreefall(pos, vel, { x: 0, z: 0 }, DT);
      max = Math.max(max, -vel.y);
    }
    expect(-vel.y).toBeGreaterThan(SKY.terminal * 0.98);
    expect(max).toBeLessThanOrEqual(SKY.terminal + 1e-6);
    expect(SKY.terminal).toBeGreaterThan(35);
    expect(SKY.terminal).toBeLessThan(41);
  });

  it('steers horizontally at ~14 m/s and is stable at a coarse time step', () => {
    for (const dt of [DT, 1 / 20]) {
      const pos: V3 = { x: 0, y: 1000, z: 0 };
      const vel: V3 = { x: 0, y: -30, z: 0 };
      for (let t = 0; t < 4; t += dt) stepFreefall(pos, vel, { x: 1, z: 0 }, dt);
      expect(vel.x).toBeGreaterThan(13.5);
      expect(vel.x).toBeLessThanOrEqual(SKY.steerSpeed + 1e-6);
      expect(Number.isFinite(vel.y)).toBe(true);
      expect(-vel.y).toBeLessThanOrEqual(terminalFor(0) + 1e-6);
      expect(-vel.y).toBeGreaterThan(terminalFor(1) * 0.95);
    }
  });

  it('the chute auto-opens at the safe height and Space opens it after the lock-out', () => {
    expect(shouldOpenChute(BALLOON.autoChuteHeight, 0, false)).toBe(true);
    expect(shouldOpenChute(BALLOON.autoChuteHeight + 0.1, 5, false)).toBe(false);
    expect(shouldOpenChute(120, 0.1, true)).toBe(false);
    expect(shouldOpenChute(120, SKY.chuteLockout, true)).toBe(true);
  });

  it('a hands-off fall from the top opens before 40 m and lands slowly', () => {
    const pos: V3 = { x: 0, y: BALLOON.topHeight, z: 0 };
    const vel: V3 = { x: 0, y: SKY.hopUp, z: 0 };
    let fall = 0;
    while (!shouldOpenChute(pos.y, fall, false)) {
      stepFreefall(pos, vel, { x: 0, z: 0 }, DT);
      fall += DT;
    }
    expect(pos.y).toBeLessThanOrEqual(BALLOON.autoChuteHeight);
    expect(pos.y).toBeGreaterThan(BALLOON.autoChuteHeight - 1);
    expect(fall).toBeGreaterThan(4);
    expect(fall).toBeLessThan(9);
    const st: CanopyState = { yaw: 0, turn: 0 };
    let canopy = 0;
    while (pos.y > 0) {
      stepCanopy(pos, vel, st, { x: 0, z: 0 }, null, pos.y, DT);
      canopy += DT;
    }
    // Touchdown speed is the flare's, not a fall.
    expect(-vel.y).toBeLessThan(SKY.canopySink);
    expect(canopy).toBeGreaterThan(6);
  });
});

describe('canopy', () => {
  it('glides ~9 m/s at ~5 m/s sink (glide ratio 1.8)', () => {
    const pos: V3 = { x: 0, y: 500, z: 0 };
    const vel: V3 = { x: 0, y: -38, z: 0 };
    const st: CanopyState = { yaw: 0.5, turn: 0 };
    for (let i = 0; i < 60 * 5; i++) stepCanopy(pos, vel, st, { x: 0, z: 0 }, null, 400, DT);
    expect(Math.hypot(vel.x, vel.z)).toBeCloseTo(SKY.canopyGlide, 1);
    expect(-vel.y).toBeCloseTo(SKY.canopySink, 1);
    expect(glideRatio()).toBeCloseTo(1.8, 6);
  });

  it('the jolt brakes a 38 m/s fall to under 10 m/s within a second', () => {
    const pos: V3 = { x: 0, y: 500, z: 0 };
    const vel: V3 = { x: 0, y: -38, z: 0 };
    const st: CanopyState = { yaw: 0, turn: 0 };
    for (let i = 0; i < 60; i++) stepCanopy(pos, vel, st, { x: 0, z: 0 }, null, 400, DT);
    expect(-vel.y).toBeLessThan(10);
  });

  it('turns gently towards the stick and homes towards the rings hands-off', () => {
    const pos: V3 = { x: 0, y: 500, z: 0 };
    const vel: V3 = { x: 0, y: -5, z: 9 };
    const st: CanopyState = { yaw: 0, turn: 0 };
    stepCanopy(pos, vel, st, { x: 1, z: 0 }, null, 400, DT);
    expect(st.turn).toBeCloseTo(SKY.canopyTurn, 6);
    for (let i = 0; i < 60 * 30; i++) stepCanopy(pos, vel, st, { x: 0, z: 0 }, { x: 40, z: 40 }, 400, DT);
    expect(Math.hypot(pos.x - 40, pos.z - 40)).toBeLessThan(2 * SKY.canopyGlide / SKY.canopyAssistTurn);
  });
});

describe('scoring', () => {
  it('rings give 3/2/1/0 stars from the centre out', () => {
    expect(ringStars(0)).toBe(3);
    expect(ringStars(SKY.rings[0])).toBe(3);
    expect(ringStars(SKY.rings[0] + 0.1)).toBe(2);
    expect(ringStars(SKY.rings[1] + 0.1)).toBe(1);
    expect(ringStars(SKY.rings[2] + 0.1)).toBe(0);
  });
  it('long glides give stars by distance', () => {
    expect(glideStars(10)).toBe(0);
    expect(glideStars(SKY.glideStars[0])).toBe(1);
    expect(glideStars(SKY.glideStars[1])).toBe(2);
    expect(glideStars(1000)).toBe(3);
  });
});

describe('skydive gem trail', () => {
  let terrain: TerrainData;
  beforeAll(() => {
    terrain = buildTerrain();
  });

  it('an attentive pilot can collect every freefall gem of the trail from the jump point', () => {
    const h = (x: number, z: number): number => sampleHeight(terrain, x, z);
    const trail = buildGemSpots(h, terrain.roads)
      .filter((s) => s.tag === 'skydive')
      .sort((a, b) => b.y - a.y);
    expect(trail.length).toBeGreaterThan(3);
    const b = ANCHORS.balloon;
    // The balloon drifts to just above the first gem, so the jump starts right over it.
    const pos: V3 = { x: trail[0].x, y: h(b.x, b.z) + BALLOON.topHeight, z: trail[0].z };
    const vel: V3 = { x: 0, y: SKY.hopUp, z: 0 };
    const chest = (p: V3): V3 => ({ x: p.x, y: p.y + PLAYER.height / 2, z: p.z });
    const got = new Set<number>();
    const missed = new Set<number>();
    let fall = 0;
    let open = false;
    const st: CanopyState = { yaw: 0, turn: 0 };
    for (let i = 0; i < 60 * 60 && pos.y > h(pos.x, pos.z); i++) {
      const next = trail.findIndex((_, k) => !got.has(k));
      let steer = { x: 0, z: 0 };
      if (next >= 0) {
        const g = trail[next];
        const dx = g.x - pos.x;
        const dz = g.z - pos.z;
        const d = Math.hypot(dx, dz);
        const dy = chest(pos).y - g.y;
        const tReach = dy > 0 ? dy / Math.max(1, -vel.y) : 0.01;
        const want = Math.min(1, d / tReach / SKY.steerSpeed + 0.2);
        if (d > 0.05) steer = { x: (dx / d) * want, z: (dz / d) * want };
        // Under canopy and too high for a straight glide: circle down (like the hoop spiral).
        // Under canopy and too high for a straight glide in: fly out, then turn back (S-turn).
        if (open && d > 0.05) {
          const away = dy * glideRatio() > d + TURN_ROOM;
          steer = away ? { x: -dx / d, z: -dz / d } : { x: dx / d, z: dz / d };
        }
        if (dy < -3) {
          got.add(next); // missed: aim for the next one
          missed.add(next);
        }
      }
      const before = chest(pos);
      const agl = pos.y - h(pos.x, pos.z);
      if (!open && shouldOpenChute(agl, fall, false)) open = true;
      if (open) stepCanopy(pos, vel, st, steer, null, agl, DT);
      else stepFreefall(pos, vel, steer, DT);
      fall += DT;
      const after = chest(pos);
      trail.forEach((g, k) => {
        if (!got.has(k) && segmentSphereHit(before, after, g, GEMS.pickupRadius)) got.add(k);
      });
    }
    // Every freefall gem (above the auto-open height) is reachable. The last trail gem hangs over
    // the ring centre below the opening height: reachable only with S-turns under canopy.
    const freefall = (k: number): boolean => trail[k].y - h(trail[k].x, trail[k].z) > BALLOON.autoChuteHeight;
    expect([...missed].filter(freefall).map((k) => trail[k])).toEqual([]);
    expect(trail.filter((_, k) => freefall(k)).length).toBeGreaterThanOrEqual(6);
  });
});
