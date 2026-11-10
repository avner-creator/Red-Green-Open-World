import { describe, expect, it } from 'vitest';
import {
  AIM,
  aimForReticle,
  angleBetween,
  drawOffset,
  fromXY,
  glide,
  inRegion,
  nextTier,
  normalize,
  onTarget,
  regionArea,
  reticleDirection,
  tolerance,
  toXY,
} from '../../src/activities/glasses/lineup/aim';
import type { V3 } from '../../src/activities/glasses/lineup/aim';
import { LINEUP } from '../../src/activities/glasses/lineup/constants';
import { LineupGame } from '../../src/activities/glasses/lineup/game';
import { mulberry32 } from '../../src/vision/toolkit/rng';
import type { GlassesTier } from '../../src/types';

const TIERS: GlassesTier[] = [1, 2, 3];
const DEG = Math.PI / 180;
const DT = 1 / 30;
const TARGETS: V3[] = [normalize({ x: 0, y: 0.25, z: -1 }), normalize({ x: 0.4, y: 0.1, z: -1 }), normalize({ x: -0.6, y: 0.35, z: -0.7 })];

interface XY {
  x: number;
  y: number;
}
/** Where the player puts "their" bubble on the screen this frame, and whether they press. */
type Strategy = (t: number, game: LineupGame, rnd: () => number, delta: readonly XY[]) => { p: XY; press: boolean };

/**
 * Play `minutes` of line-up in screen-angle space. The player steers the camera so that the first
 * live bubble sits at screen offset `p`; a second bubble (tier 3) sits at a fixed other offset
 * (another spot in the world, ≥ 14° away). A press counts the bubble inside the ring, if any.
 */
function play(seed: number, strategy: Strategy, minutes: number, lock: GlassesTier | null): { presses: number; hits: number; gems: number } {
  const rnd = mulberry32(seed ^ 0x5bd1e995);
  const delta: XY[] = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ];
  const game = new LineupGame(mulberry32(seed), {
    spawned: (i) => {
      const other = game.bubbles.some((b, j) => j !== i && b.state !== 'empty');
      const a = rnd() * Math.PI * 2;
      const m = (14 + rnd() * 16) * DEG;
      delta[i] = other ? { x: Math.cos(a) * m, y: Math.sin(a) * m } : { x: 0, y: 0 };
    },
  });
  game.lockTier = lock;
  game.fill(true);
  for (let t = 0; t < minutes * 60; t += DT) {
    game.step(DT);
    const { p, press } = strategy(t, game, rnd, delta);
    if (!press) continue;
    const ring = toXY(game.offset());
    let inside = -1;
    game.bubbles.forEach((b, i) => {
      if (inside < 0 && b.state === 'live' && Math.hypot(p.x + delta[i].x - ring.x, p.y + delta[i].y - ring.y) <= tolerance(b.tier)) inside = i;
    });
    game.press(inside);
  }
  return { presses: game.presses, hits: game.pops, gems: game.gems };
}

const mash = (p: XY): Strategy => () => ({ p, press: true });

describe('line-up ring offsets', () => {
  it('drawn offsets stay in the region (5°–14°, never the lower sector) and spread by area', () => {
    const rng = mulberry32(4);
    let inner = 0;
    const n = 20000;
    const mid = Math.sqrt((AIM.thetaMin ** 2 + AIM.thetaMax ** 2) / 2);
    for (let i = 0; i < n; i++) {
      const o = drawOffset(rng);
      expect(inRegion(o)).toBe(true);
      if (o.theta < mid) inner++;
    }
    // Uniform by area: half the samples inside the radius that halves the annulus area.
    expect(inner / n).toBeGreaterThan(0.48);
    expect(inner / n).toBeLessThan(0.52);
    expect(inRegion({ theta: 8 * DEG, phi: -Math.PI / 2 })).toBe(false);
    expect(inRegion({ theta: 2 * DEG, phi: 1 })).toBe(false);
  });

  it('the ring glides to a new offset in 0.3 s and the direction maths agree', () => {
    const a = { theta: 6 * DEG, phi: 0.3 };
    const b = { theta: 12 * DEG, phi: 2.5 };
    expect(glide(a, b, 0).theta).toBeCloseTo(a.theta, 9);
    expect(toXY(glide(a, b, AIM.glideSeconds)).x).toBeCloseTo(toXY(b).x, 9);
    expect(fromXY(toXY(b).x, toXY(b).y).phi).toBeCloseTo(b.phi, 9);
    for (const f of TARGETS) {
      expect(angleBetween(f, reticleDirection(f, b))).toBeCloseTo(b.theta, 6);
      expect(onTarget(reticleDirection(aimForReticle(f, b), b), f, 3)).toBe(true);
      expect(onTarget(reticleDirection(f, a), f, 1)).toBe(false); // bubble at the screen centre
    }
  });

  it('tolerance tightens by tier and stays below the smallest offset', () => {
    expect(tolerance(1)).toBeGreaterThan(tolerance(2));
    expect(tolerance(2)).toBeGreaterThan(tolerance(3));
    expect(tolerance(1)).toBeLessThan(AIM.thetaMin - DEG);
    // Blind odds per press ≤ 8 % in theory too: ring area × bubbles / region area.
    for (const t of TIERS) expect((Math.PI * tolerance(t) ** 2 * (t >= 3 ? 2 : 1)) / regionArea()).toBeLessThan(0.08);
  });

  it('tier ladder: two pops climb, a miss drops, within 1..3', () => {
    let s = { tier: 1 as GlassesTier, streak: 0 };
    s = nextTier(nextTier(s, true), true);
    expect(s.tier).toBe(2);
    s = nextTier(nextTier(nextTier(nextTier(s, true), true), true), true);
    expect(s.tier).toBe(3);
    expect(nextTier(s, false)).toEqual({ tier: 2, streak: 0 });
    expect(nextTier({ tier: 1, streak: 1 }, false)).toEqual({ tier: 1, streak: 0 });
  });
});

describe('line-up game: press to pop, one guess per bubble', () => {
  it('a miss floats the oldest bubble away, reports it, recharges the ring and redraws it', () => {
    const results: [number, boolean][] = [];
    const g = new LineupGame(mulberry32(1), { result: (t, h) => results.push([t, h]) });
    g.fill(true);
    for (let i = 0; i < 40; i++) g.step(DT);
    const before = g.offset();
    expect(g.press(-1)).toBe('miss');
    expect(results).toEqual([[1, false]]);
    expect(g.bubbles[0].state).toBe('drift');
    expect(g.cooldown).toBe(LINEUP.missCooldown);
    for (let i = 0; i < 20; i++) g.step(DT);
    expect(g.offset()).not.toEqual(before);
    expect(g.press(0)).toBe('ignored'); // recharging
  });

  it('a hit pops, pays the tier and redraws; a time-out is a miss', () => {
    const paid: number[] = [];
    const g = new LineupGame(mulberry32(2), { pay: (n) => paid.push(n) });
    g.fill(true);
    for (let i = 0; i < 40; i++) g.step(DT);
    expect(g.press(0)).toBe('hit');
    expect(paid).toEqual([LINEUP.gems[1]]);
    for (let t = 0; t < 20; t += DT) g.step(DT);
    expect(g.misses).toBe(1); // the next bubble timed out after 15 s
  });

  it('tier 3 shows two bubbles, tiers 1–2 one', () => {
    for (const t of TIERS) {
      const g = new LineupGame(mulberry32(3));
      g.lockTier = t;
      g.fill(true);
      for (let i = 0; i < 90; i++) g.step(DT);
      expect(g.bubbles.filter((b) => b.state === 'live').length).toBe(t >= 3 ? 2 : 1);
    }
  });
});

describe('line-up cannot be played blind', () => {
  const seeds = [1, 2, 3];
  const grid: XY[] = [];
  for (let th = 5.5; th <= 13.5; th += 1.6)
    for (let ph = -180; ph < 180; ph += 20) {
      const o = { theta: th * DEG, phi: ph * DEG };
      if (inRegion(o)) grid.push(toXY(o));
    }
  const raster: Strategy = (t, _g, rnd) => {
    // Sweeps the whole region row by row at 2°/s, pressing now and then.
    const rows = 12;
    const span = 28 * DEG;
    const s = (t * 2 * DEG) % (span * rows);
    const row = Math.floor(s / span);
    const x = (row % 2 ? span - (s % span) : s % span) - span / 2;
    return { p: { x, y: -6 * DEG + (row / rows) * 20 * DEG }, press: rnd() < 0.03 };
  };
  const walker = (): Strategy => {
    const p = { x: 0, y: 6 * DEG };
    return (_t, _g, rnd) => {
      p.x = Math.max(-14 * DEG, Math.min(14 * DEG, p.x + (rnd() - 0.5) * 1.2 * DEG));
      p.y = Math.max(-6 * DEG, Math.min(14 * DEG, p.y + (rnd() - 0.5) * 1.2 * DEG));
      return { p, press: rnd() < 0.05 };
    };
  };

  const rate = (r: { presses: number; hits: number }): number => r.hits / Math.max(1, r.presses);

  for (const tier of TIERS) {
    it(`tier ${tier}: centre, parked grid, raster scan and random walk hit ≤ 8 % per press`, () => {
      const total = { presses: 0, hits: 0 };
      const add = (r: { presses: number; hits: number }): void => {
        total.presses += r.presses;
        total.hits += r.hits;
      };
      for (const s of seeds) {
        const c = play(s, mash({ x: 0, y: 0 }), 5, tier);
        expect(c.hits, 'centre never hits').toBe(0);
        const g = { presses: 0, hits: 0 };
        for (const p of grid) {
          const r = play(s * 977 + grid.indexOf(p), mash(p), 2, tier);
          g.presses += r.presses;
          g.hits += r.hits;
          expect(rate(r)).toBeLessThan(0.3); // no single spot is a jackpot
        }
        expect(rate(g), `grid tier ${tier}`).toBeLessThanOrEqual(0.08);
        add(g);
        const ra = play(s, raster, 20, tier);
        expect(rate(ra), `raster tier ${tier}`).toBeLessThanOrEqual(0.08);
        const w = play(s, walker(), 20, tier);
        expect(rate(w), `walk tier ${tier}`).toBeLessThanOrEqual(0.08);
      }
      expect(total.presses).toBeGreaterThan(1000);
    });
  }

  it('blind play averages < 1 gem per minute (natural tier ladder)', () => {
    let gems = 0;
    let minutes = 0;
    for (const s of seeds) {
      for (const p of grid.filter((_, i) => i % 6 === 0)) {
        gems += play(s * 31 + grid.indexOf(p), mash(p), 10, null).gems;
        minutes += 10;
      }
      gems += play(s, raster, 30, null).gems + play(s, walker(), 30, null).gems;
      minutes += 60;
    }
    expect(gems / minutes).toBeLessThan(1);
  });

  it('a seeing player (steers the ring onto the bubble, then presses) hits ≥ 95 %', () => {
    for (const tier of TIERS) {
      let presses = 0;
      let hits = 0;
      for (const s of seeds) {
        const seeing: Strategy = (_t, g, rnd, delta) => {
          // Steer the ring onto the first live bubble (it sees where each bubble is).
          const k = Math.max(0, g.bubbles.findIndex((b) => b.state === 'live'));
          const r0 = toXY(g.offset());
          const ring = { x: r0.x - delta[k].x, y: r0.y - delta[k].y };
          // Small steering error (up to 40 % of the ring radius), pressing once settled.
          const e = rnd() * 0.4 * tolerance(g.tier);
          const a = rnd() * Math.PI * 2;
          return { p: { x: ring.x + Math.cos(a) * e, y: ring.y + Math.sin(a) * e }, press: g.canPress() && rnd() < 0.2 };
        };
        const r = play(s, seeing, 5, tier);
        presses += r.presses;
        hits += r.hits;
      }
      expect(presses).toBeGreaterThan(50);
      expect(hits / presses).toBeGreaterThanOrEqual(0.95);
    }
  });
});
