import { describe, expect, it } from 'vitest';
import {
  AIM,
  aimForReticle,
  angleBetween,
  drawOffset,
  fromXY,
  glide,
  inRegion,
  normalize,
  onTarget,
  regionArea,
  reticleDirection,
  tolerance,
  toXY,
} from '../../src/activities/glasses/lineup/aim';
import type { V3 } from '../../src/activities/glasses/lineup/aim';
import { auditDemo } from '../../src/activities/glasses/booth/legibility';
import { RoundMachine } from '../../src/activities/glasses/booth/round';
import { simulate } from '../../src/activities/glasses/booth/sim';
import { GLASSES } from '../../src/activities/glasses/constants';
import { LINEUP, LINEUP_PRIZE, LINEUP_RULES, lineupBooth } from '../../src/activities/glasses/lineup/constants';
import { LINEUP_DEMO } from '../../src/activities/glasses/lineup/demo';
import { LineupGame } from '../../src/activities/glasses/lineup/game';
import { boothFootprint } from '../../src/activities/glasses/lineup/layout';
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
 * Play `minutes` of line-up rounds against the REAL round machine and rules (wired as the mechanic
 * wires them): a round starts `restart` s after the booth is idle again; each try opens the
 * bubbles; a tap or a time-out reports the try. The player steers the camera so that the first
 * live bubble sits at screen offset `p`; a second bubble (tier 3) sits at a fixed other offset
 * (another spot in the world, ≥ 14° away). A press counts the bubble inside the ring, if any.
 */
function play(seed: number, strategy: Strategy, minutes: number, lock: GlassesTier | null, restart = 1.5): { presses: number; hits: number; gems: number; rounds: number } {
  const rnd = mulberry32(seed ^ 0x5bd1e995);
  const delta: XY[] = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ];
  const m = new RoundMachine(LINEUP_RULES);
  const game = new LineupGame(mulberry32(seed), {
    spawned: (i) => {
      const other = game.bubbles.some((b, j) => j !== i && (b.state === 'live' || b.state === 'in' || b.state === 'wait'));
      const a = rnd() * Math.PI * 2;
      const r = (14 + rnd() * 16) * DEG;
      delta[i] = other ? { x: Math.cos(a) * r, y: Math.sin(a) * r } : { x: 0, y: 0 };
    },
    result: (_t, hit) => m.report(hit),
  });
  let gems = 0;
  let idle = 0;
  for (let t = 0; t < minutes * 60; t += DT) {
    if (lock) m.tier = lock;
    if (m.phase === 'idle') {
      idle += DT;
      if (idle >= restart) {
        m.start();
        idle = 0;
      }
    }
    for (const e of m.step(DT)) {
      if (e.type === 'try') game.open(e.tier);
      else if (e.type === 'end' || e.type === 'cancel') game.close();
      else if (e.type === 'pay') gems += e.gems;
    }
    game.step(DT, m.phase === 'play');
    if (m.phase !== 'play') continue;
    const { p, press } = strategy(t, game, rnd, delta);
    if (!press) continue;
    const ring = toXY(game.offset());
    let inside = -1;
    game.bubbles.forEach((b, i) => {
      if (inside < 0 && b.state === 'live' && Math.hypot(p.x + delta[i].x - ring.x, p.y + delta[i].y - ring.y) <= tolerance(b.tier)) inside = i;
    });
    game.press(inside);
  }
  return { presses: game.presses, hits: game.pops, gems, rounds: m.rounds };
}

const mash = (p: XY): Strategy => () => ({ p, press: true });

describe('line-up ring offsets', () => {
  it('drawn offsets stay in the region (5°–16°, never the lower sector) and spread by area', () => {
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

});

describe('line-up game: one tap per bubble', () => {
  const open = (g: LineupGame, tier: GlassesTier = 1): void => {
    g.open(tier);
    for (let i = 0; i < 40; i++) g.step(DT);
  };

  it('a tap off the bubble floats it away and reports one miss; the ring is redrawn; no recharge', () => {
    const results: [number, boolean][] = [];
    const g = new LineupGame(mulberry32(1), { result: (t, h) => results.push([t, h]) });
    open(g);
    const before = g.offset();
    expect(g.press(-1)).toBe('miss');
    expect(results).toEqual([[1, false]]);
    expect(g.bubbles[0].state).toBe('drift');
    for (let i = 0; i < 20; i++) g.step(DT);
    expect(g.offset()).not.toEqual(before);
    // The next try's bubble can be tapped at once.
    open(g);
    const live = g.bubbles.findIndex((b) => b.state === 'live');
    expect(g.press(live)).toBe('hit');
    expect(results).toEqual([
      [1, false],
      [1, true],
    ]);
  });

  it('a hit pops and redraws; a bubble left alone times out as a miss (only while the try is open)', () => {
    const results: boolean[] = [];
    const g = new LineupGame(mulberry32(2), { result: (_t, h) => results.push(h) });
    open(g);
    const before = g.offset();
    expect(g.press(0)).toBe('hit');
    expect(g.bubbles[0].state).toBe('pop');
    for (let i = 0; i < 20; i++) g.step(DT);
    expect(g.offset()).not.toEqual(before);
    open(g, 2);
    // Not playing (off the pad / between tries): no time-out however long.
    for (let t = 0; t < 30; t += DT) g.step(DT, false);
    expect(results).toEqual([true]);
    const o = g.offset();
    for (let t = 0; t < LINEUP.bubble.lifetime + 1; t += DT) g.step(DT);
    expect(results).toEqual([true, false]);
    expect(g.misses).toBe(1);
    expect(g.offset(), 'a time-out redraws the ring').not.toEqual(o);
  });

  it('tier 3 shows two bubbles, tiers 1–2 one; close() floats them away with no result', () => {
    for (const t of TIERS) {
      const results: boolean[] = [];
      const g = new LineupGame(mulberry32(3), { result: (_t, h) => results.push(h) });
      open(g, t);
      expect(g.bubbles.filter((b) => b.state === 'live').length).toBe(t >= 3 ? 2 : 1);
      g.close();
      expect(g.bubbles.filter((b) => b.state === 'live').length).toBe(0);
      expect(results).toEqual([]);
    }
  });
});

describe('line-up rounds (booth kit)', () => {
  it('5 bubbles a round, a prize from 3 pops, tier up after 4+ and down after 2 or fewer', () => {
    expect(LINEUP_RULES.tries).toBe(5);
    expect(LINEUP_RULES.minHits).toBe(3);
    for (const tier of TIERS) {
      expect(LINEUP_PRIZE[tier].length).toBe(6);
      expect(LINEUP_PRIZE[tier].slice(0, 3)).toEqual([0, 0, 0]);
      for (let h = 4; h <= 5; h++) expect(LINEUP_PRIZE[tier][h]).toBeGreaterThan(LINEUP_PRIZE[tier][h - 1]);
    }
    const m = new RoundMachine(LINEUP_RULES);
    const round = (hits: number): void => {
      m.start();
      for (let i = 0; i < 400 && m.phase !== 'play'; i++) m.step(DT);
      for (let k = 0; k < 5; k++) {
        m.report(k < hits);
        for (let i = 0; i < 400 && m.phase === 'beat'; i++) m.step(DT);
      }
      for (let i = 0; i < 600 && m.phase !== 'idle'; i++) m.step(DT);
    };
    round(4);
    expect(m.tier).toBe(2);
    round(3);
    expect(m.tier).toBe(2);
    round(2);
    expect(m.tier).toBe(1);
  });

  it('the booth stays inside the site circle and the demo has 4–6 legible frames', () => {
    for (const side of [-1, 1] as const) {
      const b = lineupBooth(side);
      for (const p of [...boothFootprint(side), { x: b.pad.x, z: b.pad.z + (b.pad.r ?? 1) }, ...(b.decals ?? [])]) {
        expect(Math.hypot(p.x, p.z), `side ${side}`).toBeLessThanOrEqual(GLASSES.siteRadius + 0.4);
      }
      expect(b.lamps).toBe(LINEUP_RULES.tries);
      expect(b.pad.walkIn).toBe(true);
    }
    expect(LINEUP_DEMO.frames).toBeGreaterThanOrEqual(4);
    expect(LINEUP_DEMO.frames).toBeLessThanOrEqual(6);
    const audit = auditDemo(LINEUP_DEMO);
    console.info(`line-up demo: hero ${audit.minHeroPx.toFixed(0)} px at 8 m, ≤ ${audit.maxThings} pictures a frame`);
    expect(audit.problems).toEqual([]);
  });

  it('gems per minute: a blind tapper ≤ 6 at every tier, a child who sees the ring ≥ 25 at tier 1', () => {
    // Blind: taps at a random spot of the region after 0.5 s (the round's real per-tap odds ≤ 8 %).
    for (const lock of [null, 1, 2, 3] as const) {
      let gems = 0;
      let minutes = 0;
      for (const s of [1, 2, 3]) {
        const blind: Strategy = (_t, g, rnd) => {
          const o = toXY(drawOffset(rnd));
          return { p: { x: -o.x, y: -o.y }, press: g.canPress() && rnd() < 0.07 };
        };
        gems += play(s, blind, 20, lock, 0.5).gems;
        minutes += 20;
      }
      console.info(`line-up blind tapper, tier ${lock ?? 'staircase'}: ${(gems / minutes).toFixed(2)} gems/min`);
      expect(gems / minutes).toBeLessThanOrEqual(6);
    }
    // The kit's generic simulation with the worst blind odds (8 % a tap, a tap every 0.4 s).
    for (const fixedTier of [undefined, 1, 2, 3] as const) expect(simulate(LINEUP_RULES, { hitP: 0.08, tryTime: 0.4, restart: 0.5, minutes: 300, fixedTier, seed: 5 }).gemsPerMinute).toBeLessThanOrEqual(6);
    // Seeing: steers the ring onto the bubble in ~2.5 s, then taps; steps off and on the pad in 1.5 s.
    const seeing = (aim: number): Strategy => {
      let since = 0;
      return (_t, g, _rnd, delta) => {
        // The oldest live bubble first (at tier 3 the other one waits).
        let k = -1;
        g.bubbles.forEach((b, i) => {
          if (b.state === 'live' && (k < 0 || b.age > g.bubbles[k].age)) k = i;
        });
        if (k < 0) {
          since = 0;
          return { p: { x: 0, y: 0 }, press: false };
        }
        since += DT;
        const r0 = toXY(g.offset());
        const p = { x: r0.x - delta[k].x, y: r0.y - delta[k].y };
        if (since < aim) return { p, press: false };
        since = 0;
        return { p, press: true };
      };
    };
    const t1 = play(1, seeing(2.5), 20, 1);
    const st = play(1, seeing(2.5), 20, null);
    console.info(`line-up seeing child: tier 1 ${(t1.gems / 20).toFixed(1)}, staircase ${(st.gems / 20).toFixed(1)} gems/min`);
    expect(t1.gems / 20).toBeGreaterThanOrEqual(25);
    expect(st.gems / 20).toBeGreaterThanOrEqual(t1.gems / 20);
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
