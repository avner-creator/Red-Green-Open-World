/**
 * Bubble Ball balance: the rivals chase and shoot (they score sometimes) but a child who tries
 * usually wins; a child who just bashes the dash button at the ball also has a good chance;
 * a child who stands still loses (the rivals are real). Matches end at 3 goals or the clock.
 */
import { describe, expect, it } from 'vitest';
import { rng } from '../../src/activities/bubbleball/bodies';
import { BALL, MATCH, aimPoint, behindBall, createMatch, pitchWalls, stepMatch } from '../../src/activities/bubbleball/soccer';
import type { HumanInput, MatchEvent, MatchState } from '../../src/activities/bubbleball/soccer';

/** A child who tries: gets behind the ball, pushes it at the goal and dashes when lined up. */
export function tryer(m: MatchState, t: number): HumanInput {
  const me = m.agents[0].body;
  const b = m.ball;
  const aim = aimPoint('home', b.x, b.z);
  const back = behindBall(b.x, b.z, aim.x, BALL.r + 0.6, aim.z);
  const ahead = (b.x - me.x) * (aim.x - b.x) + (b.z - me.z) * (aim.z - b.z) > 0;
  let tx = back.x;
  let tz = back.z + (ahead ? 0 : me.z >= b.z ? 1.9 : -1.9);
  const lined = ahead && Math.hypot(back.x - me.x, back.z - me.z) < 1.4;
  if (lined) {
    tx = b.x;
    tz = b.z;
  }
  const dx = tx - me.x;
  const dz = tz - me.z;
  const d = Math.hypot(dx, dz) || 1;
  return { x: dx / d, z: dz / d, sprint: true, hop: lined && Math.hypot(b.x - me.x, b.z - me.z) < 2.4 && Math.floor(t * 4) % 3 === 0 };
}

function run(seed: number, pick: (m: MatchState, t: number) => HumanInput): { m: MatchState; events: MatchEvent[] } {
  const m = createMatch();
  const rand = rng(seed);
  const walls = pitchWalls();
  const out: MatchEvent[] = [];
  const events: MatchEvent[] = [];
  for (let i = 0; i < 60 * 120 && m.phase !== 'over'; i++) {
    stepMatch(m, 1 / 60, { rand, input: pick(m, i / 60), walls }, out);
    events.push(...out);
  }
  return { m, events };
}

describe('Bubble Ball balance', () => {
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  it('a child who tries wins most matches, but the rivals score sometimes', () => {
    let wins = 0;
    let awayGoals = 0;
    let early = 0;
    for (const s of seeds) {
      const { m } = run(s, tryer);
      expect(m.phase).toBe('over');
      if (m.score.home > m.score.away) wins++;
      awayGoals += m.score.away;
      if (Math.max(m.score.home, m.score.away) >= MATCH.target) early++;
    }
    expect(wins).toBeGreaterThanOrEqual(7);
    expect(awayGoals).toBeGreaterThan(0);
    // First to 3 ends most matches before the clock.
    expect(early).toBeGreaterThan(0);
  });

  it('a child who stands still loses most matches (the rivals really play)', () => {
    let losses = 0;
    for (const s of seeds) {
      const { m } = run(s, () => ({ x: 0, z: 0, sprint: false, hop: false }));
      if (m.score.away > m.score.home) losses++;
    }
    expect(losses).toBeGreaterThanOrEqual(5);
  });

  it('rivals dash, shoot and flip people (lively), and power kicks happen', () => {
    const { events } = run(4, tryer);
    const rivalDashes = events.filter((e) => e.kind === 'dash' && e.agent >= 3).length;
    const power = events.filter((e) => e.kind === 'kick' && e.power).length;
    const flips = events.filter((e) => e.kind === 'flip').length;
    expect(rivalDashes).toBeGreaterThan(3);
    expect(power).toBeGreaterThan(3);
    expect(flips).toBeGreaterThan(1);
  });

  it('the dash kick sends the ball fast toward the goal', () => {
    const m = createMatch();
    m.phase = 'play';
    for (let i = 1; i < 6; i++) m.agents[i].body.z = 4.8;
    const me = m.agents[0].body;
    me.x = -1.8;
    me.z = 0;
    m.ball.x = 0;
    m.ball.z = 0;
    const out: MatchEvent[] = [];
    const walls = pitchWalls();
    const rand = rng(1);
    stepMatch(m, 1 / 60, { rand, walls, input: { x: 1, z: 0, sprint: true, hop: true } }, out);
    expect(out.some((e) => e.kind === 'dash' && e.agent === 0)).toBe(true);
    let kick: MatchEvent | undefined;
    for (let i = 0; i < 30 && !kick; i++) {
      stepMatch(m, 1 / 60, { rand, walls, input: { x: 1, z: 0, sprint: true, hop: false } }, out);
      kick = out.find((e) => e.kind === 'kick' && e.power);
    }
    expect(kick).toBeDefined();
    expect(m.ball.vx).toBeGreaterThan(10);
  });
});
