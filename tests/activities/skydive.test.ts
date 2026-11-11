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
  leashSteer,
  leashWeight,
  stepFreefall,
  terminalFor,
  updateAssist,
  freefallAssistSteer,
  nextBelow,
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
    // 70 m up, the rings 57 m away behind-right: a nudge on the stick, then hands-off.
    const pos: V3 = { x: 0, y: 70, z: 0 };
    const vel: V3 = { x: 0, y: -5, z: 9 };
    const st: CanopyState = { yaw: 0, turn: 0 };
    stepCanopy(pos, vel, st, { x: 1, z: 0 }, null, pos.y, DT);
    expect(st.turn).toBeCloseTo(SKY.canopyTurn, 6);
    for (let i = 0; i < 60 * 30 && pos.y > 0; i++) stepCanopy(pos, vel, st, { x: 0, z: 0 }, { x: 40, z: -40 }, pos.y, DT);
    expect(Math.hypot(pos.x - 40, pos.z + 40)).toBeLessThan(SKY.rings[2]);
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

  it('a hands-off jump from the normal jump point lands inside the outer ring', () => {
    const h = (x: number, z: number): number => sampleHeight(terrain, x, z);
    const trail = buildGemSpots(h, terrain.roads)
      .filter((s) => s.tag === 'skydive')
      .sort((a, b) => b.y - a.y);
    const b = ANCHORS.balloon;
    const r = ANCHORS.landingRings;
    const rings = { x: r.x, y: h(r.x, r.z), z: r.z };
    // Same jump as the game: from above the first gem, hop towards the rings.
    const pos: V3 = { x: trail[0].x, y: h(b.x, b.z) + BALLOON.topHeight + 0.4, z: trail[0].z };
    const yaw0 = Math.atan2(r.x - pos.x, r.z - pos.z);
    const vel: V3 = { x: Math.sin(yaw0) * SKY.hopForward, y: SKY.hopUp, z: Math.cos(yaw0) * SKY.hopForward };
    const st: CanopyState = { yaw: yaw0, turn: 0 };
    let open = false;
    let fall = 0;
    let yaw = yaw0;
    let gems = 0;
    for (let i = 0; i < 60 * 90; i++) {
      const agl = pos.y - h(pos.x, pos.z);
      if (agl <= 0) break;
      if (!open && shouldOpenChute(agl, fall, false)) {
        open = true;
        st.yaw = yaw;
      }
      const before = chest(pos);
      if (open) {
        stepCanopy(pos, vel, st, { x: 0, z: 0 }, rings, agl, DT);
      } else {
        updateAssist(st, 0, DT);
        const target = nextBelow(trail, pos.y + PLAYER.height / 2) ?? rings;
        stepFreefall(pos, vel, freefallAssistSteer(pos, vel, target), DT);
        if (Math.hypot(vel.x, vel.z) > 3) yaw = Math.atan2(vel.x, vel.z);
        fall += DT;
      }
      const after = chest(pos);
      for (const g of trail) if (segmentSphereHit(before, after, g, GEMS.pickupRadius)) gems++;
    }
    const dist = Math.hypot(pos.x - r.x, pos.z - r.z);
    console.log(`hands-off landing ${dist.toFixed(2)} m from the centre, ${gems} gem hits`);
    expect(dist).toBeLessThanOrEqual(SKY.rings[2]);
  });
});

const chest = (p: V3): V3 => ({ x: p.x, y: p.y + PLAYER.height / 2, z: p.z });

describe('hands-off assist', () => {
  it('any stick input blends the assist out, and it returns after ~1 s hands-off', () => {
    const a = { assist: 1, idle: 0 };
    expect(updateAssist(a, 1, DT)).toBe(0);
    expect(updateAssist(a, 0, 0.5)).toBe(0);
    let w = 0;
    for (let t = 0; t < 2.5; t += DT) w = updateAssist(a, 0, DT);
    expect(w).toBeGreaterThan(0.9);
    expect(updateAssist({ assist: 1 }, 0.5, DT)).toBeCloseTo(0.5, 6);
  });

  it('full stick under canopy is full manual control near the rings', () => {
    const pos: V3 = { x: 0, y: 100, z: 0 };
    const vel: V3 = { x: 0, y: -5, z: 9 };
    const st: CanopyState = { yaw: 0, turn: 0 };
    stepCanopy(pos, vel, st, { x: 1, z: 0 }, { x: -SKY.leashStart + 2, z: 0 }, 100, DT);
    expect(st.turn).toBeCloseTo(SKY.canopyTurn, 6);
  });

  it('the leash: far from the rings the canopy turns home even with the stick held away', () => {
    expect(leashWeight(SKY.leashStart - 1)).toBe(0);
    expect(leashWeight(SKY.leashFull)).toBeCloseTo(SKY.leashMax, 6);
    expect(leashWeight(SKY.bowl + 1)).toBe(1);
    // Hold "straight on" (away from rings at −X) for a minute: the canopy never gets far away.
    const pos: V3 = { x: 0, y: 300, z: 0 };
    const vel: V3 = { x: 0, y: -5, z: 9 };
    const st: CanopyState = { yaw: Math.PI / 2, turn: 0 };
    let maxD = 0;
    for (let t = 0; t < 60; t += DT) {
      stepCanopy(pos, vel, st, { x: Math.sin(st.yaw), z: Math.cos(st.yaw) }, { x: 0, z: 0 }, 300, DT);
      maxD = Math.max(maxD, Math.hypot(pos.x, pos.z));
    }
    expect(maxD).toBeLessThan(SKY.bowl + 25);
    // Freefall: the leashed stick points mostly home when far out.
    const s = leashSteer({ x: 100, y: 100, z: 0 }, { x: 1, z: 0 }, { x: 0, z: 0 });
    expect(s.x).toBeLessThan(0);
  });
});
