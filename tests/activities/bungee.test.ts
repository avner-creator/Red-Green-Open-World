import { describe, expect, it } from 'vitest';
import {
  BODY_HALF,
  CORD,
  depthStars,
  diveVelocity,
  hangTilt,
  hermite,
  planCord,
  plannedClearance,
  pumpPower,
  stepCord,
  unwrapNear,
} from '../../src/activities/bungee/cord';
import type { CordState, V3 } from '../../src/activities/bungee/cord';

const DECK = 33.5;
const ANCHOR: V3 = { x: -9.35, y: DECK + 4.4, z: -106 };
const START: V3 = { x: ANCHOR.x + 1.1, y: DECK + BODY_HALF, z: ANCHOR.z };

/** Deterministic pseudo-random numbers (no Math.random in tests). */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Run {
  minHead: number;
  guarded: number;
  peaks: number[];
  bottoms: number;
}

function simulate(power: number, groundAt: (x: number, z: number) => number, steer: (t: number) => { x: number; z: number }, seconds = 16): Run {
  const vel = diveVelocity(-Math.PI / 2, power);
  let plannedGround = -Infinity;
  for (let dx = -10; dx <= 2; dx++) for (let dz = -6; dz <= 6; dz++) plannedGround = Math.max(plannedGround, groundAt(ANCHOR.x + dx, ANCHOR.z + dz));
  const plan = planCord(ANCHOR, START, vel, plannedGround, plannedClearance(power));
  const s: CordState = { pos: { ...START }, vel: { ...vel } };
  let minHead = Infinity;
  let guarded = 0;
  const peaks: number[] = [];
  let bottoms = 0;
  let prevVy = s.vel.y;
  for (let t = 0; t < seconds; t += 1 / 60) {
    const r = stepCord(s, ANCHOR, plan, steer(t), groundAt, 1 / 60);
    if (r.guarded) guarded++;
    minHead = Math.min(minHead, s.pos.y - BODY_HALF - groundAt(s.pos.x, s.pos.z));
    if (prevVy > 0 && s.vel.y <= 0 && t > 0.5) peaks.push(s.pos.y - BODY_HALF);
    if (prevVy < 0 && s.vel.y >= 0) bottoms++;
    prevVy = s.vel.y;
  }
  return { minHead, guarded, peaks, bottoms };
}

describe('bungee cord maths', () => {
  it('never lets the player below ground + 2 m, for any dive and ground height (no steering)', () => {
    for (const ground of [-2, 0, 1.6, 5, 10, 16]) {
      for (const power of [0, 0.25, 0.5, 0.75, 1]) {
        const r = simulate(power, () => ground, () => ({ x: 0, z: 0 }));
        expect(r.minHead).toBeGreaterThanOrEqual(CORD.minClearance);
        // The plan alone does it: the hard guard is never needed.
        expect(r.guarded).toBe(0);
      }
    }
  });

  it('never goes below ground + 2 m with wild steering over bumpy ground', () => {
    const rand = rng(7);
    for (let trial = 0; trial < 25; trial++) {
      const base = rand() * 8;
      const bump = (x: number, z: number): number => base + 1.5 * Math.sin(x * 0.7) * Math.cos(z * 0.5) + (Math.abs(z - ANCHOR.z) > 4 ? 3 : 0);
      const turns = [rand(), rand(), rand(), rand()];
      const r = simulate(
        rand(),
        bump,
        (t) => ({ x: Math.sin(t * (1 + turns[0] * 3) + turns[1] * 6), z: Math.cos(t * (1 + turns[2] * 3) + turns[3] * 6) }),
      );
      expect(r.minHead).toBeGreaterThanOrEqual(CORD.minClearance - 1e-9);
    }
  });

  it('gives 2–3 big boings and the first rebound comes nearly back to the deck', () => {
    const r = simulate(0.55, () => 1.6, () => ({ x: 0, z: 0 }), 12);
    expect(r.bottoms).toBeGreaterThanOrEqual(3);
    expect(r.peaks.length).toBeGreaterThanOrEqual(2);
    // First rebound within 4 m of the deck, but not above it.
    expect(r.peaks[0]).toBeGreaterThan(DECK - 4);
    expect(r.peaks[0]).toBeLessThan(DECK);
    // Each boing smaller than the last.
    expect(r.peaks[1]).toBeLessThan(r.peaks[0]);
  });

  it('a better dive goes deeper (more stars)', () => {
    const weak = simulate(0, () => 1.6, () => ({ x: 0, z: 0 }), 4);
    const strong = simulate(1, () => 1.6, () => ({ x: 0, z: 0 }), 4);
    expect(strong.minHead).toBeLessThan(weak.minHead - 3);
    const maxDepth = DECK - 1.6 - CORD.minClearance;
    const starsWeak = depthStars(DECK - 1.6 - weak.minHead, maxDepth);
    const starsStrong = depthStars(DECK - 1.6 - strong.minHead, maxDepth);
    expect(starsWeak).toBeGreaterThanOrEqual(1);
    expect(starsStrong).toBe(3);
    expect(starsStrong).toBeGreaterThan(starsWeak);
  });

  it('the cord only pulls (a slack cord leaves free fall alone)', () => {
    const plan = planCord(ANCHOR, START, { x: 0, y: 0, z: 0 }, 1.6, 5);
    const s: CordState = { pos: { x: ANCHOR.x, y: ANCHOR.y - 2, z: ANCHOR.z }, vel: { x: 0, y: 0, z: 0 } };
    stepCord(s, ANCHOR, plan, { x: 0, z: 0 }, () => 1.6, 0.1);
    // Pure gravity (tiny drag): v ≈ −g·t.
    expect(s.vel.y).toBeCloseTo(-CORD.gravity * 0.1, 1);
  });

  it('pump power peaks at the top of the bob', () => {
    expect(pumpPower(0)).toBeCloseTo(0);
    expect(pumpPower(1.25 / 2)).toBeCloseTo(1);
    expect(pumpPower(1.25)).toBeCloseTo(0);
  });

  it('hangs head-down under the anchor', () => {
    const t = hangTilt({ x: 0, y: -1, z: 0 }, -Math.PI / 2);
    expect(Math.abs(unwrapNear(t.pitch, Math.PI) - Math.PI)).toBeLessThan(1e-6);
    expect(Math.abs(t.roll)).toBeLessThan(1e-6);
    // A sideways swing shows up as roll, not pitch.
    const side = hangTilt({ x: 0, y: -Math.cos(0.3), z: Math.sin(0.3) }, -Math.PI / 2);
    expect(Math.abs(side.roll)).toBeGreaterThan(0.25);
  });

  it('the lowering curve starts and ends where asked', () => {
    const a = { x: 0, y: 20, z: 0 };
    const b = { x: -8, y: 2, z: 0 };
    expect(hermite(a, { x: 1, y: 0, z: 0 }, b, 5, 0)).toEqual(a);
    const end = hermite(a, { x: 1, y: 0, z: 0 }, b, 5, 5);
    expect(end.x).toBeCloseTo(b.x);
    expect(end.y).toBeCloseTo(b.y);
  });
});
