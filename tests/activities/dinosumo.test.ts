import { describe, expect, it } from 'vitest';
import { rng } from '../../src/activities/bubbleball/bodies';
import {
  BEAT,
  DASH,
  POINTS,
  RING,
  SUMO,
  TEETER,
  balloonSlots,
  beatPhase,
  createSumo,
  friendSkillScale,
  isOut,
  isPerfect,
  playerRank,
  startSpots,
  stepSumo,
  sumoPrize,
  sumoStars,
} from '../../src/activities/dinosumo/sumo';
import type { SumoEvent, SumoInput, SumoState } from '../../src/activities/dinosumo/sumo';

const still: SumoInput = { x: 0, z: 0, sprint: false, swing: false };

/**
 * A child who tries (same rule as the QA script): get on the centre side of the nearest friend,
 * then belly-charge it outward; on the rim, mash and push back in.
 */
function kid(s: SumoState, t: number): SumoInput {
  const me = s.dinos[0].body;
  if (s.dinos[0].state === 'teeter') return { x: -me.x, z: -me.z, sprint: false, swing: Math.floor(t * 10) % 2 === 0 };
  let target: SumoState['dinos'][number] | null = null;
  let best = Infinity;
  for (const d of s.dinos.slice(1)) {
    if (d.state !== 'ok' && d.state !== 'teeter') continue;
    const dist = Math.hypot(d.body.x - me.x, d.body.z - me.z);
    if (dist < best) {
      best = dist;
      target = d;
    }
  }
  if (!target) return { x: -me.x, z: -me.z, sprint: false, swing: false };
  const tb = target.body;
  const tl = Math.hypot(tb.x, tb.z) || 1;
  const sx = tb.x - (tb.x / tl) * 1.5;
  const sz = tb.z - (tb.z / tl) * 1.5;
  const lined = Math.hypot(sx - me.x, sz - me.z) < 1.2 || best < 2.2;
  const tx = lined ? tb.x : sx;
  const tz = lined ? tb.z : sz;
  const dx = tx - me.x;
  const dz = tz - me.z;
  const d = Math.hypot(dx, dz) || 1;
  return { x: dx / d, z: dz / d, sprint: true, swing: lined && best < 2.6 && Math.floor(t * 10) % 2 === 0 };
}

/** A clumsy child: wanders after the friends and charges at random moments. */
function clumsy(s: SumoState, t: number): SumoInput {
  const me = s.dinos[0].body;
  const f = s.dinos[1 + (Math.floor(t / 3) % 3)].body;
  const dx = f.x - me.x + Math.sin(t * 1.7) * 2;
  const dz = f.z - me.z + Math.cos(t * 1.3) * 2;
  const d = Math.hypot(dx, dz) || 1;
  return { x: dx / d, z: dz / d, sprint: false, swing: Math.floor(t * 2.5) % 3 === 0 && Math.floor(t * 30) % 2 === 0 };
}

function play(seed: number, input: (s: SumoState, t: number) => SumoInput): { s: SumoState; events: SumoEvent[] } {
  const s = createSumo();
  const rand = rng(seed);
  const out: SumoEvent[] = [];
  const all: SumoEvent[] = [];
  for (let i = 0; i < 60 * 200 && s.phase !== 'over'; i++) {
    stepSumo(s, 1 / 60, { rand, input: input(s, i / 60) }, out);
    all.push(...out);
  }
  return { s, events: all };
}

/** Player at the centre side of friend 1 near the edge, the others out of the way. */
function setup(): SumoState {
  const s = createSumo();
  s.phase = 'play';
  s.dinos[0].body.x = RING.r - 2.4;
  s.dinos[0].body.z = 0;
  s.dinos[1].body.x = RING.r - 1;
  s.dinos[1].body.z = 0;
  s.dinos[2].body.x = -3;
  s.dinos[2].body.z = 1.5;
  s.dinos[3].body.x = -3;
  s.dinos[3].body.z = -1.5;
  for (const d of s.dinos.slice(1)) {
    d.think = 99;
    d.skill = 0.05; // no reactions, no rim recovery
  }
  s.balloons.forEach((b) => (b.kind = 'none'));
  return s;
}

function run(s: SumoState, frames: number, input: SumoInput, seed = 1, until?: (e: SumoEvent) => boolean): SumoEvent[] {
  const rand = rng(seed);
  const out: SumoEvent[] = [];
  const all: SumoEvent[] = [];
  for (let i = 0; i < frames; i++) {
    stepSumo(s, 1 / 60, { rand, input: i === 0 ? input : { ...input, swing: false } }, out);
    all.push(...out);
    if (until && out.some(until)) break;
  }
  return all;
}

describe('Dino Sumo round length (QA8 m8)', () => {
  it('a whole round (3-2-1, bouts, cheers, end) takes about a minute whoever plays', () => {
    for (const [seed, who] of [[1, kid], [2, clumsy], [3, () => still]] as const) {
      const s = createSumo();
      const rand = rng(seed);
      const out: SumoEvent[] = [];
      let t = 0;
      for (; t < 200 && s.phase !== 'over'; t += 1 / 60) stepSumo(s, 1 / 60, { rand, input: who(s, t) }, out);
      expect(s.phase).toBe('over');
      expect(t, 'seed ' + seed).toBeLessThanOrEqual(62);
    }
  });
});

describe('Dino Sumo', () => {
  it('ring, stars, prizes and the rubber band', () => {
    expect(isOut(0, RING.r - 0.1)).toBe(false);
    expect(isOut(RING.r + 0.1, 0)).toBe(true);
    expect(sumoStars(1)).toBe(3);
    expect(sumoStars(2)).toBe(2);
    expect(sumoStars(4)).toBe(1);
    expect(sumoPrize(3, 1)).toBe(7);
    expect(sumoPrize(1, 9)).toBe(5);
    expect(friendSkillScale(10, 0)).toBeGreaterThanOrEqual(0.6);
    expect(friendSkillScale(1, 0)).toBeLessThan(1);
    expect(friendSkillScale(0, 0)).toBe(1);
    // A leading player gets a sharper fight.
    expect(friendSkillScale(0, 2)).toBeGreaterThan(1);
    expect(friendSkillScale(0, 9)).toBeLessThanOrEqual(1.18);
    expect(SUMO.target).toBe(3); // best of 5
    expect(createSumo().dinos.slice(1).map((d) => d.personality)).toEqual(['shy', 'bouncy', 'sneaky']);
  });

  it('balloon slots hang inside the ring at reachable height', () => {
    for (const b of balloonSlots()) {
      expect(Math.hypot(b.x, b.z)).toBeLessThan(RING.r);
      expect(b.y).toBeGreaterThan(1.2);
      expect(b.y).toBeLessThan(2.2);
    }
    const s = createSumo();
    expect(s.balloons.filter((b) => b.kind === 'weak').length).toBeGreaterThan(0);
    expect(s.balloons.filter((b) => b.kind === 'weak').length).toBeLessThanOrEqual(2);
  });

  it('a charge winds up first (visible), lunges, then recharges on a cooldown', () => {
    const s = setup();
    const ev = run(s, 1, { x: 1, z: 0, sprint: false, swing: true });
    expect(ev.some((e) => e.kind === 'windup' && e.dino === 0)).toBe(true);
    expect(ev.some((e) => e.kind === 'swing')).toBe(false);
    expect(s.dinos[0].windup).toBeGreaterThan(0);
    const later = run(s, Math.ceil(DASH.windup * 60) + 2, still);
    expect(later.some((e) => e.kind === 'swing' && e.dino === 0)).toBe(true);
    // Mashing again right away does nothing (cooldown).
    const again = run(s, 1, { x: 1, z: 0, sprint: false, swing: true });
    expect(again.some((e) => e.kind === 'windup')).toBe(false);
  });

  it('a charge into a friend near the rim: tumble out, a point, a cheer, everybody hops back for the next bout', () => {
    const s = setup();
    const all = run(s, 60 * 4, { x: 1, z: 0, sprint: false, swing: true }, 1, (e) => e.kind === 'point');
    expect(all.some((e) => e.kind === 'tailHit' && e.from === 0 && e.to === 1)).toBe(true);
    expect(all.find((e) => e.kind === 'out')).toEqual({ kind: 'out', dino: 1, by: 0 });
    expect(s.dinos[0].points).toBe(POINTS.out);
    expect(isOut(s.dinos[0].body.x, s.dinos[0].body.z)).toBe(false);
    expect(s.phase).toBe('point');
    const next = run(s, 60 * 5, still, 2, (e) => e.kind === 'start');
    expect(next.some((e) => e.kind === 'hop')).toBe(true);
    expect(next.find((e) => e.kind === 'start')).toEqual({ kind: 'start', bout: 1 });
    expect(s.phase).toBe('play');
    startSpots().forEach(([x, z], i) => {
      expect(s.dinos[i].body.x).toBeCloseTo(x, 1);
      expect(s.dinos[i].body.z).toBeCloseTo(z, 1);
      expect(s.dinos[i].state).toBe('ok');
    });
  });

  it('the rim: a slow push teeters; mashing hops back in; doing nothing falls; a bump on a teetering dino tips it', () => {
    const rim = (): SumoState => {
      const s = setup();
      s.dinos[0].body.x = 0;
      s.dinos[0].body.z = -(RING.r - 0.05);
      s.dinos[0].body.vz = -1.5;
      return s;
    };
    const a = rim();
    const ev = run(a, 3, still);
    expect(ev.some((e) => e.kind === 'teeter' && e.dino === 0)).toBe(true);
    // Mash: a tap every 4 frames, pushing back in.
    const rand = rng(3);
    const out: SumoEvent[] = [];
    let recovered = false;
    for (let i = 0; i < 60 * TEETER.seconds && !recovered; i++) {
      stepSumo(a, 1 / 60, { rand, input: { x: 0, z: 1, sprint: false, swing: i % 4 === 0 } }, out);
      recovered = out.some((e) => e.kind === 'recover' && e.dino === 0);
    }
    expect(recovered).toBe(true);
    expect(isOut(a.dinos[0].body.x, a.dinos[0].body.z)).toBe(false);

    const b = rim();
    const fell = run(b, 60 * (TEETER.seconds + 0.5), still, 4, (e) => e.kind === 'out');
    expect(fell.some((e) => e.kind === 'out' && e.dino === 0)).toBe(true);

    const c = rim();
    run(c, 3, still);
    c.dinos[1].body.x = 0.1;
    c.dinos[1].body.z = -(RING.r - 1.5);
    c.dinos[1].body.vz = -3;
    const tipped = run(c, 30, still, 5, (e) => e.kind === 'out');
    expect(tipped.find((e) => e.kind === 'out')).toEqual({ kind: 'out', dino: 0, by: 1 });
  });

  it('two charges meeting head on bonk both back', () => {
    const s = setup();
    s.dinos[1].body.x = s.dinos[0].body.x + 1.6;
    for (const [i, dir] of [
      [0, 1],
      [1, -1],
    ] as const) {
      s.dinos[i].swing = DASH.seconds;
      s.dinos[i].dashX = dir;
      s.dinos[i].dashZ = 0;
    }
    const all = run(s, 30, still, 4);
    expect(all.some((e) => e.kind === 'bonk')).toBe(true);
  });

  it('a braced friend is shoved much less and the charger bounces back', () => {
    const shove = (brace: boolean): number => {
      const s = setup();
      s.dinos[1].body.x = s.dinos[0].body.x + 2;
      if (brace) s.dinos[1].brace = 5;
      run(s, 1, { x: 1, z: 0, sprint: false, swing: true }, 3);
      let vx = 0;
      const rand = rng(3);
      for (let i = 0; i < 40; i++) {
        stepSumo(s, 1 / 60, { rand, input: still }, []);
        vx = Math.max(vx, s.dinos[1].body.vx);
      }
      return vx;
    };
    expect(shove(true)).toBeLessThan(shove(false) * 0.7);
  });

  it('weak-eye balloons soak everybody else (slow + slippery); plain ones splash dinos nearby; friends cannot pop weak ones', () => {
    const s = createSumo();
    s.phase = 'play';
    s.balloons.forEach((b) => (b.kind = 'none'));
    s.balloons[0].kind = 'weak';
    s.balloons[0].grow = 1;
    s.balloons[8].kind = 'plain'; // far side: out of reach
    s.balloons[8].grow = 1;
    const me = s.dinos[0];
    me.body.x = s.balloons[0].x - 0.3;
    me.body.z = s.balloons[0].z;
    me.body.vx = me.body.vz = 0;
    for (const d of s.dinos.slice(1)) d.think = 99;
    const all = run(s, 30, { x: 1, z: 0, sprint: false, swing: true }, 2);
    expect(all.find((e) => e.kind === 'pop')).toMatchObject({ dino: 0, slot: 0, weak: true });
    expect(s.weakPops).toBe(1);
    for (const d of s.dinos.slice(1)) expect(d.wet).toBeGreaterThan(0);
    expect(me.wet).toBe(0);
    expect(s.balloons[8].kind).toBe('plain');

    // A friend charging right under a weak balloon does not pop it (they can't see it).
    const s2 = createSumo();
    s2.phase = 'play';
    s2.balloons.forEach((b) => (b.kind = 'none'));
    s2.balloons[0].kind = 'weak';
    s2.balloons[0].grow = 1;
    const f = s2.dinos[1];
    f.body.x = s2.balloons[0].x;
    f.body.z = s2.balloons[0].z;
    f.swing = DASH.seconds;
    stepSumo(s2, 1 / 60, { rand: rng(2), input: still }, []);
    expect(s2.balloons[0].kind).toBe('weak');
  });

  it('a soaked dino is shoved further', () => {
    const shove = (wet: boolean): number => {
      const s = setup();
      s.dinos[1].body.x = s.dinos[0].body.x + 2;
      if (wet) s.dinos[1].wet = 5;
      run(s, 1, { x: 1, z: 0, sprint: false, swing: true }, 3);
      let vx = 0;
      const rand = rng(3);
      for (let i = 0; i < 40; i++) {
        stepSumo(s, 1 / 60, { rand, input: still }, []);
        vx = Math.max(vx, s.dinos[1].body.vx);
      }
      return vx;
    };
    expect(shove(true)).toBeGreaterThan(shove(false) * 1.1);
  });

  it('a charge that lunges on the weak-eye beat is a super charge (bigger shove); off the beat it is not', () => {
    expect(beatPhase(0)).toBe(0);
    expect(isPerfect(BEAT.period - 0.05)).toBe(true);
    expect(isPerfect(BEAT.period * 0.5)).toBe(false);
    const shove = (lungeAt: number): { vx: number; perfects: number } => {
      const s = setup();
      s.dinos[0].body.x = -1;
      s.dinos[1].body.x = 1;
      s.beat = lungeAt - DASH.windup - 1 / 60;
      run(s, 1, { x: 1, z: 0, sprint: false, swing: true }, 3);
      let vx = 0;
      const rand = rng(3);
      for (let i = 0; i < 50; i++) {
        stepSumo(s, 1 / 60, { rand, input: still }, []);
        vx = Math.max(vx, s.dinos[1].body.vx);
      }
      return { vx, perfects: s.perfects };
    };
    const on = shove(BEAT.period * 3 - 0.12);
    const off = shove(BEAT.period * 3 + 0.5);
    expect(on.perfects).toBe(1);
    expect(off.perfects).toBe(0);
    expect(on.vx).toBeGreaterThan(off.vx * 1.15);
  });

  it('a child who tries gets a real contest: 30 s or more of play, usually wins, and the friends score too', () => {
    let wins = 0;
    let long = 0;
    let friendPoints = 0;
    let reacts = 0;
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    for (const seed of seeds) {
      const { s, events } = play(seed, kid);
      expect(s.phase).toBe('over');
      for (const d of s.dinos) expect(Math.hypot(d.body.x, d.body.z)).toBeLessThanOrEqual(RING.mat + 1e-6);
      if (playerRank(s) === 1) wins++;
      if (s.played >= 30) long++;
      expect(s.played).toBeGreaterThanOrEqual(20);
      friendPoints += s.dinos.slice(1).reduce((a, d) => a + d.points, 0);
      reacts += events.filter((e) => e.kind === 'dodge' || e.kind === 'brace').length;
    }
    expect(wins).toBeGreaterThanOrEqual(6);
    expect(long).toBeGreaterThanOrEqual(8);
    expect(friendPoints).toBeGreaterThan(4);
    expect(reacts).toBeGreaterThan(seeds.length * 3);
  });

  it('a clumsy child still wins some rounds; one who stands still loses', () => {
    let clumsyWins = 0;
    for (let seed = 1; seed <= 12; seed++) if (playerRank(play(seed, clumsy).s) === 1) clumsyWins++;
    expect(clumsyWins).toBeGreaterThanOrEqual(3);
    let losses = 0;
    for (const seed of [9, 10, 11, 12]) {
      const { s, events } = play(seed, () => still);
      expect(events.filter((e) => e.kind === 'windup').length).toBeGreaterThan(3);
      expect(events.some((e) => e.kind === 'out')).toBe(true);
      if (playerRank(s) > 1) losses++;
    }
    expect(losses).toBeGreaterThanOrEqual(3);
  });
});
