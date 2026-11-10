import { describe, expect, it } from 'vitest';
import { collideBodies, collideWalls, integrate, localToWorld, makeBody, rng, worldToLocal } from '../../src/activities/bubbleball/bodies';
import {
  BALL,
  MATCH,
  aimPoint,
  PITCH,
  behindBall,
  createMatch,
  matchPrize,
  matchStars,
  pitchWalls,
  rivalSkillScale,
  stepMatch,
} from '../../src/activities/bubbleball/soccer';
import type { HumanInput, MatchEvent, MatchState } from '../../src/activities/bubbleball/soccer';

/** A simple "child who tries": runs behind the ball and pushes it toward the far goal. */
function kid(m: MatchState, skill = 1): HumanInput {
  const me = m.agents[0].body;
  const b = m.ball;
  const aim = aimPoint('home', b.x, b.z);
  const back = behindBall(b.x, b.z, aim.x, BALL.r + 0.6, aim.z);
  const ahead = (b.x - me.x) * (aim.x - b.x) + (b.z - me.z) * (aim.z - b.z) > 0;
  let tx = back.x;
  let tz = back.z + (ahead ? 0 : me.z >= b.z ? 1.9 : -1.9);
  if (ahead && Math.hypot(back.x - me.x, back.z - me.z) < 1.4) {
    tx = aim.x;
    tz = aim.z;
  }
  const dx = tx - me.x;
  const dz = tz - me.z;
  const d = Math.hypot(dx, dz) || 1;
  return { x: (dx / d) * skill, z: (dz / d) * skill, sprint: skill >= 1, hop: false };
}

function play(seed: number, skill: number): { m: MatchState; events: MatchEvent[] } {
  const m = createMatch();
  const rand = rng(seed);
  const walls = pitchWalls();
  const out: MatchEvent[] = [];
  const all: MatchEvent[] = [];
  for (let i = 0; i < 60 * 90 && m.phase !== 'over'; i++) {
    stepMatch(m, 1 / 60, { rand, input: kid(m, skill), walls }, out);
    all.push(...out);
  }
  return { m, events: all };
}

describe('bumper bodies', () => {
  it('bounce two bubbles apart and conserve momentum', () => {
    const a = makeBody({ x: -0.9, z: 0, r: 1, vx: 4, bounce: 0.9 });
    const b = makeBody({ x: 0.9, z: 0, r: 1, vx: -4, bounce: 0.9 });
    const c = collideBodies([a, b]);
    expect(c).toHaveLength(1);
    expect(a.vx).toBeLessThan(0);
    expect(b.vx).toBeGreaterThan(0);
    expect(a.vx + b.vx).toBeCloseTo(0, 6);
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeGreaterThanOrEqual(2 - 1e-9);
  });

  it('a light ball flies off a heavy bubble', () => {
    const p = makeBody({ x: 0, z: 0, r: 1, m: 1, vx: 5 });
    const ball = makeBody({ x: 1.7, z: 0, r: 0.75, m: 0.42 });
    collideBodies([p, ball]);
    expect(ball.vx).toBeGreaterThan(5);
  });

  it('walls keep bodies in and bounce them', () => {
    const b = makeBody({ x: 0, z: PITCH.hz - 0.5, r: 1, vz: 6, bounce: 0.9 });
    const hit = collideWalls(b, pitchWalls());
    expect(hit).toBeGreaterThan(5);
    expect(b.z).toBeLessThanOrEqual(PITCH.hz - 1 + 1e-9);
    expect(b.vz).toBeLessThan(0);
  });

  it('a hop comes back down to the floor', () => {
    const b = makeBody({ x: 0, z: 0, r: 1, vy: 5 });
    let peak = 0;
    for (let i = 0; i < 120; i++) {
      integrate(b, 1 / 60);
      peak = Math.max(peak, b.y);
    }
    expect(peak).toBeGreaterThan(0.5);
    expect(b.y).toBe(0);
  });

  it('local/world transforms round-trip', () => {
    for (const yaw of [0, 0.7, -2.1, Math.PI]) {
      const w = localToWorld(3, -2, yaw);
      const l = worldToLocal(w.x, w.z, yaw);
      expect(l.x).toBeCloseTo(3, 9);
      expect(l.z).toBeCloseTo(-2, 9);
    }
    // three.js convention: local +Z with yaw π/2 points to world +X.
    const f = localToWorld(0, 1, Math.PI / 2);
    expect(f.x).toBeCloseTo(1, 9);
  });
});

describe('Bubble Ball match', () => {
  it('stars and prizes', () => {
    expect(matchStars(3, 1)).toBe(3);
    expect(matchStars(2, 2)).toBe(2);
    expect(matchStars(0, 1)).toBe(1);
    expect(matchPrize(3, 0)).toBe(6);
    expect(matchPrize(1, 5)).toBe(5);
  });

  it('rivals ease off while they lead and never race away', () => {
    expect(rivalSkillScale(0, 0)).toBe(1);
    expect(rivalSkillScale(0, 2)).toBeLessThan(0.8);
    expect(rivalSkillScale(0, 9)).toBeGreaterThanOrEqual(0.6);
    expect(rivalSkillScale(6, 0)).toBeLessThanOrEqual(1.12);
  });

  it('a full match runs to the end with goals, bumps and flips, and everything stays on the pitch', () => {
    const { m, events } = play(3, 1);
    expect(m.phase).toBe('over');
    expect(m.clock).toBe(0);
    expect(events.filter((e) => e.kind === 'goal').length).toBeGreaterThan(0);
    expect(events.some((e) => e.kind === 'bump')).toBe(true);
    for (const a of m.agents) {
      expect(Number.isFinite(a.body.x) && Number.isFinite(a.body.z)).toBe(true);
      expect(Math.abs(a.body.z)).toBeLessThanOrEqual(PITCH.hz + 0.01);
      expect(Math.abs(a.body.x)).toBeLessThanOrEqual(PITCH.hx + PITCH.goalDepth + 0.01);
    }
  });

  it('a child who tries wins most matches; a child who does nothing still gets a close game', () => {
    let wins = 0;
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
    for (const s of seeds) {
      const { m } = play(s, 1);
      if (m.score.home > m.score.away) wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(6);
    // Idle hero: teammates keep it close-ish (the rivals ease off when they lead).
    const m = createMatch();
    const rand = rng(11);
    const walls = pitchWalls();
    const out: MatchEvent[] = [];
    for (let i = 0; i < 60 * 90 && m.phase !== 'over'; i++) stepMatch(m, 1 / 60, { rand, input: { x: 0, z: 0, sprint: false, hop: false }, walls }, out);
    expect(m.score.away - m.score.home).toBeLessThanOrEqual(4);
  });

  it('rolling the ball through a bonus ring charges it and the next home goal counts double', () => {
    const m = createMatch();
    m.phase = 'play';
    m.ring = { x: 3, z: 0, age: 1, popT: 0, alive: true };
    m.ringGap = 99;
    m.ball.x = 2;
    m.ball.vx = 8;
    m.lastTouch = 'home';
    // Clear the way.
    for (const a of m.agents) a.body.z = 4.5;
    const out: MatchEvent[] = [];
    const walls = pitchWalls();
    const rand = rng(1);
    let charged = false;
    let goal: MatchEvent | undefined;
    for (let i = 0; i < 240 && !goal; i++) {
      stepMatch(m, 1 / 60, { rand, input: { x: 0, z: 0, sprint: false, hop: false }, walls }, out);
      if (out.some((e) => e.kind === 'charge')) charged = true;
      goal = out.find((e) => e.kind === 'goal');
      // Keep pushing it on toward the goal.
      if (m.phase === 'play') m.ball.vx = Math.max(m.ball.vx, 7);
    }
    expect(charged).toBe(true);
    expect(goal).toEqual({ kind: 'goal', team: 'home', points: 2, double: true });
    expect(m.score.home).toBe(2);
    expect(m.doubles.home).toBe(1);
  });

  it('kick-off: countdown then play; the clock only runs during play', () => {
    const m = createMatch();
    const out: MatchEvent[] = [];
    const walls = pitchWalls();
    const rand = rng(2);
    for (let i = 0; i < 60 * (MATCH.countdown - 0.1); i++) stepMatch(m, 1 / 60, { rand, input: { x: 0, z: 0, sprint: false, hop: false }, walls }, out);
    expect(m.phase).toBe('countdown');
    expect(m.clock).toBe(MATCH.seconds);
    for (let i = 0; i < 12; i++) stepMatch(m, 1 / 60, { rand, input: { x: 0, z: 0, sprint: false, hop: false }, walls }, out);
    expect(m.phase).toBe('play');
    expect(m.clock).toBeLessThan(MATCH.seconds);
  });
});
