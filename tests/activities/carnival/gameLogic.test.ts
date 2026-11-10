import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ASSIST_RADIUS, COLS, PRIZE_COUNT, ROWS, assistPick, pickPrizeSlots, slotXY } from '../../../src/activities/carnival/games/balloonLogic';
import { EYE, aimAt, aimDir, aimOnPlaneY, aimOnPlaneZ } from '../../../src/activities/carnival/games/common';
import { CATCH_R, DUCK_COUNT, POND, catchDucks, clampToPond, duckXZ } from '../../../src/activities/carnival/games/duckLogic';
import { CAPTURE, PEGS, capturePeg, chargePower, landingPoint, powerFor, throwDistance } from '../../../src/activities/carnival/games/ringLogic';
import { makeRng } from '../../../src/activities/carnival/rng';

describe('aim maths', () => {
  it('aimAt inverts aimDir', () => {
    const to = new THREE.Vector3(1.2, 2.4, -4);
    const a = aimAt(EYE, to);
    const d = aimDir(a.yaw, a.pitch);
    const want = to.clone().sub(EYE).normalize();
    expect(d.distanceTo(want)).toBeLessThan(1e-9);
  });

  it('positive yaw aims left (−X) when facing into the booth', () => {
    expect(aimDir(0.3, 0).x).toBeLessThan(0);
    expect(aimDir(0, 0).z).toBeCloseTo(-1);
  });

  it('plane hits land on the planes', () => {
    expect(aimOnPlaneZ(EYE, 0.1, 0.2, -4)?.z).toBeCloseTo(-4);
    expect(aimOnPlaneY(EYE, 0.1, -0.3, 0.5)?.y).toBeCloseTo(0.5);
    expect(aimOnPlaneY(EYE, 0, 0.3, 0.5)).toBeNull();
  });
});

describe('balloon pop', () => {
  it('spreads the prize balloons over the wall', () => {
    for (let seed = 1; seed < 30; seed++) {
      const s = pickPrizeSlots(makeRng(seed));
      expect(s).toHaveLength(PRIZE_COUNT);
      expect(new Set(s).size).toBe(PRIZE_COUNT);
      for (const i of s) expect(i).toBeLessThan(COLS * ROWS);
    }
  });

  it('aim assist picks the nearest balloon within reach only', () => {
    const c = [0, 1, 2].map((index) => ({ index, x: slotXY(index)[0], y: slotXY(index)[1] }));
    expect(assistPick(c[1].x + 0.3, c[1].y, c)?.index).toBe(1);
    expect(assistPick(c[1].x, c[1].y + ASSIST_RADIUS + 0.05, c)).toBeNull();
  });
});

describe('ring toss', () => {
  it('power ping-pongs 0 → 1 → 0', () => {
    expect(chargePower(0)).toBe(0);
    expect(chargePower(1.1)).toBeCloseTo(1);
    expect(chargePower(2.2)).toBeCloseTo(0);
    expect(chargePower(0.55)).toBeCloseTo(0.5);
  });

  it('every peg is reachable straight on with the right power', () => {
    for (const [i, p] of PEGS.entries()) {
      const dist = Math.hypot(p.x, 0.7 - p.z);
      const yaw = Math.atan2(-p.x, 0.7 - p.z);
      const power = powerFor(dist);
      expect(power).toBeGreaterThan(0);
      expect(power).toBeLessThan(1);
      expect(throwDistance(power)).toBeCloseTo(dist);
      const [x, z] = landingPoint(yaw, power);
      expect(capturePeg(x, z)).toBe(i);
    }
  });

  it('forgives a slightly short throw but not a wild one', () => {
    const p = PEGS[4];
    expect(capturePeg(p.x + CAPTURE * 0.8, p.z)).toBe(4);
    expect(capturePeg(p.x + 0.7, p.z - 0.6)).not.toBe(4);
  });
});

describe('duck pond', () => {
  it('ducks always swim inside the pond', () => {
    for (let i = 0; i < DUCK_COUNT; i++) {
      for (let t = 0; t < 30; t += 0.7) {
        const [x, z] = duckXZ(i, t);
        expect(Math.hypot(x - POND.x, z - POND.z)).toBeLessThan(POND.r - 0.2);
      }
    }
  });

  it('the net stays inside the rim', () => {
    const [x, z] = clampToPond(10, -2.4);
    expect(Math.hypot(x - POND.x, z - POND.z)).toBeLessThan(POND.r);
    expect(clampToPond(0.2, -2.2)).toEqual([0.2, -2.2]);
  });

  it('catches the nearest ducks in reach, at most two, skipping blocked ones', () => {
    const ducks = [
      { x: 0, z: 0, ok: true },
      { x: 0.1, z: 0, ok: true },
      { x: 0.2, z: 0, ok: true },
      { x: 0.05, z: 0, ok: false },
      { x: CATCH_R + 0.1, z: 0, ok: true },
    ];
    expect(catchDucks(0, 0, ducks)).toEqual([0, 1]);
    expect(catchDucks(0, 0, ducks, CATCH_R, 5)).toEqual([0, 1, 2]);
  });
});
