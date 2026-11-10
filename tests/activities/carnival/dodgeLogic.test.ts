import { describe, expect, it } from 'vitest';
import {
  BALL_R,
  DURATION,
  FRIEND_BONUS,
  GRACE,
  PLAYER_HALF,
  PLAYER_Z,
  SPAWN_Z,
  ballAt,
  botInput,
  clampLane,
  dodgeX,
  hits,
  hopStep,
  nextGap,
  pickKind,
  planBall,
  startHop,
  travelTime,
} from '../../../src/activities/carnival/games/dodgeLogic';
import type { BallKind, BallPlan, Hop } from '../../../src/activities/carnival/games/dodgeLogic';
import { RIVAL_SKILLS, RivalBrain } from '../../../src/activities/carnival/rivals';
import { makeRng } from '../../../src/activities/carnival/rng';

const LANE = { center: 0, half: PLAYER_HALF, z: PLAYER_Z };

describe('glow dodge pacing', () => {
  it('is forgiving: travel ≥ 1.2 s, a ball every 1.4–2 s', () => {
    const rng = makeRng(3);
    for (let t = 0; t <= DURATION; t += 0.5) {
      expect(travelTime(t, rng)).toBeGreaterThanOrEqual(1.2);
      const g = nextGap(t, rng);
      expect(g).toBeGreaterThanOrEqual(1.4);
      expect(g).toBeLessThanOrEqual(2.0);
    }
  });

  it('starts with a roller and never sends three of a kind in a row', () => {
    const rng = makeRng(5);
    const seq: BallKind[] = [];
    for (let i = 0; i < 200; i++) seq.push(pickKind(rng, seq.slice(-3)));
    expect(seq[0]).toBe('roll');
    for (let i = 2; i < seq.length; i++) expect(seq[i] === seq[i - 1] && seq[i] === seq[i - 2]).toBe(false);
    expect(seq.filter((k) => k === 'lob').length).toBeGreaterThan(60);
  });
});

describe('glow dodge balls', () => {
  it('aims near the contestant, inside the lane', () => {
    const rng = makeRng(9);
    for (let i = 0; i < 100; i++) {
      const p = planBall(rng, 0, 'lob', LANE, 0.6, 10);
      expect(p.tx).toBeLessThanOrEqual(PLAYER_HALF);
      expect(p.tx).toBeGreaterThan(0.3);
    }
  });

  it('leaves the tunnel and crosses the contestant at the planned point', () => {
    const plan: BallPlan = { who: 0, kind: 'lob', x0: 0.1, tx: 0.4, tz: PLAYER_Z, dur: 1.5, apex: 1.2 };
    const a = ballAt(plan, 0);
    expect(a.z).toBeCloseTo(SPAWN_Z);
    const mid = ballAt(plan, 0.75);
    expect(mid.y).toBeGreaterThan(1.5);
    const b = ballAt(plan, 1.5);
    expect(b.x).toBeCloseTo(0.4);
    expect(b.z).toBeCloseTo(PLAYER_Z);
    expect(b.y).toBeGreaterThan(0.8);
    // Afterwards it drops to the floor, never below it.
    expect(ballAt(plan, 2.4).y).toBeCloseTo(BALL_R.lob);
    const roll = ballAt({ ...plan, kind: 'roll', apex: 0 }, 0.7);
    expect(roll.y).toBeCloseTo(BALL_R.roll);
  });

  it('a roller is cleared by a hop, a lob by a sidestep', () => {
    expect(hits('roll', 0, BALL_R.roll, 0, 0)).toBe(true);
    expect(hits('roll', 0, BALL_R.roll, 0, 0.35)).toBe(false);
    expect(hits('roll', 0, BALL_R.roll, 0.5, 0)).toBe(false);
    expect(hits('lob', 0, 1.0, 0, 0)).toBe(true);
    expect(hits('lob', 0, 1.0, 0, 0.6)).toBe(true); // hopping doesn't dodge a lob
    expect(hits('lob', 0, 1.0, PLAYER_HALF, 0)).toBe(false);
    expect(hits('lob', 0.3, 1.0, -0.15, 0)).toBe(false);
  });

  it('the hop clears a roller for a generous window and lands', () => {
    const h: Hop = { y: 0, vy: 0 };
    expect(startHop(h)).toBe(true);
    expect(startHop(h)).toBe(false);
    let clear = 0;
    let air = 0;
    for (let i = 0; i < 120; i++) {
      hopStep(h, 1 / 60);
      if (h.y > 0) air += 1 / 60;
      if (!hits('roll', 0, BALL_R.roll, 0, h.y)) clear += 1 / 60;
    }
    expect(clear).toBeGreaterThan(0.35);
    expect(air).toBeLessThan(0.75);
    expect(h.y).toBe(0);
    expect(startHop(h)).toBe(true);
  });

  it('sidesteps to the lane edge away from the ball', () => {
    expect(dodgeX(0.1, 0, 0.6)).toBe(-0.6);
    expect(dodgeX(-0.2, 0, 0.6)).toBe(0.6);
    expect(clampLane(3, 1.6, 0.45)).toBeCloseTo(2.05);
  });
});

/** A whole round for one contestant: `play` = the autopilot, or stand still. */
function simulate(seed: number, play: 'bot' | 'idle'): { balls: number; points: number } {
  const rng = makeRng(seed);
  const dt = 1 / 60;
  const hop: Hop = { y: 0, vy: 0 };
  let x = 0;
  let next = GRACE;
  const recent: BallKind[] = [];
  const live: { plan: BallPlan; s: number }[] = [];
  let balls = 0;
  let points = 0;
  for (let t = 0; t < DURATION; t += dt) {
    if (play === 'bot') {
      const b = botInput(
        live.map((l) => ({ kind: l.plan.kind, tx: l.plan.tx, eta: l.plan.dur - l.s })),
        x,
        hop.y,
        0,
        PLAYER_HALF,
      );
      x = clampLane(x + b.moveX * 4 * dt, 0, PLAYER_HALF);
      if (b.jump) startHop(hop);
    }
    hopStep(hop, dt);
    if (t >= next) {
      const kind = pickKind(rng, recent);
      recent.push(kind);
      next = t + nextGap(t, rng);
      const plan = planBall(rng, 0, kind, LANE, x, t);
      if (t + plan.dur <= DURATION - 0.05) {
        live.push({ plan, s: 0 });
        balls++;
      }
    }
    for (let i = live.length - 1; i >= 0; i--) {
      const l = live[i];
      l.s += dt;
      if (l.s < l.plan.dur) continue;
      const p = ballAt(l.plan, l.plan.dur);
      if (!hits(l.plan.kind, p.x, p.y, x, hop.y)) points++;
      live.splice(i, 1);
    }
  }
  return { balls, points };
}

describe('glow dodge round', () => {
  it('gives about 15–19 balls; the autopilot dodges them all, standing still dodges none', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const bot = simulate(seed, 'bot');
      expect(bot.balls).toBeGreaterThanOrEqual(15);
      expect(bot.balls).toBeLessThanOrEqual(19);
      expect(bot.points).toBe(bot.balls);
      expect(simulate(seed, 'idle').points).toBe(0);
    }
  });

  it('friends dodge less often than a child who tries', () => {
    for (const [i, skill] of RIVAL_SKILLS.entries()) {
      const brain = new RivalBrain(skill, makeRng(40 + i));
      let ok = 0;
      for (let n = 0; n < 1000; n++) if (brain.roll(FRIEND_BONUS)) ok++;
      // ~17 balls a round → a friend scores well under the 3-star line.
      expect((ok / 1000) * 17).toBeLessThan(10.5);
    }
  });
});
