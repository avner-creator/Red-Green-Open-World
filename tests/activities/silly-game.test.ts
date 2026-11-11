import { describe, expect, it } from 'vitest';
import {
  BOOP,
  BoopRound,
  boopPrize,
  boopStars,
  distToBar,
  pillowBoop,
  pillowOffset,
  planRound,
  rng,
  sweeperBoop,
  sweeperHits,
} from '../../src/activities/silly/game';

const run = (r: BoopRound, seconds: number, dt = 1 / 30): ReturnType<BoopRound['update']> => {
  const out: ReturnType<BoopRound['update']> = [];
  for (let t = 0; t < seconds - 1e-9; t += dt) out.push(...r.update(dt));
  return out;
};

describe('Boop them all: round plan', () => {
  it('is the same for the same seed and varies between seeds', () => {
    expect(planRound(7, 8)).toEqual(planRound(7, 8));
    const plans = Array.from({ length: 20 }, (_, i) => planRound(100 + i, 8));
    const targetSets = new Set(plans.map((p) => p.targets.join(',')));
    expect(targetSets.size).toBeGreaterThan(5);
    expect(new Set(plans.map((p) => p.sweeperDir)).size).toBe(2);
  });

  it('lights distinct, in-range tube people and keeps speeds in range', () => {
    for (let s = 0; s < 50; s++) {
      const p = planRound(s, 8);
      expect(p.targets.length).toBe(BOOP.targets);
      expect(new Set(p.targets).size).toBe(p.targets.length);
      for (const t of p.targets) expect(t >= 0 && t < 8).toBe(true);
      expect(p.sweeperSpeed).toBeGreaterThanOrEqual(BOOP.sweeper.min);
      expect(p.sweeperSpeed).toBeLessThanOrEqual(BOOP.sweeper.max);
      for (const per of p.pillowPeriod) expect(per).toBeGreaterThanOrEqual(BOOP.pillow.periodMin);
    }
    expect(planRound(1, 3).targets.length).toBe(3);
  });

  it('rng gives floats in [0, 1)', () => {
    const r = rng(1);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v >= 0 && v < 1).toBe(true);
    }
  });
});

describe('Boop them all: scoring', () => {
  it('stars: fast win 3, win 2, time-up with bops 1, nothing 0', () => {
    expect(boopStars(true, BOOP.fastWin, 6)).toBe(3);
    expect(boopStars(true, BOOP.fastWin - 0.1, 6)).toBe(2);
    expect(boopStars(false, 0, 3)).toBe(1);
    expect(boopStars(false, 0, 0)).toBe(0);
  });

  it('prize follows stars; a practice round pays nothing', () => {
    expect(boopPrize(3, false)).toBe(BOOP.prize[3]);
    expect(boopPrize(1, false)).toBe(BOOP.prize[1]);
    expect(boopPrize(0, false)).toBe(0);
    expect(boopPrize(3, true)).toBe(0);
    expect(boopPrize(9, false)).toBe(BOOP.prize[3]);
  });
});

describe('Boop them all: round state machine', () => {
  it('counts 3-2-1, then GO, and only lit tubes count during play', () => {
    const r = new BoopRound(8);
    const start = r.start(11);
    expect(start).toEqual([{ type: 'count', n: 3 }]);
    expect(r.phase).toBe('countdown');
    const target = r.plan!.targets[0];
    expect(r.isTarget(target)).toBe(true);
    // No scoring before GO.
    expect(r.boop(target)).toEqual([]);
    const ev = run(r, BOOP.countdown + 0.05);
    expect(ev.filter((e) => e.type === 'count').map((e) => (e as { n: number }).n)).toEqual([2, 1]);
    expect(ev.some((e) => e.type === 'go')).toBe(true);
    expect(r.phase).toBe('play');
    const other = [0, 1, 2, 3, 4, 5, 6, 7].find((i) => !r.plan!.targets.includes(i))!;
    expect(r.boop(other)).toEqual([]);
    expect(r.boop(target)[0]).toMatchObject({ type: 'boop', tube: target, booped: 1 });
    // The same tube twice does not count.
    expect(r.boop(target)).toEqual([]);
    expect(r.booped.size).toBe(1);
  });

  it('a full round to a win pays the prize and speeds the sweeper up', () => {
    const r = new BoopRound(8);
    r.start(3);
    run(r, BOOP.countdown + 0.05);
    const s0 = r.sweeperSpeed();
    run(r, 5);
    let end: unknown = null;
    for (const t of r.plan!.targets) {
      for (const e of r.boop(t)) if (e.type === 'end') end = e.result;
    }
    expect(r.sweeperSpeed()).toBeGreaterThan(s0);
    expect(end).toMatchObject({ win: true, booped: BOOP.targets, total: BOOP.targets, stars: 3, prize: BOOP.prize[3] });
    expect(r.phase).toBe('done');
    // The result stays up, then the park is free to play again.
    run(r, BOOP.resultSeconds + 0.1);
    expect(r.phase).toBe('idle');
  });

  it('runs out of time with a partial score', () => {
    const r = new BoopRound(8);
    r.start(5, false);
    run(r, BOOP.countdown + 0.05);
    r.boop(r.plan!.targets[0]);
    r.boop(r.plan!.targets[1]);
    const ev = run(r, BOOP.roundSeconds + 0.1);
    const end = ev.find((e) => e.type === 'end');
    expect(end).toBeDefined();
    expect((end as { result: { win: boolean; booped: number; stars: number; prize: number } }).result).toMatchObject({ win: false, booped: 2, stars: 1, prize: BOOP.prize[1] });
  });

  it('a practice round (no gems for the ticket) still plays but pays nothing; cancel stops it', () => {
    const r = new BoopRound(8);
    r.start(9, true);
    run(r, BOOP.countdown + 0.05);
    let prize = -1;
    for (const t of r.plan!.targets) for (const e of r.boop(t)) if (e.type === 'end') prize = e.result.prize;
    expect(prize).toBe(0);
    r.start(10);
    r.cancel();
    expect(r.phase).toBe('idle');
    expect(r.boop(r.plan!.targets[0])).toEqual([]);
  });
});

describe('sweeper bar and wrecking pillows', () => {
  it('the bar catches a player on the ground and not one jumping over it', () => {
    // Bar along +X; player 3 m out, right on it.
    expect(sweeperHits(3, 0.1, 0, 0, 0.35)).toBe(true);
    expect(sweeperHits(3, 0.1, BOOP.sweeper.top + 0.1, 0, 0.35)).toBe(false);
    expect(sweeperHits(3, 2, 0, 0, 0.35)).toBe(false);
    // Past the end of the bar.
    expect(sweeperHits(BOOP.sweeper.length + 1, 0, 0, 0, 0.35)).toBe(false);
    expect(distToBar(0, 2, Math.PI / 2, 5).d).toBeCloseTo(0);
  });

  it('boops along the way the bar moves, up, and bounded', () => {
    for (const omega of [1, -1]) {
      const v = sweeperBoop(3, 0, omega);
      // +omega (counter-clockwise from above) moves a point on +X towards −Z.
      expect(Math.sign(v.z)).toBe(-Math.sign(omega));
      expect(v.y).toBeGreaterThan(4);
      expect(Math.hypot(v.x, v.z)).toBeLessThan(12);
    }
  });

  it('pillows swing below their pivot and boop the way they swing', () => {
    const o = pillowOffset(0.3, 2.8, 0);
    expect(o.y).toBeLessThan(0);
    expect(Math.abs(o.z)).toBeLessThanOrEqual(BOOP.pillow.rope * Math.sin(BOOP.pillow.amp) + 1e-9);
    expect(pillowBoop(0.2, 4).z).toBeGreaterThan(0);
    expect(pillowBoop(0.2, -4).z).toBeLessThan(0);
    // Nearly still: pushed away from the pillow.
    expect(pillowBoop(-0.3, 0.1).z).toBeLessThan(0);
    expect(pillowBoop(-0.3, 0.1).y).toBeGreaterThan(4);
  });
});
